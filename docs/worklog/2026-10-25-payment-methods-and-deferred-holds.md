# Payment methods + deferred «آجل» holds — worklog

Date: 2026-10-25
Status: implemented; tests, typecheck, lint and production build green; installer
built and installed over the production service; migrations and the full hold →
settle → shift flow verified.

## Request

1. A new admin page to manage payment methods.
2. Add an «آجل» (deferred) checkbox to the payment-method form. A method marked
   آجل must **hold** the order instead of settling it — mainly for phone orders
   (e.g. customers ordering through the Libyan delivery app Presto). When the
   customer arrives, the cashier retrieves the held order and settles it with
   the real payment method.
3. Presto: research only. The owner explicitly said **no integration** — Presto
   is just a manually created deferred method the staff can name themselves.

## Model

New table `payment_methods` (`lib/db/migrate-payment-methods.ts`,
`lib/db/schema.ts`):

- `code` — stable identifier: `cash`, `card`, or `pm_<12hex>` for custom rows.
- `name` — Arabic label shown in POS/receipts.
- `deferred` — «آجل»: paying with it holds the order.
- `cash_drawer` — counts toward expected shift cash (forced off for deferred).
- `built_in` — cash/card are protected from deletion.
- `active`, `sort_order`, `created_at`.

Seeded defaults: نقدي (cash, cashDrawer) and بطاقة (card). Existing
`orders.paymentMethod` values keep working unchanged; reports keep filtering by
any historical code.

### Hold semantics (`app/actions/orders.ts`)

Choosing a deferred method does **not** take money and does **not** print:

- order stays `status = "open"` and gets `held_at` / `held_by`;
- `payment_method` stores the deferred code (so the held invoice is labelled);
- `paid_at`, `shift_id`, inventory consumption and the receipt are skipped.

Settlement from the cashier order page uses any normal method: the existing pay
path runs (paid, shift stamp, inventory consumption, kitchen/receipt printing)
and clears `held_at` / `held_by`.

## UI

- **Admin → طرق الدفع** (`app/admin/(panel)/payment-methods/page.tsx`,
  `components/admin/PaymentMethodsAdmin.tsx`): stats, table, add/edit modal.
  The آجل checkbox disables the cash-drawer checkbox and explains that the
  order remains open under the deferred method. Built-ins can be edited but not
  deleted; methods used by invoices can only be disabled.
- **Quick sale** (`components/QuickSaleBoard.tsx`): deferred methods render with
  a clock icon + warning colour and a confirmation dialog
  «تأكيد تعليق الطلب»; the result notice reports the hold.
- **Order editor** (`components/PayButtons.tsx`): a held order shows an آجل
  badge and a «تحصيل الطلب المعلّق» confirmation before settling.
- **Cashier home** (`app/cashier/[venue]/page.tsx`): held quick sales stay in
  the open-invoices list with an «آجل · <method>» badge and open normally.

## Shift/report adaptation

`buildPaymentBreakdown` (`lib/payments/core.ts`) aggregates paid orders per
method. Shifts, shift history, sales page, admin reports, invoice detail, HTML
receipts and ESC/POS reports now show a dynamic per-method breakdown instead of
hardcoded نقدي/بطاقة:

- expected cash = opening float + totals of `cash_drawer` methods − expenses;
- deferred/held orders are never paid, so they never enter shift totals;
- `nonCashTotal` replaces `cardTotal` everywhere.

## Verification

- `npx tsc --noEmit` clean; `eslint` clean; `npm test` 41 files / 199 tests;
  `npm run build` green.
- Installer `Fast-POS-Setup-0.1.0.exe` built and silently installed over the
  production install (`C:\Program Files\Fast POS`); service running.
- Production DB: `payment_methods` (cash/card seeded) and
  `orders.held_at/held_by` exist. Migrations run lazily on the first DB access,
  so a service restart alone does not touch the file — the first HTTP request
  after startup applies them.
- Dev-browser run (separate dev DB and dev JWT secret, no production
  credentials): created «بريستو (توصيل)» as آجل → quick sale held (order #16
  `open`, `held_at`, `held_by`, `shift_id = null`) → appeared in open invoices
  with the آجل badge → settled as نقدي → `paid`, `paid_at`, held fields cleared,
  `shift_id = 1`; shift showed نقدي 6.00 / غير نقدي 0.00 / متوقع 36.00.

## Gotchas

- `/admin/payment-methods` is the route (underscore variant 404s).
- `payment_methods` must exist in any test DB that calls shift totals; the
  expense/workflow tests seed cash/card explicitly.
- Held orders intentionally have no `shift_id`; they get one at settlement.
- The deferred checkbox forces `cashDrawer = false` — a held order cannot add
  cash to the drawer.
