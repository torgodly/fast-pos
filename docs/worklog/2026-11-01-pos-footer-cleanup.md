# POS ticket header: customer in, invoice preview out — 2026-11-01

## What changed

The «فاتورة» preview button is gone from both POS tickets (بيع سريع and the
cashier order page). The customer row moved up into the cart header, directly
beneath the «الطلب (N)» title.

- `components/PosTicket.tsx` — `PosTicketPanel` accepts `headerAction`,
  rendered under the title/total row inside a `<header>` element.
- `components/QuickSaleBoard.tsx` — preview button and its import removed;
  `CustomerSelect` is now the header action; pay footer is only the payment
  groups (hairline between collect-now and deferred unchanged).
- `components/OrderMenu.tsx` — forwards `headerAction` to the ticket panel.
- `app/cashier/[venue]/order/[id]/page.tsx` — preview button and its import
  removed; `OrderCustomerSelect` is the header action; footer is kitchen
  confirm + pay buttons.

The waiter order page keeps its existing footer preview button (no customer
row or payment methods there).

## Verification

- TDD: `components/QuickSaleBoard.test.tsx` (4 tests) asserts the invoice
  button is absent, the customer button sits inside the cart `<header>`, and
  the deferred hairline still renders only when both payment groups exist.
- `npx vitest run` — 82 files / 522 tests pass.
- `npx tsc --noEmit` and scoped eslint — clean.
- `npm run build` + installer (`-SkipNpm`) + silent install: installed
  BUILD_ID `LvCJwdeQpBFqORrah1j9G` matches the repo, FastPOS service RUNNING,
  `http://127.0.0.1:3000/` → 200, `deployment.json` SHA-256 unchanged
  (`1d5d296f…`), DB fingerprint unchanged (25 tables, `44159b20…`).

Owner check still required on the installed build: open بيع سريع and an open
order, confirm the customer row sits under «الطلب», no «فاتورة» button remains,
and payment/printing still work.
