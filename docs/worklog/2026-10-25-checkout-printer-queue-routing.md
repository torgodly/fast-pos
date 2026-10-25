# Checkout auto print landed on the kitchen printer — worklog

Date: 2026-10-25
Status: implemented; unit/UI tests, typecheck and production build green; installer
rebuilt. Production printer still needs its queue reselected by the owner.

## Symptom

After installing the auto-print build, a paid customer receipt printed on the
kitchen printer instead of the configured cashier printer (production, port 3000).

## Evidence

- Production DB (`C:\Program Files\Fast POS\server\data\pos.db`, read-only):
  checkout printer `طابعة المنظومة` had `connection_type = local`,
  `auto_print = 1` and **`host = default`**. The cashier station was linked to
  that printer.
- `sc qc FastPOS` → `SERVICE_START_NAME : LocalSystem`. Fast POS runs as a Windows
  service in session 0; “default printer” is a per-user setting.
- Interactive user default was `XP-80C` (USB004), and the `kitchen` queue is a TCP
  queue for 192.168.1.56. The LocalSystem default did not match the cashier’s
  default, and winspool resolved it to a different queue (the kitchen printer).
- PrintService/Admin event 823 logged a default-printer change for the interactive
  user, irrelevant to the service account.

Root cause: an auto-print local printer saved as `host = default` delegates queue
selection to the service account. The service account’s default is not the
cashier’s default and happened to be the kitchen printer.

## Fix

An auto-print local printer must now name an explicit installed Windows queue.

- `lib/print/checkout-print-mode.ts`
  - `isExplicitWindowsPrinterName()` treats blank/`default` as not explicit.
  - `resolveCheckoutPrintMode()` returns `windows` only for local + autoPrint +
    explicit queue; otherwise it returns `browser` (safe fallback) instead of
    guessing a queue.
  - `validateAutoPrintHost()` returns an Arabic validation error for auto print
    without an explicit queue.
- `app/actions/admin.ts` — `upsertPrinter` validates before writing; auto print is
  computed once via `resolvePrinterAutoPrint`.
- `components/admin/PrintersAdmin.tsx`
  - Local printers now use a `<select name="host">` populated from
    `getSystemPrinters()` (installed Windows queues), with
    “بدون تحديد — تُستخدم نافذة Chrome”.
  - With auto print on and no explicit queue, the modal shows the warning, the
    summary card explains the fallback, and save is disabled. Selecting a queue
    enables save and the card names the queue.
  - Table marks legacy local auto-print rows with a “تحتاج تحديد” warning.
  - Falls back to a free-text host input if enumeration fails.
- `app/actions/orders.ts` — routing unchanged apart from the stricter mode helper;
  local auto print with `default` now uses the Chrome flow rather than printing on
  an unknown queue.

## Verification

- `lib/print/checkout-print-mode.test.ts`: 10 cases — explicit queue → `windows`;
  `default`/blank → `browser`; Chrome without auto print → `browser`; network
  always `network`; validator accepts explicit names and rejects empty/default;
  no validation needed for Chrome/network. All pass.
- `components/admin/PrintersAdmin.test.tsx`: 5 cases — checked auto print shows the
  warning, host select lists installed queues, save is blocked until a queue is
  chosen, submit sends the selected queue, network hides auto print. All pass.
- Full suite: 27 files / 121 tests green; `npx tsc --noEmit` clean;
  `npm run build` succeeded (Turbopack, Next.js 16.3).
- Browser check on `127.0.0.1:3100/admin/printers`: switching the modal to local
  listed `XP-80C — الافتراضية في Windows`, `kitchen` and the rest of the installed
  queues; auto print checked without a queue disabled “إضافة” and showed
  “اختر الطابعة أولاً — لن تُطبع الفاتورة تلقائياً قبل تحديدها.”; choosing
  `XP-80C` enabled saving and the card read “تُرسل الفاتورة مباشرة إلى «XP-80C» على
  جهاز Fast POS.”
- Installer rebuilt 2026-10-25 16:36:
  `release/installer/Fast-POS-Setup-0.1.0.exe`, 49,474,085 bytes, SHA-256
  `45cf7383c73e9f69d50113f9b5258d2a1e7f04a7343953e09b0afcec53ab32b7`.

## Required owner action

Install the new setup, then edit the production cashier printer
(`طابعة المنظومة`) and pick the cashier’s exact Windows queue (e.g. `XP-80C`)
instead of “default”. The old row stays on Chrome fallback until it is changed; it
cannot silently print on the kitchen queue anymore. The production DB/service were
not modified during this investigation.

## Notes

- Explicit queue names are matched against installed Windows printers at print
  time; if the cashier queue is uninstalled or renamed, printing falls back to the
  Chrome dialog and the audit log records the failure.
- Auto print still targets the machine running the Fast POS service (LocalSystem),
  not the browser PC.
