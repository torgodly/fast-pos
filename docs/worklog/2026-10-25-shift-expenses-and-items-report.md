# Shift expenses + items-sold report — worklog

Date: 2026-10-25
Status: implemented; unit/integration/UI tests, typecheck and production build
green; installer rebuilt. Browser end-to-end on production pending owner install.

## Request

Add in-shift expenses and print a second ticket for the items sold in the shift
after the shift report.

Owner decisions:

- any cashier can record an expense from the POS header (not only the main
  cashier, not admin);
- only the main cashier can delete a wrong expense, and only while the shift is
  open; closed shifts are immutable;
- the items ticket prints automatically after every shift report (mid-shift
  summary, close and reprint) as a separate ticket with its own cut;
- the items ticket is a flat list of item names with quantities only (no
  revenue, no category grouping).

## Data model

- `shift_expenses` (`lib/db/schema.ts`): `id`, `shiftId` → `shifts.id`,
  `amount` (REAL), `reason`, `createdBy` → `users.id`, `createdByName`
  (snapshot), `createdAt`; index on `shift_id`.
- Idempotent migration `lib/db/migrate-shift-expenses.ts` creates the table and
  index on boot; `lib/db/index.ts` also includes them in `ensureSchema` for
  fresh databases. Runs after `migrateShiftCash`.

## Cash math

`lib/shifts/cash.ts`:

- `DEFAULT_OPENING_FLOAT = 30`.
- `validateShiftExpense(amount, reason)` — amount > 0 and finite, non-empty
  trimmed reason, max `MAX_EXPENSE_REASON_LENGTH = 120`.
- `calculateShiftCash(openingFloat, cashSales, cashExpenses, countedCash)` —
  expected cash = float + cash sales − cash expenses; difference = counted −
  expected (rounded to 2 decimals).

`closeShift` and `buildShiftReportData` use this formula, so the cash count
dialog, printed report and stored reconciliation all agree.

## Core (`lib/shifts/core.ts`)

- `ShiftExpenseItem`, `ShiftExpenseLine` in report data, `ShiftItemSale`
  (`name`, `qty`).
- `itemSalesForShift(shiftId)` — paid orders of the shift, grouped by
  `item_name`, summed `qty`, ordered by qty desc then name.
- `getShiftExpenseTotal(shiftId)`, `listShiftExpenses(shiftId)` (id asc),
  `addShiftExpense({ shiftId, userId, userName, amount, reason })` (validates,
  rejects closed/missing shifts), `removeShiftExpense(expenseId)` (open shifts
  only).
- `getShiftTotals` now returns `items` and `expenseTotal`; `buildShiftReportData`
  includes `items`, `expenseTotal` and the expense lines; `listShifts` adds a
  grouped `expenseTotal` per shift.

## Actions (`app/actions/shifts.ts`)

- `addShiftExpense(venueId, amount, reason)` — any cashier; requires an open
  shift; validates via core; audits `shift_expense`; revalidates cashier paths
  and `/admin/shifts`.
- `deleteShiftExpense(venueId, shiftId, expenseId)` — main cashier only; shift
  must be open, belong to the venue, and contain the expense (pre-checked via
  `listShiftExpenses`); audits `shift_expense`.
- `printShiftReportData` sends the main report, then `buildShiftItemsEscPos` as
  a separate ticket. Main failure → no items attempt and the usual error.
  Items failure → `{ ok: true, warning }`; the shift still closes and the
  warning tells the user to reprint.
- `printShiftSummary`, `closeCashierShift`, `reprintShiftReport`,
  `adminReprintShiftReport` all propagate the items-ticket warning and audit
  “+ الأصناف” / “تعذرت طباعة الأصناف”.
- Cashier venue authorization follows the other shift actions (role check only)
  because staff can switch venues from the landing page without re-login; the
  shift is resolved from the requested venue.

## Printing (`lib/print/escpos.ts`, `receipts.ts`)

- Main report gains an expense section before expected cash: “المصروفات”,
  each reason + amount, or “لا مصروفات في هذه الوردية”, then
  “إجمالي المصروفات”.
- `buildShiftItemsEscPos(data)` — title “أصناف وردية #N”, date/print/by lines,
  flat `name … qty` rows, “إجمالي الأصناف”, “إجمالي القطع”, end line, 8-line
  feed + cut. Empty shift prints “لا أصناف مباعة في هذه الوردية”.

## UI

- `components/ShiftExpenseButton.tsx` (new): header button + dialog (amount,
  reason with max length), client validation, toast, refresh.
- `components/PosHeader.tsx`: optional `showExpense` prop; rendered only when a
  shift is open.
- All cashier pages pass `showExpense` (`home`, `quick`, `sales`, `items`,
  `tables`, `order/[id]`, `shift`); waiter pages unchanged.
- `components/CashierShiftPanel.tsx`: expected cash net of expenses, expense
  total card, expense list with creator/time and main-cashier delete
  (confirm), close dialog shows expenses, history gains an expense column.
- `app/cashier/[venue]/shift/page.tsx`: passes `shiftId`, open-shift expenses
  and the new totals fields.
- `app/admin/(panel)/shifts/page.tsx`: expense column + aggregate in the header.

## Verification

- New tests: `lib/shifts/cash.test.ts` (10), `lib/db/migrate-shift-expenses.test.ts`
  (2), `lib/shifts/core.expenses.test.ts` (5), `lib/print/shift-report.test.ts`
  (4), `components/shift-expenses.test.tsx` (4 — expected cash, expense rows,
  delete, dialog submit/validation).
- Full suite: **34 files / 153 tests green**. `npx tsc --noEmit` clean.
  `npm run build` succeeded (Next.js 16.3 / Turbopack).
- Browser end-to-end could not be run autonomously because starting the local
  server was blocked by the environment policy; UI behavior is covered by the
  jsdom component tests. Owner install remains the end-to-end check.
- Installer rebuilt 2026-10-25 18:29:
  `release/installer/Fast-POS-Setup-0.1.0.exe`, 49,481,075 bytes, SHA-256
  `2cb996332abe65e0e9fed5531e781afcd2f407cb0d0f42668ed1e9f06935cc69`.

## Owner handoff

1. Install the rebuilt setup. Existing databases get `shift_expenses`
   automatically on first boot; no manual migration.
2. Open a shift, then use «مصروف» in the POS header (any cashier page) to record
   cash paid from the drawer. The shift page lists expenses and lets the main
   cashier delete them while the shift is open.
3. Printing the summary, closing, or reprinting a shift now outputs two tickets:
   the shift report and the items-sold ticket. If the items ticket fails, the
   close still completes with a warning; reprint retries both.
4. Cashier station reports still require an explicit Windows queue
   (`host = default` is rejected), as before.
