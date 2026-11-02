# Shift items ticket = sales-report tables — 2026-11-01

## What changed

- The items ticket (printed with every shift report) now prints the same two
  tables as the sales report's categories/items sections instead of flat
  category groups:
  - «المجموعات» — one row per category with `م | الاسم | الكمية | الإيراد`.
  - «الأصناف» — one row per sold item with the same columns.
  - Both sort by quantity desc, then Arabic name (same rule as sales).
- `الإيراد` is real money from `order_items.lineTotal` snapshots, not an
  estimate. The grand total under the items table remains pieces-based
  (`الإجمالي العام: N قطعة`) so the ticket still answers "how many pieces".
- Categories are derived from sold items only — a category with zero sales in
  the shift never appears, matching the sales report.
- The designer spec for the items document replaces the old `groups`
  (groupedTable) section with two `table` sections (`categories`, `itemsList`)
  using the `index|name|qty|revenue` column set. The `groupTotal` label is no
  longer part of the items document.
- The v1 default items template is rewritten to the new order
  (`overview → categories → itemsList`) and labels; v2 defaults derive from it
  through the existing migration, so the default design and the parity suite
  stay aligned.

## Files

- `lib/print/templates/data.ts` — `itemsDocumentData` builds category totals
  and sorted item rows, emits `categories`/`itemsList` table sections.
- `lib/print/templates/document-specs.ts` — items sections `overview` (kv),
  `categories` and `itemsList` (table, `index|name|qty|revenue`); `groups`
  removed.
- `lib/print/templates/defaults-v1.ts` — items template order/sections/labels
  (`groupTotal` removed).
- `lib/shifts/core.ts` — `ShiftItemSale.revenue`; shift item query also sums
  `order_items.lineTotal` per item.
- `lib/print/receipts.ts` — `ShiftReportPrintData.items[].revenue`.
- `lib/print/templates/sample.ts` — sample shift items carry revenue.
- Tests: `data.test.ts` (numbered category/item tables + empty state + sample),
  `shift-report.test.ts` (ESC/POS rows/order/labels), `core.expenses.test.ts`
  (revenue per item), `layout-v1.test.ts` (grouped-table test now uses a
  synthetic v1 template because the items default no longer has `groups`).
- Docs: `README.md` reports section, `PROJECT_INDEX.md` shifts paragraph.

## Locked decisions

- Column set matches the owner's choice: `م | الاسم | الكمية | الإيراد`
  (revenue included).
- The summary stays in pieces (`N قطعة`), not money — this ticket reports
  items, the shift report reports money.
- No data migration: the production DB had no `report_template.items` rows, so
  the spec section swap cannot orphan a saved design.

## Verification

- Targeted suites red first (missing `revenue`, categories still grouped under
  `— … —`, no `الإيراد` column), then green.
- `npx vitest run` — 73 files / 473 tests pass.
- `npx tsc --noEmit` — exit 0.
- `npx eslint` on the changed files — exit 0.
- `npm run build` — succeeds (`.next/BUILD_ID` `f4W0M23wcy8DfY_s9Ib3H`).
- Installer rebuilt with `scripts/build-installer.ps1 -SkipNpm` →
  `release/installer/Fast-POS-Setup-0.1.0.exe` (75,678,323 bytes, 18:06,
  exit 0).
- Installed over the existing build (owner approved UAC, exit 0): installed
  `server/.next/BUILD_ID` matches, `FastPOS` service running,
  `http://127.0.0.1:3000/` returns 200, `deployment.json` SHA-256 unchanged,
  and the logical DB fingerprint (all 25 tables) is identical before/after
  (`b37f8b6f…`).

Owner check still required on the installed build: print a shift report and
confirm the items ticket shows «المجموعات» then «الأصناف» with
`م | الاسم | الكمية | الإيراد`, and that the revenue per row matches the sales
report for the same period.
