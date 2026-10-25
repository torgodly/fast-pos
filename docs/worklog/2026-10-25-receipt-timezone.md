# Checkout receipt time showed UTC instead of Libya time — worklog

Date: 2026-10-25
Status: fixed, tests + production build green

## Symptom

The printed customer receipt showed a time 2 hours behind the wall clock (e.g. 12:13
instead of 14:13) because it used UTC, while Libya is GMT+2.

## Root cause

All four checkout paths generated the payment timestamp with
`new Date().toISOString().slice(0, 19).replace("T", " ")` — a **UTC** SQL string:

- `payOrder`
- `payQuickSale`
- `printOpenOrderReceipt` (preview)
- `printQuickSalePreview` (preview)

That value is stored in `orders.paid_at` and passed through `formatDateTime()` /
the receipt builders as wall time, so the receipt printed UTC. The rest of the app
(shifts, Z windows, report printing) already follows the documented invariant that
timestamps are Tripoli SQL strings (`lib/time/tripoli.ts`,
`formatPrintTimestamp`), so `paid_at` was the outlier and also skewed Z attribution
around midnight.

## Fix

`app/actions/orders.ts` — use the existing `nowSqlTripoli()` for all four paid-at
generations. It reads the machine clock and expresses it in Africa/Tripoli (GMT+2),
so the printed receipt matches the machine's Libya time. This also makes new
`paid_at` values comparable with the Tripoli Z-window bounds and display
consistently in sales, invoices, and reports.

## Tests

- `lib/time/tripoli.test.ts` — a 12:13 UTC instant becomes `2026-10-25 14:13:22`;
  pins the GMT+2 contract.
- `lib/print/receipts.test.ts` — the checkout HTML renders `2:13`, not `12:13`,
  when fed the checkout timestamp.
- Full suite: 21 files / 99 tests passing; `npx tsc --noEmit` clean; `npm run build`
  succeeded.
- Installer rebuilt on 2026-10-25 14:21 with `npm run installer:build -- -SkipNpm`:
  `release/installer/Fast-POS-Setup-0.1.0.exe`, 49,474,914 bytes; canvas ICU guard
  passed. The setup includes both this fix and the brand-details feature.

## Caveats

- No data migration: orders paid before this build keep their UTC `paid_at`, so
  reprints/views of old sales still show the old (2h behind) time. New payments are
  correct. Historical rows could be shifted +2h later if the owner wants that.
- Demo seed data (`lib/db/seed.ts`) still fabricates timestamps in UTC; it is sample
  data only.
