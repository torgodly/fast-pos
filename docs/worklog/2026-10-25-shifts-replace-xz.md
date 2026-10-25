# Shifts replace X/Z reporting — worklog

Date: 2026-10-25
Status: implemented; unit/integration tests, typecheck and production build green;
installer rebuilt. Browser end-to-end on production still pending owner install.

## Request

X/Y reports no longer printed on the cashier printer, and the daily Z window was
not the model the owner wanted. Replace X/Y (Z-window reporting) with a real
shift + cash-drawer model:

- main cashier opens a shift with an opening float;
- paid orders belong to that shift;
- mid-shift summary can be printed;
- closing requires counted cash and prints an over/short difference;
- cashier and admin can browse/reprint shift history;
- sales are blocked until a shift is open.

## Data model

- `shifts` table (`lib/db/schema.ts`): `id`, `venueId`, `shiftNumber`,
  `openedAt`, `openedByUserId`, `openingFloat`, `closedAt`, `closedByUserId`,
  `expectedCash`, `countedCash`, `difference`, `status`.
- Partial unique index guarantees one open shift per venue
  (`WHERE status = 'open'`), created by idempotent migration
  `lib/db/migrate-shift-cash.ts` (also adds the cash columns to older DBs).
- `orders.shiftId` is stamped on payment (`payOrder`, `payQuickSale`); legacy
  paid orders keep `shiftId = null`.

## Core

`lib/shifts/core.ts`:

- `getOpenShift(venueId)`, `getShiftById`, `getLastClosedShift`, `listShifts`;
- `openShift` (assigns per-venue sequential `shiftNumber`), `closeShift`
  (stores expected/counted/difference), `getShiftTotals`;
- `buildShiftReportData` — invoice count, gross, cash/card split, item count,
  table/quick split, group sales, float, expected cash, counted, difference;
- venue strings are narrowed with `isVenueId()`; invalid venue rows are skipped.

Expected cash = opening float + cash sales of the shift. Difference =
counted − expected (positive = over, negative = short). `lib/shifts/cash.ts`
holds the pure rounding/difference helpers with tests.

## Actions (`app/actions/shifts.ts`)

- `openCashierShift(venueId, openingFloat)` — main-cashier only;
  rejects a second open shift and negative/non-finite floats.
- `printShiftSummary(venueId)` — mid-shift report for the open shift.
- `closeCashierShift(venueId, countedCash)` — closes first, records the
  `shift_close` audit with cash detail, then prints. A print failure returns
  `{ ok: true, warning }` so the close is never blocked.
- `reprintShiftReport(shiftId)` / `adminReprintShiftReport(shiftId)`.
- Reports route via `lib/print/report-print.ts`: network printers print over
  TCP; local printers must name an explicit Windows queue and print RAW via
  `printRawToWindowsPrinter`; `host = default` is rejected with an Arabic warning
  (same safety rule as checkout auto print).
- Audits: `shift_open`, `shift_close`, `shift_report` (Arabic labels in
  `lib/audit.ts`); legacy `x_report`/`z_report` labels kept for history.

## POS gating

- `payOrder` and `payQuickSale` return `OPEN_SHIFT_REQUIRED_ERROR` when the
  venue has no open shift, and stamp `orders.shiftId` on success.
- Cashier home: red banner with “افتح الوردية” link, order links disabled,
  shift badge when open.
- Quick sale redirects to the cashier home when no shift is open.
- Order page passes `shiftOpen` to `PayButtons`; cash/card disabled with
  “لا توجد وردية مفتوحة — الدفع موقوف حتى يفتحها الكاشير الرئيسي.”

## UI

- `components/CashierShiftPanel.tsx` (rewritten): open-shift form (float),
  live totals, expected cash, print summary, close dialog with
  expected/counted/difference, history table with reprint.
- `app/cashier/[venue]/shift/page.tsx`: main-cashier only; passes open shift,
  totals and 60 history rows.
- `app/admin/(panel)/shifts/page.tsx` (new) + `components/AdminReprintShiftButton.tsx`:
  admin history with float/expected/counted/difference and reprint.
- `components/AdminNav.tsx`: “الورديات” replaces Z reports.
- Removed `app/admin/(panel)/z-reports/`, `AdminReprintZButton`,
  `ZWindowSettingsForm`, `saveZWindowSettings`/`resetZWindowSettings`, and all
  Z-window helpers from `lib/settings.ts` / `lib/time/tripoli.ts` tests.
- `AdminPrinters`/checkout flows unchanged apart from the shared print routing.

## Printing

`lib/print/escpos.ts` → `buildShiftReportEscPos(data)` renders:

- title by kind: `ملخص وردية #N`, `إغلاق وردية #N`, `إعادة طباعة وردية #N`;
- venue name, date, open/close/print timestamps, printed-by, opened/closed by;
- invoice count, total (double-height), cash/card, item count, table/quick;
- per-group quantity and revenue;
- float, expected cash, counted cash, difference with زيادة/عجز/مطابق;
- trailing state line and the usual 8-line feed + cut.

## Verification

- `lib/db/migrate-shift-cash.test.ts`, `lib/shifts/cash.test.ts`,
  `lib/print/report-print.test.ts` added; updated `lib/time/tripoli.test.ts`.
- Full suite: 30 files / 132 tests green.
- `npx tsc --noEmit` clean after clearing stale Next generated types
  (`rm -rf .next`).
- `npm run build` succeeded (Next.js 16.3 / Turbopack); route list includes
  `/admin/shifts` and no `/admin/z-reports`.
- Production DB was read only for reference; a consistent backup was taken at
  `backups/pos-prod-2026-10-25.db` (`integrity_check: ok`). Nothing was written
  to production.
- Installer rebuilt 2026-10-25 18:02:
  `release/installer/Fast-POS-Setup-0.1.0.exe`, 49,480,960 bytes, SHA-256
  `b39b668c8300af9321ae07e9bc6919c8e3bbd1af06dc8beff836a8ffc02896fd`.
- Opening float field defaults to **30 LYD** (`DEFAULT_OPENING_FLOAT` in
  `lib/shifts/cash.ts`, used by `CashierShiftPanel`), owner-requested.

## Owner handoff

1. Install the rebuilt setup, open a shift from the cashier shift page before
   selling (payment is blocked otherwise).
2. In admin → printers, set the cashier printer (`طابعة المنظومة`) to the
   explicit Windows queue (production still had `host = default`). Until then a
   shift close succeeds but prints a warning instead of a report.
3. Reprints are available in admin → «الورديات».
