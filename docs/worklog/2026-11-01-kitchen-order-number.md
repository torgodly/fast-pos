# Kitchen ticket order number — 2026-11-01

## What changed

- Kitchen tickets print the receipt's per-shift order number (`orders.order_no`)
  under «الطلب» instead of the global invoice id. The old output was
  `orderNo: "#<id>"`, so the kitchen saw the invoice id in the order-number slot.
- `KitchenReceiptData` gains `orderNo?: number | null`; both kitchen print paths
  pass `order.orderNo` (void tickets and pending/chunked tickets).
- The kitchen document spec now exposes `invoiceId` («فاتورة», renders `#<id>`)
  next to `orderNo`, so the owner can add it from the designer palette and print
  both, the order number only, or the invoice id only.
- The kitchen default layout is unchanged: it still prints only `orderNo`, now
  with the per-shift number. Existing saved kitchen designs pick up the new
  value automatically because the element and binding ids did not change.
- Fallback: when the row has no order number (designer sample before this
  change, legacy rows), `orderNo` renders as `#<id>` as before.

## Files

- `lib/print/receipts.ts` — `KitchenReceiptData.orderNo`.
- `lib/print/templates/data.ts` — kitchen `orderNo` mapping + new `invoiceId`.
- `lib/print/templates/document-specs.ts` — `kitchen.fields` gains `invoiceId`.
- `lib/print/templates/defaults-v1.ts` — kitchen label `invoiceId: "فاتورة"`
  (v2 defaults derive from the v1 default via migration).
- `lib/print/templates/sample.ts` — kitchen sample gets `orderNo: 12`.
- `app/actions/orders.ts` — `printKitchenVoidTicket` and
  `sendPendingKitchenTickets` accept/pass `orderNo`; both callers supply
  `order.orderNo`.
- Tests: `data.test.ts` (order number + invoice binding + fallback),
  `build.test.ts` (printed ticket shows «الطلب: 7», not «#12»),
  `defaults-v2.test.ts` (kitchen exposes `invoiceId`; every kitchen field has a
  default label).
- Docs: `README.md` designer bullet, `PROJECT_INDEX.md` kitchen line.

## Locked decisions

- Kitchen default stays one line: «الطلب» with the per-shift number. The
  invoice id is opt-in from the designer, not printed by default.
- The order number prints as a plain number (same formatting as the receipt),
  not `#12`.
- No template migration: the binding id `orderNo` is reused, so stored designs
  change value without being rewritten.

## Verification

- Targeted suites went red first (missing `invoiceId`, `orderNo` still `#7`,
  kitchen ticket still `#12`), then green after the change.
- `npx vitest run` — 73 files / 473 tests pass.
- `npx tsc --noEmit` — exit 0.
- `npx eslint` on the changed files — exit 0.
- `npm run build` — succeeds (`.next/BUILD_ID` written 16:58, `slUZ-tm22pN1XwVMNSgqk`).
- Installer rebuilt with `scripts/build-installer.ps1 -SkipNpm` → `release/installer/Fast-POS-Setup-0.1.0.exe`
  (75,676,269 bytes, 17:02, exit 0).
- Installed over the existing build (owner approved UAC, exit 0): installed
  `server/.next/BUILD_ID` matches the new build, `FastPOS` service running,
  `http://127.0.0.1:3000/` returns 200, and `pos.db` / `deployment.json`
  SHA-256 hashes are unchanged.

Owner check still required on the installed build: print a kitchen ticket from
an order placed after a shift open and confirm «الطلب: <n>» matches the receipt,
then add «فاتورة» in تصميم التقارير ← تذكرة المطبخ and confirm `#<id>` prints.
