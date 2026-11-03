# Purchases report + inventory value — 2026-11-03

Owner request: on the purchases page add filters and a report button that shows how much money was spent in the range; on the inventory page add a small section for the cost of the inventory.

## Decisions

- Purchases filters: date range (optional; empty = all history), supplier, plus the existing free-text search. Date inputs are plain `type="date"`.
- Report output: on-screen summary band + downloadable PDF + printable thermal report, all using the same filtered query.
- New report document `purchases` registered in the v2 template system (`REPORT_DOCUMENTS`), so it also appears in `/admin/reports/design` with a sample.
- Inventory cost basis: **latest purchase price per base unit** (`lineTotal / qtyBase`, newest invoice by `created_at` desc then line id desc). No schema change and no stored cost column.
- Inventory valuation is global (purchases are not venue-scoped) and shows total, ingredient vs tracked-item split, and a count of stocked targets with no recorded purchase price.

## Implementation

- `lib/reports/purchases.ts` — `resolvePurchaseRange` (blank-safe, date-only expands to day boundaries), `summarizePurchaseRows` (invoice count, rounded spend, line count, distinct suppliers), `getPurchaseSummary` (one grouped query joins suppliers and counts lines, so the old 100-row cap is gone; optional from/to/supplier/q conditions).
- `lib/inventory/valuation.ts` — `latestCostsPerBase`, `summarizeInventoryValue`, `getInventoryValuation` (joins purchase lines to invoice timestamps, ingredient and `trackStock` item targets).
- `lib/reports/print-data.ts` — `purchasesToPrintData`; `lib/print/receipts.ts` — `PurchasesReportPrintData`.
- Template pipeline: `purchases` added to `types.ts`, `DOCUMENT_SPECS` (fields `from/to/supplier/printedAt/printedByName`; sections `totals` kv and `invoices` table), v1 default + v2 migration default, `purchasesDocumentData`, sample data, `buildPurchasesReportEscPos`, `purchasesPage`, `purchasesPdf` + PDF filename, and the design labels in both `EditorToolbar` and `report-templates` actions.
- `/api/reports/pdf` — admin-only `purchases` branch via `canDownloadPurchasesPdf`; `PdfRequest.filters` widened to the purchases filter shape.
- `app/actions/reports.ts` — `printPurchaseReport` (network or Windows local printer, audited with `venueId: null`).
- `components/PrintReportButton.tsx` — optional `report: "sales" | "purchases"` and `label` props; sales behaviour unchanged.
- `app/admin/(panel)/purchases/page.tsx` — summary band (spend, invoices, lines, suppliers), collapsible filters, PDF + thermal report buttons, filtered table without the 100-row cap.
- `app/admin/(panel)/inventory/page.tsx` — «قيمة المخزون (بآخر سعر شراء)» strip with total and ingredient/tracked-item split.

## Verification

- TDD: new suites `lib/reports/purchases.test.ts` (6) and `lib/inventory/valuation.test.ts` (4) were written first, watched fail on missing modules, then passed. Full suite: 84 files / 536 tests pass.
- `npx tsc --noEmit` clean. Focused eslint has 0 errors; the only warning is the pre-existing `react-hooks/set-state-in-effect` in `PrintReportButton`.
- `npm run build` succeeded; BUILD_ID `EZ5qK2c15o5oM9ShcVExQ`.
- Installer built with `-SkipNpm`: `release/installer/Fast-POS-Setup-0.1.0.exe`, 75,697,362 bytes, SHA-256 `678922ffd0ad9417a3f1087ba15e9d8befbb541d18e3854cc0c62b8e46a5f73f`.
- Installed silently over `C:\Program Files\Fast POS` (owner approved UAC). Post-install: installed BUILD_ID matches, `FastPOS` service Running, `http://127.0.0.1:3000/` → 200, `deployment.json` SHA-256 unchanged (`1d5d296f…`), DB schema fingerprint unchanged (42 objects, `6e4d7334…`).
- Unauthenticated route checks: `/admin/purchases`, `/admin/inventory`, `/admin/reports/design?doc=purchases` → 307 login redirect; `POST /api/reports/pdf` → 401.
- Owner login and in-app acceptance (filters, PDF, thermal print, designer entry) still pending — the agent must not enter credentials.
