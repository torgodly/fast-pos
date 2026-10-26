# Kitchen tickets skip unassigned categories + larger font — worklog

Date: 2026-10-26
Status: implemented, tested, installer built, installed on production

## Requirement

Categories with no printer assigned must not print in the kitchen ticket. Items
from categories that do have a printer still print normally. The larger
kitchen ticket font from the earlier change stays.

The first attempt at this request treated the missing output as a bug and fell
back to the main kitchen printer. That was wrong; the user confirmed an
unassigned category must be skipped instead.

## Behavior now

- `lib/print/resolve-kitchen-printer.ts` only uses an explicit link:
  active venue-linked printer → category printer → item printer. If none of
  those resolves to an active `kitchen`/`both` printer, it returns `null`.
  There is no main-kitchen or display fallback, and the other venue's printer
  is never used.
- `sendPendingKitchenTickets` (`app/actions/orders.ts`) skips lines whose
  printer resolves to `null` and keeps printing the remaining lines. Skipped
  lines keep `kitchen_sent_qty = 0`, so they stay pending.
- Messages name the skipped items:
  - partial: success message ends with
    `— بدون طابعة (لم تُطبع): <items>`;
  - nothing printable: returns
    `لا توجد طابعة مربوطة لـ: <items> — لن تُطبع في المطبخ` with
    `noPrinter: true`, and `confirmKitchenOrder` does not add the misleading
    “retry later” suffix.
- Kitchen Arabic raster font: emphasized lines 34 px, normal lines/notes 30 px
  (`lib/print/escpos.ts`, `kitchenLine`). Cut feed and chunking unchanged.

## Tests

- `lib/print/resolve-kitchen-printer.test.ts` (9 tests): unassigned, other
  venue only, inactive, deleted, checkout-only, and unassigned display
  printers all return `null`; active venue/category/item links resolve.
- `lib/orders/kitchen-skip.test.ts` (2 tests): a mixed order prints only the
  assigned line, updates `kitchen_sent_qty` only for it, and reports the
  skipped item; an all-unassigned order prints nothing, returns the
  `noPrinter` error, and writes a failed audit.
- `lib/print/kitchen-font.test.ts`: 34 px items, 30 px notes/metadata.
- `npm test`: 44 files / 211 tests passed.
- `npx tsc --noEmit`: clean.
- `eslint` on changed files: clean apart from the pre-existing
  `useArabicRaster` React-hook false positive in `escpos.ts`.

## Verification checklist

`npm run build` succeeded. Installer rebuilt from that build:
`release/installer/Fast-POS-Setup-0.1.0.exe`
(`scripts/build-installer.ps1 -SkipNpm`) and installed silently over
`C:\Program Files\Fast POS`.

Verified after install:

- installed `BUILD_ID` matches the local build (`XoUJGkspz848Hf2yb0oD3`);
- FastPOS service running and `http://localhost:3000/` returns 200;
- data intact: 1 order, 2 order items, 10 categories, 2 printers,
  3 audit events; `مشروبات باردة` (category 7) remains unassigned and is now
  skipped in kitchen tickets.

A physical ticket test should include one assigned and one unassigned
category: only the assigned lines should print, and the result message should
list the skipped items.
