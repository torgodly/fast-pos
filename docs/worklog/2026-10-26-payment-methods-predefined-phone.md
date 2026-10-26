# Payment methods — predefined phone method + cash-expectation checkbox

Date: 2026-10-26
Status: implemented, tested, installer built, installed on production

## Requirement

- Predefined payment methods should include the deferred one, named «طلبات هاتف».
- The payment-method modal should drop the deferred option and use a single
  checkbox for whether the method affects expected cash.

Confirmed choices: the built-in deferred method uses code `phone` and the name
«طلبات هاتف»; predefined methods keep their cash-expectation flag locked, while
custom methods can edit it.

## Migration (`lib/db/migrate-payment-methods.ts`)

- The idempotent seed now inserts a third built-in:
  `('phone', 'طلبات هاتف', deferred = 1, cash_drawer = 0, built_in = 1, active = 1, sort_order = 30)`.
- `INSERT OR IGNORE` keeps existing databases safe: renamed built-ins and
  custom rows (including legacy deferred ones such as «بريستو») are untouched.

## Server action (`app/actions/payment-methods.ts`)

- No longer reads a `deferred` field from the form.
- New custom methods are always `deferred = false` and take the submitted
  `cashDrawer` flag.
- Edits go through `resolvePaymentMethodFlags`:
  - built-ins keep their stored `deferred` and `cashDrawer` (name-only edits);
  - legacy custom deferred rows stay deferred and cannot count as expected cash;
  - other custom rows follow the submitted cash-expectation checkbox.
- Add/edit audit messages are unchanged apart from new methods never being
  marked «آجل».

## Core (`lib/payments/core.ts`)

- `phone` added to the legacy label map so reports can label it even without a
  loaded row.
- `validatePaymentMethodFlags` replaced by `resolvePaymentMethodFlags`, which
  encodes the fixed/locked flags above.

## Admin UI (`components/admin/PaymentMethodsAdmin.tsx`)

- Removed the «آجل — يحجز الطلب» checkbox, its state, and its explanatory box.
- The remaining checkbox is relabeled «تؤثر على النقد المتوقع» and is disabled
  when editing a predefined method or a legacy deferred method, with a note
  explaining why; it stays editable for normal custom methods.
- Table column «نقدية الدرج» → «النقد المتوقع» with the badge «تؤثر».
- Warning callout now describes «طلبات هاتف» instead of a generic آجل method;
  the new-method note says holding is reserved for the predefined phone method.
- Admin page subtitle updated; the name placeholder no longer suggests
  «بريستو» as a custom method.

## Tests

- `lib/db/migrate-payment-methods.test.ts`: seeds cash/card/phone with the
  expected flags and order; re-running is idempotent and preserves a renamed
  phone row plus custom «بريستو».
- `lib/payments/core.test.ts`: labels `phone` without a row; resolver keeps
  built-in flags fixed, forces legacy deferred methods off expected cash, and
  applies the submitted choice to custom methods.
- `npm test`: 44 files / 217 tests passed. `npx tsc --noEmit`: clean.
  `eslint` on changed files: clean.

## Verification checklist

Installer rebuilt (`release/installer/Fast-POS-Setup-0.1.0.exe`) and installed
silently over `C:\Program Files\Fast POS`. Installed `BUILD_ID`
`_5OsY5k9-AlXxCltuUA4a` matches the local build, the FastPOS service is
running, and `http://localhost:3000/` returns 200.

Production `payment_methods` now contains exactly:

| code | name | deferred | cash_drawer | built_in |
| --- | --- | --- | --- | --- |
| cash | نقدي | 0 | 1 | 1 |
| card | بطاقة | 0 | 0 | 1 |
| phone | طلبات هاتف | 1 | 0 | 1 |

Production data is intact (1 order, 2 order items, 10 categories). Existing
custom methods were not present in this database; if one exists in another
database it is preserved and can be renamed or deleted from the admin page now
that «طلبات هاتف» provides the deferred behavior.
