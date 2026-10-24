# PLAN.md — fast-pos Major Updates: Deployment Modes + Installer + BOM Inventory

> **Status:** Approved 2026-10-22 · **Not yet implemented** — this document is the build order.
> **Audience:** An AI agent (or developer) picking this up with **zero conversation context**.
> **Read first:** `PROJECT_INDEX.md` (repo root) — full codebase map: stack, routes, actions, schema semantics, gotchas.
> **Warning:** This Next.js 16 install is **modified** (per `AGENTS.md`). Before using any framework API, check `node_modules/next/dist/docs/`. Server components + async `params` Promises + server actions + `revalidatePath` are the established patterns — follow them.

---

## 0. Locked decisions (user-confirmed — do NOT re-litigate)

| # | Decision |
|---|----------|
| D1 | **Counter mode is cashier-only**: no waiters, no dining tables, no cafe venue. Staff PIN login goes to cashier quick-sale flow. |
| D2 | **Insufficient ingredient stock never blocks payment**: sale completes, stock may go negative (shown in red), cashier sees a warning toast, audit entry recorded. |
| D3 | **Server auto-start = Windows service** via bundled WinSW wrapper (starts on boot before login, auto-restart on crash). |
| D4 | **Installed systems seed clean production data**: admin (`admin`/`123`) + full menu + placeholder printers + **one main cashier PIN `2580`** (shown in installer finish page). NO demo staff, NO sample orders, NO PINs 1111–6666 on installed systems. Dev (`npm run dev`, no `data/deployment.json`) keeps today's rich demo seed unchanged. |
| D5 | **Ingredient consumption happens at payment** (`status → paid`), not at order creation or kitchen send. |
| D6 | **Installer bundles a portable Node.js runtime** (win-x64). Target machine needs zero prerequisites (Win10+ x64 only). |

**Build order: A (deployment modes) → B (installer) → C (BOM/inventory) → docs.** A must land before B because the installer writes the mode file the seeding reads. B before C is only chronological — rebuild the installer after C via the same script.

---

## 1. Key exploration findings (facts you need — already verified)

### Seeding (`lib/db/seed.ts`, 727 lines)
- `seedIfNeeded(db)` runs when `venues` table is empty; called from `lib/db/index.ts:53` under a `data/.seed.lock` PID lock; skipped when `NEXT_PHASE === "phase-production-build"`.
- `seedFactoryDatabase(db)` exists at seed.ts:56 — **currently dead code** ("admin only, full menu, no sales") — natural hook for the factory/installer seed.
- Creation order (FK dependency): venues → users → printers → cashier_stations → categories → items → tables → orders → order_items. Cafe-specific pieces to make conditional: cafe venue row (seed.ts:69), cafe printers (:173–195), cafe station (:216–220), `seedVenueMenu("cafe", …)` (:424), cafe tables loop (:434–444), all cafe sample orders (:525–617). Demo waiters: :84–102, :120–126. The single `cafeMenu` array (~120 items, 7 categories) is venue-agnostic and cloned into both venues by `seedVenueMenu(venueId, kitchenId, drinksId)` (:382–422).
- Seeded printers use placeholder IPs `192.168.1.x` port 9100. **Selling requires an active cashier station or checkout printer per venue** (`getCashierStationContext`, `app/actions/station.ts`) — a seeded checkout printer + station is mandatory in every mode.
- A backfill in `lib/db/index.ts:484–504` guarantees ≥1 active main cashier exists.

### Schema sync rule (critical)
Table DDL lives in **three places** that must stay in sync: `lib/db/schema.ts` (drizzle), `ensureSchema()` in `lib/db/index.ts` (raw `CREATE TABLE IF NOT EXISTS` + try/catch `ALTER TABLE`), and the in-memory test DDL in `lib/orders/workflow.test.ts`-style DB tests. Also `lib/db/reset.ts` enumerates tables per reset option.

### Admin CRUD pattern to copy for new pages
`components/admin/StaffAdmin.tsx` + `app/admin/(panel)/staff/page.tsx` (global list) or `PrintersAdmin.tsx` + `printers/page.tsx` (venue tabs). Pattern: server page `await requireAdmin()` → sync drizzle query → serializable props → client component with `AdminModal` (DaisyUI dialog, `open/title/onClose/pending`), single `<form>` with uncontrolled inputs + `defaultValue`, `FormData` → `upsertX(formData)` server action, typed args for toggles/deletes (`setXActive(id, bool)`, `deleteX(id)`), `ActionFeedback` in-modal errors, `useToast().showToast` for row actions, `ActionResult = { ok: true } | { error: string }`, `assertAdmin()`, Arabic error strings, `revalidatePath("/admin/<page>")` at the end. Delete-confirm = `DeleteConfirmButton`; toggle = `ToggleActiveButton`.
- Purchase-invoice list page: copy `app/admin/(panel)/invoices/page.tsx` (searchParams GET form, `limit(80)`, detail route `/admin/purchases/[id]`).
- Bulk ops use typed arrays (`deleteItems(ids)`) — see ItemsAdmin.

### Test patterns (vitest, jsdom; `vitest.config.mts` aliases `@` → root)
- Pure rules tests: `describe/it/expect` on pure functions, no DB (`lib/orders/rules.test.ts`).
- DB-backed tests: throwaway `new Database(":memory:")`, hand-written DDL mirroring production, drizzle wrap, `beforeEach` seed, `afterEach` close — never imports `@/lib/db` (`lib/orders/workflow.test.ts:14–171`). New tables must be added to that DDL style too.

### Standalone output (verified in this Next's own docs)
`output: "standalone"` supported: `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md` — creates `.next/standalone` with minimal `server.js`; `public/` and `.next/static/` must be copied manually; `PORT`/`HOSTNAME` env configure the listener; native asset remedy documented: `outputFileTracingIncludes: { '/*': ['node_modules/sharp/**/*', …] }` — apply the same for `better-sqlite3` and `@napi-rs/canvas` (both already in `serverExternalPackages`). `serverExternalPackages.md` confirms externals are file-traced.
- **cwd is king**: `data/pos.db`, `data/license-public.pem`, receipt logo all resolve from `process.cwd()` (`lib/db/index.ts:11–13`, `lib/activation/service.ts:76–78`). Run `server.js` with cwd = the standalone dir so `data/` persists next to it.

### Existing deployment script (legacy, partially reusable)
`scripts/install-windows.ps1` assumes repo + Node on machine, does npm install + build, stops an NSSM service named `FastPOS` if present (never creates it), no firewall/PATH/service/secret handling. The Inno installer replaces this model. `lib/auth/token.ts` **throws in production without `SESSION_SECRET`** — the launcher/service must set it.

---

## 2. Feature A — Deployment modes (`full` | `counter`)

### A1. New `lib/deployment.ts`
```ts
export type DeploymentMode = "full" | "counter";
export const SETTING_DEPLOYMENT_MODE = "deployment_mode";
getDeploymentMode(): DeploymentMode        // reads app_settings; bootstrap once from data/deployment.json; default "full"
isCounterMode(): boolean
activeVenueIds(): VenueId[]                // counter → ["restaurant"], full → both
writeDeploymentMode(mode)                  // persists to app_settings
```
Reuse the get/set helpers style from `lib/settings.ts` (sync `getSqlite()` KV). Bootstrap: if `app_settings` has no `deployment_mode` and `data/deployment.json` exists (installer-written `{"mode":"counter"|"full"}`), copy it in; cache in module scope. Note pages render after `lib/db` import seeds, so ordering is safe.

### A2. Mode-aware seeding (`lib/db/seed.ts`)
- Extend `SeedOptions` → `{ mode: "full" | "counter"; demo: boolean }`.
- `seedIfNeeded` (dev path, no deployment.json): `full` + `demo: true` — **current behavior unchanged**.
- Installer path (deployment.json present → mode known): factory variants, `demo: false`:
  - **full-factory**: both venues, admin, full menu cloned to both venues (existing `seedVenueMenu`), 6 placeholder printers + stations, dining tables (existing `floorTableNames`), 1 main cashier (كاشير) PIN `2580` `isMainCashier: true`. No demo waiters/orders.
  - **counter-factory**: `restaurant` venue only; admin; menu seeded once; 1 kitchen printer + 1 kitchen-drinks printer + 1 checkout printer + station; main cashier PIN `2580`. **No tables, no waiters, no cafe anything.**
- Both factory seeds call `writeDeploymentMode(mode)`.
- Keep FK ordering; keep the `seed lock` mechanism as-is.

### A3. Mode-aware UI gating
- `lib/venues.ts`: add `activeVenues(): typeof VENUES` filtered by `getDeploymentMode()`. Keep `VENUES` master list + `isVenueId` untouched (types/reports depend on them).
- `app/page.tsx`: loop `activeVenues()` instead of `VENUES` (one card in counter; copy/heading can switch on single-venue).
- Counter mode only:
  - `components/AdminNav.tsx`: hide the `/admin/tables` link (nav list at AdminNav.tsx:23–36).
  - `app/admin/(panel)/settings/page.tsx`: render one `ZWindowSettingsForm` (restaurant) instead of two (:53–60).
  - `components/admin/StaffAdmin.tsx`: hide the waiter role option.
  - `app/actions/auth.ts` `requireWaiter`: redirect to `/pin/${venueId}` when `isCounterMode()`.
  - `components/VenueTabs.tsx`: hide when only one venue (cosmetic).
- Admin settings page: read-only badge showing install mode (e.g. «مطعم كامل» / «كاونتر فقط»).

### A4. Tests
- `lib/deployment.test.ts` — pure parts (mode parse, venue filter).
- Seed test: in-memory DDL pattern; assert counter seed creates restaurant-only, no tables, no waiters, has cashier PIN 2580, mode persisted in app_settings.

---

## 3. Feature B — Inno Setup installer

### B1. `next.config.ts`
Add:
```ts
output: "standalone",
outputFileTracingIncludes: {
  "/*": ["node_modules/better-sqlite3/**/*", "node_modules/@napi-rs/canvas/**/*"],
},
```
`prebuild` already wipes `.next` each build (fine — standalone rebuilt). Dev/`next start` unaffected.

### B2. `scripts/build-installer.ps1` (new) + `package.json` script `"installer:build"`
Steps:
1. Locate `ISCC.exe` (Inno Setup compiler): `-ISCCPath` param → PATH → common install dirs. Clear Arabic+English error if missing (download URL: jrsoftware.org/isinfo.php).
2. `npm ci` then `npm run build` (prebuild copies license public key to `data/license-public.pem`).
3. Assemble `build/installer-payload/`:
   - `server/` ← copy `.next/standalone/*`; then `.next/static` → `server/.next/static/`; `public` → `server/public/`; `data/license-public.pem` → `server/data/`.
   - `node/` ← portable Node win-x64 (`-NodeDir` param pointing at extracted zip; else download pinned Node 24 LTS zip).
   - `bin/fast-pos-start.cmd | stop | restart | status.cmd` → `sc`/WinSW controls; also `fast-pos-console.cmd` manual run: `cd server && ..\node\node.exe server.js` with `PORT=3000 HOSTNAME=0.0.0.0`.
   - `FastPOS-service.exe` (WinSW x64, MIT — vendor the binary under `installer/vendor/winsw/` in the repo) + `FastPOS-service.xml`: executable `node\node.exe`, arguments `server\server.js`, workingdir `{app}\server`, `<env name="PORT">3000</env>`, `<env name="HOSTNAME">0.0.0.0</env>`, `<env name="SESSION_SECRET">…</env>`, `onfailure action="restart"`.
   - Generate random `SESSION_SECRET` (e.g. `[Convert]::ToBase64String((1..32|%{Get-Random -Max 256}))`) → `fast-pos.env` + inject into the service xml. **Required** — `lib/auth/token.ts` throws in prod without it.
4. Run ISCC: `ISCC.exe /DPayloadRoot=… /DAppVersion=<package.json version> installer\fast-pos.iss` → output `release/installer/Fast-POSSetup-<ver>.exe`.

### B3. `installer/fast-pos.iss`
- `[Setup]`: AppName "Fast POS", DefaultDirName `{autopf}\Fast POS`, PrivilegesRequired admin, `ChangesEnvironment`, version from define, Arabic (or bilingual) wizard labels, uncompressed-from-`PayloadRoot` files.
- `[Files]`: payload recursively (`ignoreversion recursesubdirs createallsubdirs`); `server\data\*` templates with `onlyifdoesntexist`; DB files (`server\data\pos.db*`, WAL/SHM) marked `uninsneveruninstall` so upgrades/uninstall preserve data.
- Custom wizard page (Pascal `[Code]`, after install-dir page): radio **«مطعم كامل مع طاولات وكافيه» (full)** vs **«مطعم كاونتر بسيط — بدون طاولات» (counter)**; store choice; in `CurStepChanged(ssInstall)`/NextButtonClick write `server\data\deployment.json` = `{"mode":"counter"}` or `{"mode":"full"}` (create dir first).
- PATH: `[Registry]` append `{app}\bin` to `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment\Path` with the classic `Check: NeedsAddPath('{app}\bin')` function + `ChangesEnvironment` for broadcast.
- Firewall: `[Run]` `netsh advfirewall firewall add rule name="Fast POS" dir=in action=allow protocol=TCP localport=3000` (and delete on uninstall `[UninstallRun]`).
- Service: `[Run]` (postinstall, checked): `{app}\FastPOS-service.exe install` then `start`; `[UninstallRun]`: stop + uninstall service first. Stop the service before file copy on upgrades (`CurStepChanged`).
- Shortcuts: desktop/Start-menu "Fast POS" → `{app}\bin\fast-pos-open.cmd` (opens `http://localhost:3000` in default browser, waits for port).
- Finish page / postinstall memo: credentials — admin `admin`/`123` (change on first login), cashier PIN `2580`, LAN URL `http://<server-ip>:3000`.

### B4. Verify
Build, then on a Windows VM: install **counter** → service runs, PATH commands work, firewall rule exists, first boot seeds restaurant-only/no tables, POS usable with PIN 2580; install **full** → both venues + tables. Reinstall over existing → `pos.db` preserved (activation state intact — license row must survive upgrades).

---

## 4. Feature C — BOM / ingredients inventory (units: grams/kilograms)

### C1. Schema (add to `lib/db/schema.ts` + `ensureSchema()` + reset + test DDL — all in sync)
```sql
CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  stock_grams INTEGER NOT NULL DEFAULT 0,        -- base unit = grams (int); display g/kg
  low_stock_grams INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT, notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER REFERENCES suppliers(id),
  invoice_number TEXT, note TEXT,
  total_cost REAL NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id),
  ingredient_id INTEGER REFERENCES ingredients(id),
  ingredient_name TEXT NOT NULL,               -- snapshot
  qty_grams INTEGER NOT NULL,
  unit_price REAL NOT NULL,                    -- per entered unit
  unit_basis TEXT NOT NULL DEFAULT 'kg',       -- 'g' | 'kg' (display fidelity)
  line_total REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS item_ingredients (  -- the BOM
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  grams_per_unit INTEGER NOT NULL,             -- grams per 1 sold unit
  UNIQUE(item_id, ingredient_id)
);
CREATE TABLE IF NOT EXISTS ingredient_movements (  -- ledger
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id INTEGER REFERENCES ingredients(id),
  ingredient_name TEXT NOT NULL,               -- snapshot
  delta_grams INTEGER NOT NULL,                -- +in / −out
  kind TEXT NOT NULL,                          -- purchase|sale|adjust|invoice_edit|cancel_return
  order_id INTEGER REFERENCES orders(id),
  invoice_id INTEGER REFERENCES purchase_invoices(id),
  user_id INTEGER REFERENCES users(id),
  user_name TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ingredient_movements_ingredient_idx ON ingredient_movements(ingredient_id);
CREATE INDEX IF NOT EXISTS ingredient_movements_order_idx ON ingredient_movements(order_id);
```
Drizzle relations + booleans as `integer({mode:"boolean"})` per house style. FKs have no `onDelete` — manual cleanup in actions (house style).

### C2. `lib/inventory/`
- `rules.ts` (pure, testable): `kgToGrams(v)`, `gramsToDisplay(g)` (`"350 غ"` / `"2.5 كغ"`), `computeConsumption(bomByItem: Map<itemId, {ingredientId, gramsPerUnit}[]>, lines: {itemId, qty}[]) → Map<ingredientId, grams>`, `findInsufficient(consumption, stockByIngredient) → {ingredientId, name, deficit}[]`, quantity clamps.
- `core.ts` (DB, always inside `getSqlite().transaction(...)` — stock + ledger written together):
  - `receivePurchaseInvoice({supplierId, invoiceNumber, note, lines, user})` → invoice + lines + `+purchase` movements + stock increment.
  - `consumeForPaidOrder(orderId, user)` → reads `order_items` + BOM, writes `−sale` movements, decrements stock. **Idempotent: skip if a `sale` movement already exists for the order.** Returns insufficiency warnings (if any occurred) for the caller to surface.
  - `returnForCancelledPaidOrder(orderId, user)` → `+cancel_return` restock (admin cancels a paid invoice).
  - `reconsumeForRestoredOrder(orderId, user)` → re-consume when a cancelled paid invoice is restored.
  - `adjustForInvoiceEdit(orderId, itemDeltaGrams, user)` → `invoice_edit` movements for admin add/qty-change on paid invoices (delta = newQty − oldQty per line).

### C3. Hooks (call sites)
- `payOrder` (`app/actions/orders.ts`, after the `status: "paid"` update ~:939–949) and `payQuickSale` (after its paid update ~:1188–1196): call `consumeForPaidOrder`; append any insufficiency warning to the returned `message` + `recordSessionAudit` (kind `inventory`, success true, warning detail). **Never block payment** (D2).
- `app/actions/invoices.ts`: `adminAddInvoiceItem` / `adminSetInvoiceItemQty` on **paid** orders → delta adjustments; `adminCancelInvoice` on paid → `returnForCancelledPaidOrder`; `adminRestoreInvoice` → to paid → `reconsumeForRestoredOrder`. Open-order edits and `cancelPrintedOrderItem` (pre-payment) → no stock effect.
- `lib/audit.ts`: add kinds `purchase`, `inventory` + Arabic labels («فاتورة مشتريات», «مخزون»).

### C4. Admin UI
- `app/actions/inventory.ts` (new `"use server"` file, house contract):
  - `upsertIngredient(formData)`, `setIngredientActive`, `deleteIngredient` (**blocked with message if referenced in any BOM or has movements** — safer than nulling FKs), `adjustIngredientStock(id, deltaGrams, note)` (manual `adjust`).
  - `upsertSupplier(formData)`, `setSupplierActive`, `deleteSupplier` (blocked if referenced by invoices; or null FK — prefer block).
  - `createPurchaseInvoice(payload: {supplierId?, invoiceNumber?, note?, lines: {ingredientId, qty, unitBasis, unitPrice}[]})` — normalizes qty→grams, computes totals, transactional `receivePurchaseInvoice`, audits. No invoice delete in V1.
- Pages (server, `requireAdmin`, sync drizzle):
  - `/admin/inventory` — stock table (name, stock g/kg, low-stock badge, negative red), manual-adjust button, movements list with date filter (reuse `lib/reports/filters.ts` helpers `normalizeFilterDateTime`/`defaultReportRange` pattern via searchParams).
  - `/admin/suppliers` — StaffAdmin-pattern CRUD.
  - `/admin/purchases` — invoice list (invoices-page pattern: search + limit) + `/admin/purchases/[id]` detail (supplier, lines w/ qty and costs, total, user).
  - `AdminNav` links (المخزون، الموردين، فواتير المشتريات).
- Components: `components/admin/IngredientsAdmin.tsx`, `SuppliersAdmin.tsx`, `PurchaseInvoicesAdmin.tsx` (+ detail), copying the StaffAdmin/PrintersAdmin pattern. Purchase form = modal with dynamic line rows (ingredient select, qty + unit select g/kg, unit price, live line totals + grand total in client state), submits typed payload.
- **BOM editor**: inside the ItemsAdmin **item modal** (`components/admin/ItemsAdmin.tsx:1018–1117`): dynamic rows `(ingredient select + grams input)`, state-managed, serialized to hidden `ingredientsJson` field (pattern of `CategoryScopePicker` hidden-field sync at :346). `upsertItem` (`app/actions/admin.ts:326–360`) parses JSON, validates (positive grams, existing ingredients, dedupe), replaces BOM rows transactionally. Items page passes `ingredients` + `bomByItem`; item modal shows current BOM on edit. `deleteItem`/`deleteItems` also delete `item_ingredients` rows for removed items.

### C5. Reset & factory panel
`lib/db/reset.ts`: `menu` option also deletes `item_ingredients`; new `inventory` boolean option deletes `ingredients, suppliers, purchase_invoices, purchase_invoice_lines, ingredient_movements`. Add to `FactoryResetOptions`, `SettingsDangerZone`/`FactoryResetPanel` checkbox (Arabic label «المخزون والمشتريات»).

### C6. Tests
- `lib/inventory/rules.test.ts` — pure math: conversions, consumption aggregation, insufficiency, formatting.
- `lib/inventory/core.test.ts` — in-memory DDL **including the six new tables**: purchase receive (+stock, +movements), pay consumption (−stock, idempotent on second call), negative allowed with warning result, admin qty edit delta, cancel-return restock, restore re-consume.

---

## 5. Wrap-up & Definition of Done

1. `npm test` green; `npm run build` succeeds.
2. `PROJECT_INDEX.md` updated (new routes/tables/subsystems/commands + remove stale bits).
3. `README.md`: installer section (build + install + modes + service + PATH commands), counter-mode description, inventory workflow (add ingredients → BOM on items → purchase invoice → consumption on sale).
4. Installer smoke on Windows for both modes; upgrade preserves `pos.db` + activation.
5. BOM end-to-end: purchase → set BOM → sell → stock decremented → negative case warns → admin edit adjusts → cancel returns.

### Out of scope V1 (do not build)
BOM in Excel import/export · low-stock badges on cashier tiles · per-venue inventory · stock valuation/COGS reports · purchase invoice deletion · scale/barcode integrations · switching mode after install (reinstall required).

### Known risks
- Standalone `data/` is cwd-relative → fixed by running `server.js` with cwd `{app}\server`.
- Three-place schema sync (schema.ts / ensureSchema / test DDL) + reset.ts.
- WinSW requires .NET Framework 4.6.1+ (present on all supported Win10/11 x64).
- Installer needs elevation (HKLM PATH + service + firewall) — `PrivilegesRequired=admin`.
- Default admin password ships as `admin/123` — finish-page instructs change (optional future: force-change flag).
