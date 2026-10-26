# Per-shift order numbers — worklog

Date: 2026-10-26
Status: implemented, tested, installer built, installed on production

## Requirement

Add a reference number that prints on shift invoices, starts at 1 for every new
shift, and keeps counting inside the open shift — labelled «رقم الطلب».

## Decisions

- **Receipt shows both numbers:** new «رقم الطلب N» above the existing global
  «رقم الفاتورة #id».
- **Plain integers 1, 2, 3…** per shift (no padding, no prefix).
- **Backfill all shifts:** paid orders that predate the column are numbered per
  shift in payment order (`paid_at`, then `id`), so the currently open shift
  continues at N+1 instead of restarting.

## Schema & migration

`lib/db/migrations/migrate-order-numbers.ts` (wired into `createDb()` after
`migrateSharedStaff`):

1. `addColumnIfMissing(sqlite, "orders", "order_no", "INTEGER")`
2. Number paid rows with a `shift_id` and `order_no IS NULL`, per shift.
3. `CREATE UNIQUE INDEX IF NOT EXISTS orders_shift_order_no_idx ON orders(shift_id, order_no)`

Idempotent. The unique index lives **only** in the migration — `ensureSchema()`
runs before the ALTER on legacy databases and would fail there. `order_no` was
also added to the `ensureSchema` DDL, the Drizzle schema
(`lib/db/schema.ts`, `uniqueIndex("orders_shift_order_no_idx")`) and every
duplicated test orders DDL.

## Assignment

`lib/shifts/order-number.ts`: `nextOrderNumber(shiftId)` = `MAX(order_no) + 1`
for that shift (NULLs and other shifts ignored).

`app/actions/orders.ts` assigns it inside the same SQLite transaction that marks
the invoice paid, in both payment paths:

- table order (`payOrder`)
- quick sale (`payQuickSale`)

The shift row is initialized with `shiftId` and `orderNo` together, so an
invoice can never be paid without a number. Held («آجل») orders get a number
only when they are settled — the hold itself does not consume a number.
Previews and unpaid orders print no order number.

## Printing

- `lib/print/receipts.ts` — `CheckoutReceiptData.orderNo?: number | null`;
  HTML meta table renders «رقم الطلب» before «رقم الفاتورة».
- `lib/print/escpos.ts` — `fieldLine(parts, "رقم الطلب", …)` before the
  `فاتورة` line, after the separator.
- Reprints read the stored `order.orderNo` through
  `buildCheckoutReceiptForOrder`, so a historical invoice keeps its number.

## Tests

New (10 assertions across 4 files):

- `lib/db/migrations/migrate-order-numbers.test.ts` — backfill order, per-shift
  reset, NULL-shift rows untouched, existing numbers preserved, idempotency,
  unique index rejects duplicates, multiple NULL-shift rows allowed.
- `lib/shifts/order-number.test.ts` — starts at 1, continues after max, ignores
  other shifts/NULLs.
- `lib/print/order-number.test.ts` — HTML and ESC/POS order render, omission
  when absent.

Existing integration tests needed `order_no INTEGER` in their in-memory orders
DDL (`lib/db/seed.test.ts`, `lib/orders/kitchen-skip.test.ts`,
`lib/orders/pay-hold.test.ts`, `lib/orders/workflow.test.ts`,
`lib/shifts/core.expenses.test.ts`) because Drizzle selects every column.

## Verification

- `npx vitest run` — 47 files / 227 tests pass.
- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors / 19 pre-existing warnings.
- `npm run build` — succeeds.
- `npm run installer:build` — `release/installer/Fast-POS-Setup-0.1.0.exe`.
- Silent install over `C:\Program Files\Fast POS`: BUILD_ID matches the new
  build, `FastPOS` service RUNNING, `http://127.0.0.1:3000/` → 200.
- Live DB (read-only check): `order_no` column present,
  `orders_shift_order_no_idx` unique index present, no duplicate
  `(shift_id, order_no)`, legacy paid order without a shift left unnumbered,
  no open shift at check time (numbering covered by tests).

### Installer note

The first silent runs failed with `DeleteFile failed; code 5` on
`FastPOS.ico`: the shell's icon cache host (`dllhost.exe`, COM Surrogate) held
the file. Stopping that one `dllhost` instance released it and the install
completed. Interactive setup shows a Retry/Ignore dialog for this case; silent
setup with `/SUPPRESSMSGBOXES` defaults to Abort, so stop the locking
`dllhost` (or reboot) before a silent icon update.
