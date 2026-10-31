# Direct ESC/POS printing from Windows system printers — 2026-10-31

## Problem
The customer receipt arrived 3–4 s after the kitchen ticket. Kitchen tickets use raw
TCP; the Windows receipt printer used either the Chrome dialog or a per-print
PowerShell process that ran a CIM printer enumeration (~0.9 s), compiled the winspool
P/Invoke type (~0.1 s), and started a process (~0.5 s).

## Change
- `lib/print/windows-raw.ts`: one persistent hidden PowerShell worker started with
  `-EncodedCommand` (UTF-16LE base64). It loads `RawPrinterHelper` once, prints `READY`,
  then reads `PRINT<TAB><base64 name><TAB><data path>` lines and answers `OK` or
  `ERR<TAB><message>`. Node serializes prints through a promise queue, keeps the last
  4 KB of stderr, uses 15 s timeouts, and kills/respawns on failure. State lives on
  `globalThis`; injected worker factories are isolated per test.
- Routing: `local → windows`, `network → network`. `default`/empty queue names are
  rejected (`validateSystemPrinterName`).
- Removed the browser path: `finish-checkout-print.ts`, `receiptHtml`/`browserPrint`
  from every action, HTML builders and `printHtmlReceipt` from `receipts.ts`, the audit
  special case, and the Chrome fallbacks in five client components.
- Admin: `upsertPrinter` accepts exactly `local`/`network`, requires an explicit queue
  for local, stores `port = 0` and `autoPrint = true` for data coherence, and allows
  kitchen local printers. `testPrinter` uses the worker for local rows.
- Printers modal: two connection types, no auto-print checkbox, no Chrome wording.
- Schema unchanged; `auto_print` is retained but unread. Legacy `default` rows are
  never rewritten and show «تحتاج تحديد».

## Measurements (target Windows 10 PC, `XP-80C`)
- Old per-print path: ~1.5–2.5 s plus ~0.5 s process start (design estimate from the
  earlier investigation, not re-measured in this task).
- New worker: first print 728 ms (spawn + Add-Type + spooler) with tiny ESC/POS bytes
  through `printRawToWindowsPrinter`; warm ~43–52 ms end-to-end through
  `printRawToWindowsPrinter` (temp-file write + worker + spooler), while the isolated
  worker handshake itself was measured at 8–16 ms.
- Benchmark run recorded: `{ firstMs: 728, warmMs: [46, 43, 50, 52] }`.
- Real Arabic test page to `XP-80C` through the worker: 924 ms on the first call, no
  browser dialog.
- Not measured: the checkout-vs-kitchen wall-clock gap in the installed UI.

## Verification
Done:
- `npm test` — 50 files, 243 tests passed, exit 0 (documentation task; no product code changed).
- Final review fix round (worker stdin `error` guard, stderr-enriched timeouts, dead logo
  helper removal, USB copy, three new tests): `npm test` 50 files / 246 tests passed and
  `npx tsc --noEmit` exit 0.
- `npx tsc --noEmit` exit 0 and `npm run build` exit 0 (Task 5).
- Invalid queue integration test: passed in 792 ms, returns the `Cannot open printer`
  error with no paper.
- Real Arabic test page printed to `XP-80C` in 924 ms through the worker (first call,
  no browser dialog).
- Installer built and installed; `FastPOS` service Running; `/admin/login` HTTP 200;
  `/cashier/restaurant` HTTP 307; installed server chunks contain `RawPrinterHelper`;
  no orphan `powershell.exe` after stopping the service.
- Rebuilt and reinstalled after the final review fixes (`npm run build` then
  `scripts/build-installer.ps1 -SkipNpm`, because the script's `npm ci` step cannot
  compile native modules on this machine). Installed chunks contain the final worker;
  service Running; login 200 / cashier 307. The stdin-error test uses `vi.waitFor`
  instead of a fixed 20 ms sleep after it flaked under full-suite load.

NOT YET VERIFIED — owner to confirm:
- Checkout-vs-kitchen timing in the installed UI (the numbers above are a benchmark
  through `printRawToWindowsPrinter`, not a measured sale).
- Visual browser check of the two-type printers modal, including a legacy `default`
  row showing «تحتاج تحديد».
- Admin **اختبار الطباعة** button against `XP-80C` from the printers page.
- Printer-off sale: payment succeeds, Arabic warning shown, reprint from **مبيعاتي**.

## Pitfalls
- Do not use `-File` for the worker script; the script travels as an encoded command, so
  there is no temp script path or quoting problem.
- Keep the worker on `globalThis`; otherwise Next HMR leaks workers in development.
- A local row with `host = default` cannot be safely resolved under LocalSystem. It is
  rejected at print time instead of being guessed; editing the row in the printers page
  is the only fix.
- Kitchen tickets use the same two transports, so a USB kitchen printer must be added as
  a `local` system printer on the printers page. The category picker also lists installed
  Windows printers (USB queues are disabled there), but a saved local printer is the
  clearer path for USB.
- A legacy local printer row whose saved host is non-empty and not `default` is now
  treated as a literal Windows queue name; re-pick such rows from the admin UI instead of
  editing data by hand.
