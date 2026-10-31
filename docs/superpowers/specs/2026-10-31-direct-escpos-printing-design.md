# Direct ESC/POS printing from Windows system printers — design

Date: 2026-10-31
Status: approved design, implementation pending
Scope: printer subsystem (customer receipts, kitchen tickets, shift/report printing, admin printers page)

## Problem

The customer receipt prints 3–4 seconds after the kitchen ticket. Kitchen tickets are sent
over raw TCP (`lib/print/network.ts`) and reach the printer immediately. A receipt printer
installed in Windows (e.g. `XP-80C` on USB) takes a slow path:

- `resolveCheckoutPrintMode` sends `local` printers to the Chrome print dialog unless the
  operator enabled "auto print".
- The auto-print path calls `printRawToWindowsPrinter`, which spawns a fresh PowerShell
  process per receipt, runs a CIM `Win32_Printer` enumeration (~0.9 s), compiles the
  winspool P/Invoke type (~0.1 s), and only then spools the job. Measured total:
  ~1.5–2.5 s per print, plus ~0.5 s process start.

The admin modal exposes three overlapping concepts (network / local + Chrome / local
+ auto-print with a Windows queue name), which is hard to configure and hides the slow
paths.

## Goals

1. A configured Windows system printer prints raw ESC/POS directly, at effectively the
   same speed as a network printer (~10 ms once warm).
2. The printers modal exposes exactly two connection types: **Windows system printer**
   and **network IP printer**.
3. No browser print dialog is used anywhere in the printing flow.
4. Existing installations keep working; no printer configuration is silently rewritten.
5. All verification is reproducible; the installer is rebuilt and installed on the target
   Windows 10 machine.

## Non-goals

- Supporting non-ESC/POS Windows printers (inkjets, PDF, OneNote). The printer must accept
  raw ESC/POS bytes. Receipt printers do.
- USB printing through a non-spooler interface (libusb, direct device I/O).
- Cloud or Android printing.
- Changing receipt/kitchen layouts, ticket chunking, print profiles, logo/ICU packaging.
- Changing the category-modal "system printer ref" flow (`lib/print/system-printer-ref.ts`);
  it only handles Windows network printers and continues to create/reuse network rows.

## Decisions

| Decision | Choice |
| --- | --- |
| Windows print transport | Raw ESC/POS through the Windows spooler (`winspool.drv`, datatype `RAW`) |
| Backend | One persistent hidden PowerShell worker, spawned lazily, serialized over stdin |
| Failure behavior | Payment/close succeeds; Arabic error shown; reprint from مبيعاتي; no browser fallback |
| Connection types | `local` = system printer (direct), `network` = IP:port; `browser` mode removed |
| Schema | Unchanged; `printers.auto_print` is retained but no longer read |
| Existing legacy rows | Never auto-rewritten; invalid `default`/empty system printer surfaces an admin error |
| Kitchen printers | May use either connection type (old "network only" rule removed) |

## Architecture

### 1. `lib/print/windows-raw.ts` — persistent raw-print worker

Exports `printRawToWindowsPrinter(printerName, data, options?)` with the same signature
semantics as today.

**Worker process.** A single hidden PowerShell process started with
`-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand <base64 UTF-16LE
script>` (no temp script file, no shell quoting issues), stored in a module singleton
attached to `globalThis` so Next.js hot reload does not spawn duplicates. The script:

1. Sets UTF-8 console encoding.
2. Loads the `RawPrinterHelper` C# type once (`OpenPrinter`, `ClosePrinter`,
   `StartDocPrinter`, `EndDocPrinter`, `StartPagePrinter`, `EndPagePrinter`,
   `WritePrinter`) via `Add-Type`.
3. Writes `READY` to stdout and flushes.
4. Loops on `[Console]::In.ReadLine()` until EOF. For each line it expects
   `PRINT<TAB><base64(printer name)><TAB><data file path>`, reads the file bytes, spools
   them with datatype `RAW`, then writes `OK` or `ERR<TAB><message>` and flushes.
5. Exits on EOF (stdin closed by the Node parent).

No CIM enumeration, no default-printer resolution, no per-print `Add-Type`.

**Node side.**

- `printRawToWindowsPrinter` validates `printerName` is explicit (non-empty, not
  `default`), writes `data` to a temp file under `os.tmpdir()/fastpos-print-*`, and
  appends the command to a promise-chain queue so concurrent prints are serialized.
- Ensures the worker: spawn with `windowsHide`, piped stdio, stderr captured (keep the
  last ~4 KB for diagnostics). Wait for `READY` with a 15 s timeout.
- Sends the command, waits for the matching single-line response with a 15 s timeout.
- On timeout, process error, or exit: kill/discard the worker, reject with an Arabic
  message, and leave state empty so the next call respawns it.
- Removes the temp directory in `finally`.
- Non-Windows platforms reject with the existing Arabic "Windows only" error.
- The worker is spawned only on first use; importing the module during `next build` has
  no side effects.
- `options` allows injecting a fake worker factory for unit tests; the default factory
  uses `child_process.spawn`.

**Latency budget** (measured on the target PC): first print after service start
~0.5 s (worker spawn + `Add-Type`); subsequent prints 8–16 ms.

### 2. Routing — only `windows` and `network`

`lib/print/checkout-print-mode.ts`:

- `resolveCheckoutPrintMode({ connectionType })` returns `"local" ? "windows" : "network"`.
- Remove `browser`, `resolvePrinterAutoPrint`, `validateAutoPrintHost`, and the
  auto-print checkbox semantics.
- Keep `isExplicitWindowsPrinterName` and add `validateSystemPrinterName(host)` that
  rejects empty names and the literal `default` with an Arabic message.

`lib/print/report-print.ts`:

- `resolveShiftReportPrintMode` returns `"windows" | "network" | "unsupported"`;
  `unsupported` only for a local row whose stored queue name is empty/`default`.
- `shiftReportPrintError` returns the admin-facing fix instruction for that case.

`app/actions/orders.ts` (`printCheckoutReceipt`):

- `local` → `buildCheckoutPrintBytes` → `printRawToWindowsPrinter(printer.host, bytes)`.
- `network` → `printToPrinter({ host, port, data })` (unchanged).
- Remove `buildBrowserCheckoutPrint`; errors are returned as `printError` only.

`app/actions/reports.ts`:

- `printReportSummary`: `local` → `buildReportSummaryEscPos` →
  `printRawToWindowsPrinter`; `network` unchanged. Remove the HTML/browser branch.
- Apply the same local handling to any other report action that currently branches to
  browser printing.

### 3. Removal of the browser print path

Delete or simplify:

- `lib/print/finish-checkout-print.ts` (delete).
- `receiptHtml` / `browserPrint` fields and branches in `app/actions/orders.ts`
  (`payOrder`, `payQuickSale`, held-order settlement, `printOpenOrderReceipt`,
  `printQuickSalePreview`, reprint actions) and `app/actions/reports.ts`.
- `buildCheckoutReceiptHtml`, `buildDetailedSalesReportHtml`, `printHtmlReceipt` in
  `lib/print/receipts.ts` once no callers remain.
- Client call sites: `components/PayButtons.tsx`, `components/QuickSaleBoard.tsx`,
  `components/PreviewReceiptButton.tsx`, `components/ReprintReceiptButton.tsx`,
  `components/PrintReportButton.tsx`. They rely on the server's `printOk` /
  `printError`/`message` and show a toast.
- `lib/audit.ts` browser-print special case.

Validate with a repository-wide grep before deleting each symbol; keep any symbol that
still has a real caller.

### 4. Admin printers page and actions

`components/admin/PrintersAdmin.tsx`:

- Field set: name, role (`kitchen` / `checkout` / `both`), cashier department (for
  checkout/both), connection type (**طابعة النظام** / **طابعة الشبكة**).
- System printer: required select populated from `getSystemPrinters()`. No empty/"use
  default" option. If enumeration fails, a manual name input is shown. Helper text:
  prints directly ESC/POS on the Fast POS machine; no Chrome window.
- Network printer: host/IP and port (default 9100).
- Remove the auto-print checkbox, all Chrome wording, and the role-driven forced
  connection switching. Kitchen printers may be local or network.
- Table columns: name, cashier department, role, connection type
  (`نظام Windows` / `شبكة`), address (queue name or `host:port`), status, test, actions.
- The test-print button is available for both types.
- Rows whose connection is `local` but whose host is empty/`default` show a warning
  ("اختر طابعة Windows محددة") in the connection column.

`app/actions/admin.ts`:

- `upsertPrinter`: accept `local` and `network`; reject anything else.
  - `local`: host must pass `validateSystemPrinterName`; store `port = 0`,
    `connectionType = "local"`, `autoPrint = true` for data coherence.
  - `network`: host required, port integer 1–65535, `autoPrint = false`.
  - Remove the "kitchen requires network" rule.
  - Keep duplicate-network-printer reuse and `syncCheckoutStation` behavior.
- `testPrinter`: `local` → `buildTestPrintBytes` → `printRawToWindowsPrinter`;
  `network` unchanged. Both return Arabic success/failure messages and audit the attempt.
- `getSystemPrinters` unchanged.

### 5. Data compatibility

- No migration and no DDL change. `printers.auto_print` remains in `ensureSchema` and the
  Drizzle schema; new code never reads it.
- Existing `local` rows with a valid queue (e.g. `XP-80C`) start printing directly and
  fast after the upgrade.
- Existing `local` rows stored as `default` or empty (old Chrome/default mode) cannot be
  resolved safely under the LocalSystem service account. They are left untouched:
  - the printers table shows a warning;
  - any checkout/report print returns an Arabic error telling the admin to choose a
    specific Windows printer;
  - a payment is never rolled back because of it.
- Network rows are unaffected.

## Error handling and observability

- Checkout print failure returns `printOk: false` with the underlying Arabic message
  (`PowerShell stderr`, `Cannot open printer`, `ERR` from the worker, timeout, etc.).
  The success message still confirms payment and points to مبيعاتي for a reprint.
- `recordSessionAudit` keeps recording each receipt/kitchen/report attempt and failure.
- Worker stderr is kept in memory; the error surfaced to the UI includes its last line.
- A worker crash never breaks the server: the next print respawns it.

## Testing strategy (TDD, failing tests first)

Unit tests:

1. `lib/print/windows-raw.test.ts` — fake worker: READY handshake, success response,
   `ERR` propagation, timeout rejects and discards the worker, crash then respawn,
   serialization of two concurrent prints, temp file cleanup, explicit-name validation,
   non-Windows rejection.
2. `lib/print/windows-raw.integration.test.ts` — keep env-gated; exercise the real
   worker with a non-existent queue to assert the error path (no paper used).
3. `lib/print/checkout-print-mode.test.ts` — `local → windows`, `network → network`,
   removal of browser/auto-print cases, `validateSystemPrinterName`.
4. `lib/print/report-print.test.ts` — local valid/invalid queue, network.
5. Action tests — `local` checkout calls the raw helper (mocked) and never returns
   `browserPrint`; local failure returns `printOk: false`; `testPrinter` local calls the
   raw helper; `upsertPrinter` rejects local without a name and accepts local for kitchen.
6. `components/admin/PrintersAdmin.test.tsx` — no auto-print control, local requires a
   selected system printer, network submits host/port, kitchen offers both types.
7. Port receipt-content assertions that only exist in the HTML tests (customer name and
   phone, paid time) to ESC/POS bytes. Follow the existing pattern in
   `lib/print/order-number.test.ts`: set `PRINTER_ARABIC_RASTER=0`, rebuild the module in
   `beforeAll`, and assert the decoded win1256 text. The order-number ESC/POS tests
   already exist and stay; delete their HTML counterparts with the HTML builders.

Regression: full `npm test`, `npx tsc --noEmit`, `npm run build`.

Manual verification on the target machine:

1. Worker benchmark: warm prints ≤ 50 ms.
2. Invalid queue name returns an Arabic error without touching the spooler job.
3. Real print to `XP-80C` through the admin test button.
4. Build the installer (`powershell -File scripts/build-installer.ps1 -SkipNpm` when the
   standalone build is current), install it, and time a quick sale: kitchen ticket and
   customer receipt arrive within ~1 s of each other.
5. Confirm a failed print (printer off) shows the error and the receipt can be reprinted
   from مبيعاتي.

## Documentation

- `PROJECT_INDEX.md`: printer section and gotchas rewritten (no Chrome/auto-print,
  persistent worker, explicit queue names, legacy row behavior).
- `README.md`: printer setup section (system vs network), test button, failure/reprint.
- `docs/worklog/2026-10-31-direct-escpos-printing.md`: root cause, benchmark numbers,
  protocol, removal list, verification evidence.
- Project memory entry summarizing the locked decisions and pitfalls.

## Risks

- **PowerShell worker lifetime in dev**: HMR could spawn duplicates if state is not stored
  on `globalThis`; the design requires the `globalThis` singleton.
- **Orphan processes**: mitigated by stdin-EOF exit and kill on timeout; verify with Task
  Manager after a forced server stop.
- **Printer name encoding**: names are base64-encoded on the wire; the PowerShell side
  decodes UTF-8, so Arabic or spaced queue names work.
- **Long print jobs**: 15 s timeout; receipts and 80 mm reports are far below it.
- **Non-ESC/POS Windows printers** become unsupported by design.
- **Installer payload**: no new binary; the PowerShell script ships inside the Next.js
  server bundle, so standalone tracing needs no extra configuration. Verify in the
  installed build, not just `next dev`.
