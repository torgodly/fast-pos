# Customers — worklog

Date: 2026-10-24
Status: implemented, verified (typecheck + tests + production build + browser UI)
Owner request: add customers to the system for receipts, with a "+" button on the POS
menu and a dedicated management page using the same data fields as suppliers.

## Model as implemented

- `customers`: `id, name (required), phone, notes, active, created_at`.
  Mirrors supplier contact fields; no address/tax fields were requested.
- `orders.customer_id` optional FK → `customers.id`. Receipts read the customer at print
  time (no snapshot), so edits also affect reprints — same behavior as supplier data.
- Customers referenced by any order cannot be deleted (`deleteCustomer` guard); they can
  be deactivated (`setCustomerActive`), and inactive customers stay visible on their
  existing orders but are not offered in new selections.

## Implementation map

- Schema/migration: `lib/db/schema.ts` (`customers` table, `orders.customerId`,
  `customersRelations`, `ordersRelations.customer`); `lib/db/index.ts` (`ensureSchema`
  creates `customers` before `orders`; guarded `ALTER TABLE orders ADD COLUMN customer_id`).
- Admin actions: `app/actions/customers.ts`
  - `upsertCustomer(formData)` — admin only; trims; name required ≤80; case-insensitive
    duplicate-name check; create or update.
  - `setCustomerActive(id, active)`, `deleteCustomer(id)` (blocked when referenced by orders).
  - `quickCreateCustomer({name, phone?, notes?})` — cashier or admin; same validation;
    returns the new `{ id, name, phone }` option for immediate selection at the POS.
- Order linking: `app/actions/orders.ts`
  - `setOrderCustomer(orderId, customerId | null)` — cashier, open order, venue ownership,
    active customer guard.
  - `payQuickSale(..., customerId = null)` — stores `customer_id` on the created order.
  - `payOrder`, `buildCheckoutReceiptForOrder`, `printOpenOrderReceipt`,
    `printQuickSalePreview(..., customerId = null)` include `customerName`/`customerPhone`.
- Receipts:
  - `lib/print/receipts.ts` — optional `customerName`/`customerPhone` on
    `CheckoutReceiptData`; HTML rows "العميل" / "الهاتف" after the waiter row; values escaped.
  - `lib/print/escpos.ts` — same two field lines in `buildCheckoutEscPos` (network printers).
- POS UI:
  - `components/CustomerSelect.tsx` — customer chip + separate square "+" button
    ("إضافة عميل") on the sale ticket; dialog with search by name/phone, "بدون عميل",
    customer list, and inline quick-create form. Created customer is appended and selected.
  - `components/OrderCustomerSelect.tsx` — router-refresh wrapper around `setOrderCustomer`
    for open orders.
  - `components/QuickSaleBoard.tsx` — `customers` prop, `customerId` state, resets after
    payment, renders the picker above cash/card/preview; passes it to `PreviewReceiptButton`.
  - `app/cashier/[venue]/quick/page.tsx` — loads active customers only.
  - `app/cashier/[venue]/order/[id]/page.tsx` — loads active customers plus the order's
    current customer (even if inactive); renders the picker above the footer actions.
- Admin UI:
  - `app/admin/(panel)/customers/page.tsx` — `requireAdmin`; name-sorted customers and
    per-customer order counts.
  - `components/admin/CustomersAdmin.tsx` — list (name/phone/notes/orders/status/actions),
    create/edit modal, activate/deactivate, delete confirm.
  - `components/AdminNav.tsx` — "العملاء" entry after suppliers (Contact icon).

## Tests

- `lib/print/receipts.test.ts` (new): customer name+phone printed, values escaped,
  rows omitted when absent.
- `lib/orders/workflow.test.ts` and `lib/db/seed.test.ts`: hand-written `orders` DDL
  updated with `customer_id INTEGER`.

## Verification (2026-10-24)

- `npx tsc --noEmit` — clean.
- `npm run test` — 18 files / 83 tests passed.
- `npm run build` — succeeded; `/admin/customers` present.
- Browser UI (dev server 3003, cashier سارة PIN 2222 + admin):
  - Quick sale ticket showed the customer chip ("بدون عميل") plus the separate "+" button.
  - "+" opened "عميل جديد"; created "عميل الكاشير" / 0922222222 → chip updated and
    auto-selected; adding خبز فرنسي showed the customer still attached.
  - "فاتورة" preview was intercepted at the print iframe: receipt HTML contained
    "العميل → عميل الكاشير" and "الهاتف → 0922222222" before the payment method row.
  - Open order #8: picker listed both customers; selected "عميل تجريبي"
    (0911111122), chip updated, and the selection survived a full page reload.
    Then reset the order to "بدون عميل".
  - Admin `/admin/customers`: create "عميل تجريبي" (0911111111 + note "ملاحظة اختبار"),
    edit phone to 0911111122, list showed 0 invoices, then deleted both test customers;
    empty state "لا يوجد عملاء بعد" confirmed.
- Cleanup: test audit preview rows deleted (max id back to 4); `orders.customer_id`
  all null; customers table empty; printer 3 temporarily switched to `local` for the
  preview was restored to `network` (192.168.1.50:9100).

## Notes / follow-ups

- Customer deletion is intentionally blocked while referenced by orders; hide via
  deactivation instead.
- The third requested update is still undisclosed.
- Paused unrelated task: uninstaller leaves `C:\Program Files\Fast POS` behind after
  uninstall (see units worklog; not implemented).
