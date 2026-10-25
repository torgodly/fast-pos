# Kitchen ticket clipping + direct checkout auto print — worklog

Date: 2026-10-25
Status: implemented; tests, typecheck and production build green; physical printer
verification still pending on the installed build.

## 1. Kitchen ticket clipped the last item's note

### Symptom

The last note on a kitchen ticket was cut in half, and its tail appeared at the top
of the following ticket. Moving the note above another item made it print fully.

### Root cause

Rendering was correct — long Arabic notes already wrap to the raster width. The
problem was the physical cut position: the auto-cutter sits roughly 20–30 mm after
the print head, but the ticket only fed 2 blank lines (plus the separator's own
line) before `GS V 0`. The last ~30 mm of content — usually the final note — stayed
below the cutter and only emerged when the next ticket fed through, so it looked
like the note jumped to the next ticket's header.

### Fix

`lib/print/escpos.ts`: `cut()` now feeds `CUT_FEED_LINES = 8` blank lines before
`GS V 0` (~30 mm at default line spacing). This applies to every ESC/POS ticket
built by `cut()` (kitchen, checkout, reports). The 8-line feed intentionally
replaces a single empty line: one line is not enough to clear the cutter offset.

## 2. Direct customer receipt printing (auto print)

### Behavior

New per-printer setting `auto_print` exposed as a checkbox in the printer modal,
shown only for **local** checkout printers ("طباعة تلقائية بدون نافذة Chrome").
Network checkout printers were already direct (raw TCP) and stay direct; kitchen
printers are rejected for auto print by validation.

Routing is centralized in `lib/print/checkout-print-mode.ts`:

| Printer | autoPrint | Path |
| --- | --- | --- |
| network | n/a (forced false) | raw ESC/POS over TCP via `printToPrinter` — same transport as kitchen |
| local | on | raw ESC/POS delivered to the Windows spooler (winspool `WritePrinter`, RAW) |
| local | off | existing Chrome/browser print flow |

The local path must use the Windows spooler because a USB/default-queue printer has
no IP/port. The bytes are the exact same `buildCheckoutPrintBytes()` output used by
the network path, including the logo and Arabic raster content. If the spooler
route fails, the action returns the browser-print HTML as a fallback so a paid
order never loses its receipt; the UI states this.

### Implementation

- `lib/print/windows-raw.ts` — writes ESC/POS bytes to a temp file, invokes
  Windows PowerShell with the printer name and file path passed via environment
  variables (no command injection), resolves default/exact queue among installed
  printers, and prints RAW through winspool P/Invoke. Temp directory is always
  removed.
- `lib/print/checkout-print-mode.ts` — shared validation/routing rules.
- `app/actions/orders.ts` — `printCheckoutReceipt` routes browser/windows/network;
  all four checkout paths (pay, quick sale, preview, reprint) use it.
- Schema/migration — `printers.auto_print INTEGER NOT NULL DEFAULT 0` added to the
  Drizzle schema, fresh-schema DDL, venue-nullable rebuild and
  `migratePrinterAutoPrint()`; idempotent migration runs on startup.
- Admin — checkbox, draft state, reset to false when switching to kitchen or
  network, table badge shows `تلقائي` vs `Chrome`, test action explains that local
  auto-print is verified during a real payment.

## Verification

- Full suite: 27 files / 115 tests passing, including:
  - `checkout-print-mode` routing/validation (6)
  - `windows-raw` byte passing, cleanup, empty-data rejection (3)
  - Windows-only PowerShell integration against a missing queue (1)
  - `escpos-cut` trailing feed count >= 8 (1)
  - printer migration (2) and admin modal checkbox behavior (3)
- `npx tsc --noEmit` clean; `npm run build` succeeded.
- Installer rebuilt on 2026-10-25 16:18 with
  `npm run installer:build -- -SkipNpm` (includes the "Launch Fast POS" finish-page
  option): `release/installer/Fast-POS-Setup-0.1.0.exe`, 49,476,778 bytes. Payload
  contains the canvas ICU file and the new `FASTPOS_PRINTER_NAME` / `auto_print`
  server code.
- No physical receipt was printed in this session. The service currently running on
  port 3000 is still the previously installed build until this setup is run.
  Recommend one auto-print payment on the new install and one kitchen ticket with a
  long final note.

## Notes / caveats

- Local auto print sends to a queue installed on the machine running the Fast POS
  server. If the cashier browser runs on a different PC, install the printer on the
  server PC (or use a network printer).
- Chrome fallback remains on spooler failure by design; disabling it would risk
  losing the customer's receipt.
- The cut feed adds ~30 mm of blank paper per ticket. That is the cost of clearing
  the cutter offset and matches typical ESC/POS cutter behavior.
