# PROJECT INDEX — fast-pos

> Agent-generated map (2026-10-22, updated after deployment modes + installer + BOM inventory work). Trust code over this file; update it after major changes. Paths are relative to repo root.

## Identity

Arabic RTL POS system for a restaurant + cafe on a LAN (iPads → Windows server mini-PC), installable as a Windows service, with two deployment modes (`full` restaurant+cafe, `counter` cashier-only quick sale) and BOM-based ingredient inventory.
**Stack:** Next.js 16 App Router + React 19, Tailwind v4 + DaisyUI, better-sqlite3 + Drizzle ORM (synchronous, `data/pos.db`), jose JWT sessions, ESC/POS thermal printing, offline Ed25519 licensing, standalone Next output packaged by Inno Setup.
**Venues:** `restaurant` | `cafe` (both, shared staff/menu possible; counter mode = restaurant only). Currency `د.ل`. Business clock = Africa/Tripoli. Fully Arabic UI, RTL.

⚠️ **Next.js here is non-stock** (per `AGENTS.md`) — read `node_modules/next/dist/docs/` before framework-level code. Server components + async `params`/`searchParams` Promises, server actions in `"use server"` files, `revalidatePath` for freshness (no client fetch except login/API routes).

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | dev server on `0.0.0.0:3000` |
| `npm run build` | prebuild copies public key → `data/license-public.pem`, cleans `.next`, then next build |
| `npm start` | prod server `0.0.0.0:3000` |
| `npm test` | vitest run |
| `npm run license` | `scripts/license.mjs` keygen/issue CLI |
| `npm run license:gui` / `license:gui:build` | Python Tkinter license generator / EXE build |
| `npm run installer:build` | `scripts/build-installer.ps1`: build standalone payload + portable Node + WinSW → Inno Setup EXE in `release/installer` |

Node: `^22.13 || ^24` (`.nvmrc` = 24). `SESSION_SECRET` env required in production (JWT signing). Installer build needs Windows PowerShell 5.1, Inno Setup 6+ (`ISCC.exe`), and network access for npm; the script can download portable Node unless `-NodeDir` is supplied.

## Routes (pages)

| Route | File | Guard / notes |
|---|---|---|
| `/` | `app/page.tsx` | venue picker card; admin→`/admin`; shows activation warning |
| `/pin/[venue]` | `app/pin/[venue]/page.tsx` | staff PIN entry (client `PinPad` → POST `/api/auth/pin`) |
| `/pin/[venue]/change-pin` | | self PIN change |
| `/waiter/[venue]` | | floor: tables grid, open/occupied states |
| `/waiter/[venue]/order/[id]` | | order editor (`OrderMenu`), kitchen confirm, preview receipt |
| `/cashier/[venue]` | | open invoices list; quick-sale entry; main-cashier links |
| `/cashier/[venue]/order/[id]` | | cashier order view + pay buttons |
| `/cashier/[venue]/quick` | | quick sale board (cashier) |
| `/cashier/[venue]/sales` | | cashier's paid orders (today/yesterday/week/date), reprints |
| `/cashier/[venue]/items`, `/tables` | | main-cashier only: availability toggle, table mgmt |
| `/cashier/[venue]/shift` | | main-cashier only: X/Z panel |
| `/admin/login` | `app/admin/login/page.tsx` | username/password → POST `/api/auth/admin` |
| `/admin/(panel)/*` | layout enforces admin | dashboard, `items`, `tables`, `staff`, `printers`, `inventory`, `suppliers`, `purchases`(+`[id]`), `invoices`(+`[id]`), `reports`, `z-reports`, `cancelled-items`, `audit`, `settings`, `activation` |

Guards: `requireSession/requireAdmin/requireWaiter/requireCashier/requireMainCashier` in `app/actions/auth.ts` (redirect-based). Non-admin sessions are refused entirely when license inactive (`lib/auth/session.ts`). In counter mode (`lib/deployment.ts`): waiter routes redirect to PIN, PIN API rejects waiters and non-active venues, home shows only the restaurant, `/admin/tables` + waiter staff UI are hidden, and staff land on `/cashier/restaurant/quick`.

## Server actions (`app/actions/`)

- **`orders.ts`** (largest): `openTableOrder`, `addItemToOrder`, `updateOrderItemQty/Note`, `cancelPrintedOrderItem` (main cashier + VOID ticket), `confirmKitchenOrder` (prints pending kitchen lines, updates `kitchenSentQty`), `payOrder`, `payQuickSale` (txn insert → kitchen → mark paid → receipt; never deletes sale on print failure), `reprintOrderReceipt`, `printOpenOrderReceipt`/`printQuickSalePreview` (pre-pay receipt), `cancelOpenOrder`.
- **`shifts.ts`**: `printShiftXReport`, `closeShiftWithZReport` (print-first, then `recordZClose`; Z window + once-per-window checks), `reprintLastZReport`, `adminReprintZReport`.
- **`admin.ts`**: CRUD upsert/activate/delete for categories (shared merge by name), items (bulk ops; `upsertItem` parses hidden `ingredientsJson` and transactionally replaces BOM rows; item deletes remove BOM rows), tables, staff (PIN rules), printers (`connectionType`, `role` kitchen/checkout/both; dedupe by host:port; `syncCheckoutStation`); `testPrinter`; `factoryResetDatabase` (password + options via `lib/db/reset.ts`); receipt footer & Z-window settings; `changeAdminPassword`.
- **`invoices.ts`**: admin add/remove item, qty, cancel/restore invoice (even paid) — all audited; paid edits/cancel/restore also apply BOM inventory deltas (best-effort, never blocks the invoice operation).
- **`inventory.ts`**: ingredient CRUD/activate/delete (delete blocked when referenced by BOM, movements, or purchases), supplier CRUD/activate/delete (blocked when invoices exist), manual `adjustIngredientStock`, `createPurchaseInvoice` (transactional receive + stock + ledger, audited).
- **`reports.ts`**: `printReportSummary` (network ESC/POS or browser HTML).
- **`station.ts`**: `getCashierStationContext(venue)` → active `cashier_stations` row or first active checkout printer.
- **`activation.ts`**: activate/deactivate license (admin).

## API routes (`app/api/`)

- `auth/pin` POST — staff login; duplicate-PIN → `needUserPick` candidates list; 423 when not activated.
- `auth/admin` POST — admin login. `auth/logout` POST — clears cookie.
- `settings/receipt-logo` GET/POST/DELETE — logo upload (PNG/JPG/WebP/GIF ≤5MB → `data/receipt-logo.png`, canvas-normalized).
- `admin/menu/export` / `import` — ExcelJS workbook of menu.

## lib/ map

- **`db/`**: `index.ts` (connection + hand-rolled `ensureSchema()` migrations + seed lock + WAL), `schema.ts` (all tables + relations + six inventory tables), `seed.ts` (demo seed for dev; factory seed per deployment mode), `reset.ts` (menu + inventory options), `floor-tables.ts` (name sort), `migrate-*.ts`, `dedupe-shared-categories.ts`.
- **`deployment-mode.ts`** (pure): mode parsing/labels, `data/deployment.json` path/read, `FACTORY_CASHIER_PIN`, `staffLandingPath`. **`deployment.ts`** (DB): cached `getDeploymentMode()` bootstrapped from the file, `isCounterMode()`, active venues, landing path.
- **`inventory/`**: `rules.ts` (pure grams math/consumption/insufficiency/labels), `core.ts` (injectable `{db,sqlite}` ledger: purchase receive, consume on pay, cancel return, restore reconsume, invoice-edit deltas, manual adjust — all transactional), `service.ts` (binds core to app DB), `rules.test.ts`, `core.test.ts`.
- **`auth/`**: `token.ts` (jose HS256 JWT, 7d), `cookie.ts`/`cookie-options.ts` (httpOnly, lax, `COOKIE_SECURE` opt-in), `session.ts` (`getSession` — revalidates user + license gate), `pin.ts` (normalize Arabic digits, bcrypt, duplicate checks), `rate-limit.ts` (**dead code** — rate limiting removed in commit 2547d4e).
- **`activation/`**: `service.ts` (`getActivationStatus` — states trial/licensed/expired/invalid/unlicensed; `canOperate` gate; `pos_activation` table created lazily), `license-core.mjs` (payload/token create+verify, Ed25519, strict shape), `license.test.ts`.
- **`print/`**: `network.ts` (raw TCP :9100, wake-up pre-connection, 3 retries, chunked writes), `escpos.ts` (all ticket builders; Arabic→raster via `text-raster.ts` + `encoding.ts`), `receipts.ts` (data types + HTML receipts), `checkout-bytes.ts`, `logo.ts` (ESC/POS raster logo), `resolve-kitchen-printer.ts` (item→category→venue fallback), `test-bytes.ts`, `finish-checkout-print.ts` (client, browser print).
- **`orders/`**: `rules.ts` (pure business rules — kitchen-pending math, cancel permissions, pay notices), `workflow.test.ts`, `category-snapshot.ts`.
- **`shifts/core.ts`**: Z-close ledger queries, `buildDayReportData` (X/Z), reprints, `recordZClose`.
- **`reports/`**: `summary.ts` (filtered sales aggregates), `filters.ts` (date parsing), `groups.ts` (hardcoded cafe/restaurant report group names).
- **`menu/`**: `scope.ts` (shared/venue visibility), `excel.ts` (import/export).
- **`settings.ts`**: `app_settings` KV — receipt footer, per-venue Z window (default 23:00→01:00, overnight-capable).
- **`time/tripoli.ts`**: Tripoli wall-clock formatting (`YYYY-MM-DD HH:MM:SS` SQL strings; string-compared ranges).
- misc: `audit.ts` (audit_events kinds + labels), `printers.ts` (role helpers/filters), `venues.ts` (names, money/date fmt), `types.ts`, `admin-venue.ts`.

## Components (`components/`)

- Flow cores: `OrderMenu` (waiter/cashier order editor; uses `CategoryItemPicker`, `PosTicket`, `CancelKitchenItemDialog`, `KitchenNoteDialog`), `QuickSaleBoard`, `PinPad`, `CashierShiftPanel`, `PosTicket` (cart panel).
- Buttons: `OpenTableButton`, `KitchenConfirmButton`, `PayButtons`, `PreviewReceiptButton`, `ReprintReceiptButton`, `ReprintKitchenButton`, `CancelTableButton`, `TestPrintButton`, `PrintReportButton`, `AdminReprintZButton`.
- Admin: `admin/ItemsAdmin` (item modal now has the BOM editor; passes `ingredientsJson`), `PrintersAdmin`, `StaffAdmin`, `TablesAdmin`, `IngredientsAdmin` (stock + adjust + movements filter), `SuppliersAdmin`, `PurchaseInvoicesAdmin` (dynamic line rows + live totals), `InvoiceEditor`, `MenuExcelBar`, `ReceiptLogoSettings`, `ReceiptSettingsForm`, `ZWindowSettingsForm`, `SettingsDangerZone` (factory reset), `AdminModal` (`wide` variant), `ToggleActiveButton`, `DeleteConfirmButton`, `ChangeAdminPasswordForm`.
- Shell: `PosHeader`, `AdminNav`, `VenueTabs`, `LogoutButton`, `ToastProvider` (`useToast`), `ActionFeedback`, `ConfirmSheet`, `ChangePinForm`, `FactoryResetPanel`, `useDragScroll`.
- Cashier: `cashier/ItemAvailabilityBoard`.

## Data model essentials

Tables: `venues, users, categories, items, tables, printers, cashier_stations, shifts, orders, order_items, cancelled_items, audit_events, app_settings` (+ lazy `pos_activation`) + inventory: `ingredients, suppliers, purchase_invoices, purchase_invoice_lines, item_ingredients, ingredient_movements`.

- **Menu scope:** `categories.venueId`/`items.venueId` NULL = shared across venues (`availableAtVenue()` in `lib/menu/scope.ts`). Shared categories use `restaurantKitchenPrinterId`/`cafeKitchenPrinterId`.
- **Snapshots:** `order_items` stores `itemName`, `categoryName`, `unitPrice` at sale time → reports survive menu edits/deletes (`item_id` nulled on item delete).
- **Kitchen tracking:** `order_items.kitchenSentQty` — cannot reduce/delete below sent qty; only main cashier can cancel sent lines (writes `cancelled_items` + kitchen VOID ticket).
- **Inventory:** stock is integer **grams** (`ingredients.stockGrams`, may go negative). `item_ingredients` = grams per sold unit. `ingredient_movements` is an append-only ledger (`purchase|sale|adjust|invoice_edit|cancel_return`) with name snapshots. Net per order controls idempotency: consumption is skipped when net < 0; cancel returns −net; restore re-consumes. Purchase invoices store line snapshots and entered unit (`g`/`kg`). Insufficient stock only produces warnings/audits — payment is never blocked.
- **Migrations:** hand-rolled, idempotent, run on every boot in `lib/db/index.ts` (`ensureSchema` + try/catch ALTERs + best-effort backfills/cleanups). No drizzle-kit runtime migrations.
- **Roles:** users.role admin|waiter|cashier; `isMainCashier` flag (≥1 active enforced by backfill); staff `venueId` always NULL (work anywhere).

## Printing

Kitchen tickets: network ESC/POS to category/item-resolved printer, chunked; `kitchenSentQty` updated only for successes; partial failure returns warning, order survives.
Checkout receipt: `printer.connectionType` — `network` → ESC/POS bytes; `local` → server returns receipt HTML → client opens Chrome print dialog (`finish-checkout-print.ts`). X/Z and test prints: network only.
**`tools/cashier-print-agent` (port 9288) is legacy/unused** by app code (README still documents it — stale).

## Deployment modes & installer

- Mode lives in `data/deployment.json` and is mirrored in `app_settings.deployment_mode`; resolved by `lib/deployment.ts` (cached, file bootstraps DB). `full` = restaurant + cafe + tables/waiters; `counter` = restaurant only, cashier-only quick sales, no tables/waiters/cafe. Changing mode requires reinstall.
- Factory seed (`lib/db/seed.ts`): when `data/deployment.json` exists (installed systems), seeds clean production data — admin/admin123, full menu, placeholder printers + checkout station, main cashier `كاشير` PIN `2580`, no demo staff/orders. Without the file, dev falls back to full mode with the rich demo seed. Login PINs 1111…6666 are dev-only.
- Installer assets: `installer/fast-pos.iss` (Inno Setup 6+ script, Arabic wizard, mode page, upgrade detection), `scripts/build-installer.ps1` (standalone build + payload assembly + ISCC), `installer/service/FastPOS-service.xml` (WinSW), `installer/vendor/winsw/FastPOS-service.exe`, `installer/bin/*.cmd` (start/stop/restart/status/console/open/install-service), `installer/README-FIRST.txt`.
- Payload layout: `{app}\server` (standalone `server.js`, `.next`, static, public), `{app}\node` (portable Node 24 x64), `{app}\bin`, `{app}\service`, `{app}\fast-pos.env`, license public key only. WinSW runs `{app}\node\node.exe server.js` with cwd `{app}\server` (DB at `{app}\server\data\pos.db`), PORT 3000, logs in `{app}\logs`. Installer adds `{app}\bin` to HKLM PATH, opens firewall TCP 3000, installs/starts the service. Upgrades skip the mode page and preserve `data\`.
- Build: `npm run installer:build` (options `-ISCCPath`, `-NodeDir`, `-NodeVersion`, `-SkipNpm`). Output `release\installer\Fast-POS-Setup-<version>.exe`. `.next/standalone` tracing excludes `data/**` (`next.config.ts`). Verified on Windows 10 with Inno Setup 7 (2026-10-22): compile, silent install (full mode), WinSW service startup, admin/PIN login, upgrade preserving `data/`, and uninstall cleanup. Run a final smoke test in a clean VM before shipping.

## Inventory (BOM)

1. `/admin/inventory` → add ingredients + optional low-stock threshold (stock starts at 0).
2. `/admin/suppliers` → suppliers; `/admin/purchases` → purchase invoice lines (kg/g, unit price) → stock increment + `purchase` movements.
3. `/admin/items` item modal → BOM rows (ingredient + grams per unit), saved through `ingredientsJson`.
4. Payment (`payOrder`/`payQuickSale`) consumes stock (`sale` movements); insufficient stock returns a warning toast + audit but never blocks payment (D2).
5. Paid invoice add/qty edits write `invoice_edit` deltas; cancel writes `cancel_return`; restore re-consumes. Manual adjustments write `adjust`.
6. Deletes: ingredient blocked if referenced by BOM/movements/purchases; supplier blocked if it has invoices; purchase invoices have no delete (V1).

## Z/X & time

`shifts` = per-venue Z-close ledger (rows only created closed by `recordZClose`; no staff shifts; `orders.shiftId` always NULL on pay — vestigial). X = paid orders since last Z; Z only inside per-venue window (settings, default 23:00→01:00) and once per window; print-first, record after success. Reprints rebuild periods from `shifts.closedAt` chain.

## Licensing

`pos_activation` row 1: install UUID + trial start + token. Trial 7 days from first boot. Token: `base64url(payload).base64url(Ed25519 sig)`, bound to install UUID, `expiresOn` UTC date. Public key from `ACTIVATION_PUBLIC_KEY_FILE` env or `data/license-public.pem` (copied at build). Inactive license → staff sessions null, PIN login 423, admin still works. Issuing: `scripts/license.mjs` or Python GUI (embeds encrypted private key in EXE).

## Env vars

`SESSION_SECRET` (required prod), `ACTIVATION_PUBLIC_KEY_FILE`, `ACTIVATION_PUBLIC_KEY`, `COOKIE_SECURE` (only for HTTPS).

## Gotchas

- Dead code: `lib/auth/rate-limit.ts` (+ its test) — throttling deliberately removed from PIN/admin login.
- Next.js is modified — check `node_modules/next/dist/docs/` (01-app/02-pages/03-architecture) before API usage.
- All timestamps are Tripoli SQL strings compared as strings (`lib/time/tripoli.ts`, `formatPrintTimestamp`).
- Report group names are hardcoded in `lib/reports/groups.ts` (cafe vs restaurant lists).
- `upsertCategory` merges same-named shared categories (moves items, remaps historical `order_items.itemId`).
- `payQuickSale` kitchen failure → order stays paid, warning surfaced; reprint from sales page.
- Seed/demo logins: admin/admin123, staff PINs 1111…6666 (dev only; factory seed uses PIN 2580 for the main cashier).
- Factory reset `ResetOptions` now includes `inventory`; resetting inventory also clears `item_ingredients` (BOM) even when menu is kept.
- Inventory insufficiency is warning-only by design (D2). `consumeForPaidOrder` is idempotent via the ledger net per order; invoice-edit hooks call it before mutating lines so legacy unconsumed paid orders get a correct baseline.
- Tests: vitest + jsdom — `lib/**/*.test.ts(x)` (including `lib/inventory/rules.test.ts`, `lib/inventory/core.test.ts`) + `components/PinPad.test.tsx`.
- New inventory tables are duplicated in `schema.ts`, `ensureSchema()`, reset DDL, and test DDL — keep all four in sync.
