# Units & conversions — worklog

Date: 2026-10-24
Status: implemented, verified (typecheck + unit/integration tests + production build + browser UI)
Owner request: CRUD for units linked to items/ingredients, with conversion factors
(e.g. 1 kilo = 1000 g, buying 5 kilos adds 5000 g; user can add dozen, box, piece
for cheese slices / soda cans). Two further requested updates will follow after this.

## Approved decisions (user, 2026-10-24)

1. Resale menu items can track their own stock (no BOM in that case) — "Track item stock".
2. Box factor is fixed per unit record — create "box 12", "box 24", etc. as separate units.
3. Unit kinds v1 = weight + count only (no volume).

## Model as implemented

- `units`: `id, name, kind ('weight'|'count'), factor_to_base (integer >= 1), is_builtin, active, created_at`.
  Built-ins are immutable: غرام (weight 1), كيلو (weight 1000), حبة (count 1), دزينة (count 12).
  Base quantities are integer grams (weight) or pieces (count).
- `ingredients`: `preferred_unit_id` + `stock_base` + `low_stock_base`; display/input in preferred unit,
  storage always base.
- `items`: optional `unit_id` (sale/stock unit), `track_stock`, `stock_base`, `low_stock_base`.
  Tracked items cannot have BOM; BOM items cannot track own stock.
- `item_movements`: per-item stock ledger (`purchase|sale|adjust|invoice_edit`, `delta_base`, unit snapshot).
- `ingredient_movements`: `delta_base` (+ snapshot name; purchase `invoice_id`).
- `purchase_invoice_lines`: target is ingredient OR item, stores entered `qty`, `unit_id`,
  `qty_base`, and unit snapshot (`unit_name`, `unit_kind`, `factor_to_base`); `unit_price` is
  per entered unit, `line_total = qty * unit_price`.
- Purchase UI auto-selects target's preferred unit, filters compatible units by kind
  (a piece item never offers kilo), and shows base equivalent in invoice detail.
- Sales consume tracked item stock best-effort at payment; insufficient stock only warns
  (never blocks payment), warnings are audit-logged.
- Changing an item/ingredient unit or disabling tracking is blocked once stock or movements exist
  ("صفّر الرصيد أولاً").
- Units referenced by ingredients/items/purchase lines cannot be deleted or have their factor
  changed; they can be deactivated. Built-ins cannot be edited/deleted.
- Reset behavior: menu reset nulls item refs then deletes items; inventory reset clears
  ingredient/item movements, purchase lines/invoices, ingredients, and zeroes item stock.

## Implementation map

- Schema/migrations: `lib/db/schema.ts`, `lib/db/index.ts` (`ensureSchema`, `migrateUnits`).
  Legacy gram columns renamed in place (ingredients stock/low, movements delta, purchase qty,
  BOM qty) guarded by `units_v1` app setting; built-ins inserted idempotently; legacy purchase
  lines backfilled with g/kg snapshots.
- Rules: `lib/inventory/rules.ts` — `quantityToBase`, `baseToQuantity`, `formatQuantity`,
  `formatBaseQuantity`, `isLowStock`, `InsufficientStock`, BOM entries in `qtyBase`.
- Core: `lib/inventory/core.ts` — purchases with mixed targets/units, `adjustStock`,
  `adjustItemStock`, cancel/edit invoice stock reversal, sale consumption.
- Actions: `app/actions/units.ts` (admin CRUD + guards + audit), `app/actions/inventory.ts`,
  `app/actions/admin.ts` (item stock fields + unit guard), `app/actions/invoices.ts`.
- UI: `app/admin/(panel)/units/page.tsx` + `components/admin/UnitsAdmin.tsx`;
  items admin (`components/admin/ItemsAdmin.tsx`) track-stock + unit + threshold + stock column;
  inventory page (`app/admin/(panel)/inventory/page.tsx`, `IngredientsAdmin.tsx`) ingredients,
  tracked items, unified movements + manual adjust modal; purchases admin unit/target selector;
  nav entry "وحدات القياس" in `components/AdminNav.tsx`; inventory reset hint in `FactoryResetPanel.tsx`.
- Reset: `lib/db/reset.ts`.

## Verification (2026-10-24)

- `npx tsc --noEmit` — clean.
- `npm run test` — 17 files / 80 tests passed (in-memory SQLite DDL updated for units,
  item stock, movements, snapshots; added tracked-resale-item purchase/adjust/sale coverage).
- `npm run build` — succeeded; `/admin/units` present in route table.
- Browser UI (dev server port 3002; port 3000 was a stale build and was left untouched):
  - Units page shows 4 built-ins; created custom "صندوق 24" (count, factor 24), edited factor to 30,
    deleted it; usage counts updated (حبة=1 صنف، دزينة=1 بند، كيلو=1 مكوّن+1 بند) and built-ins stayed protected.
  - Created ingredient "لحم" in kilo with threshold 2 كيلو; created tracked item "كولا" in حبة with threshold 6.
  - Purchase invoice: 5 كيلو لحم @20 = 100.00 + 2 دزينة كولا @12 = 24.00 → total 124.00;
    invoice detail showed base equivalents 5 كغ / 24 حبة.
  - Inventory then showed لحم = 5 كيلو, كولا = 24 حبة; movement rows showed "+5 كيلو", "+2 دزينة".
  - Manual adjustment: كولا −1 دزينة → 12 حبة, movement "-1 دزينة" with note "جرد يدوي".
  - After verification, all test rows (unit, ingredient, item, invoice, movements, audit entries)
    were deleted; DB is back to 4 units / 0 ingredients / 0 tracked items / 0 purchases.
- Not exercised in browser: checkout sale deducting a tracked item (covered by tests), invoice
  edit/cancel stock reversal (covered by tests).

## Follow-ups

- Next two requested updates are still undisclosed; units work is finished and ready.
- Optional hardening: add a guard if an item has tracking history and the low threshold unit changes.

## Paused unrelated task

Uninstaller leaves `C:\Program Files\Fast POS` after uninstall even though data was
deleted. Evidence: folder CreationTime 10:32 on 2026-10-24, uninstall ~10:55,
reinstall 10:56; data files all recreated after reinstall; uninstaller hash matches
current build. Inno removes an empty app dir in a disposable lab, but `dirifempty
{app}` cannot succeed while `unins000.exe/.dat` exist. Likely final empty-dir cleanup
blocked by locked uninstaller files or a directory handle. Proposed fix: after data
deletion, remove residual `server` recursively and spawn a hidden delayed `rmdir`
(retry, no `/s` or reinstall guard) after the uninstaller exits. Not implemented.
