# Windows system printers — worklog

Date: 2026-10-24
Status: implemented, verified (typecheck + tests + production build + browser UI);
**revised** — picker moved from the printer modal to the category modal.
Owner request: "now in the printer modal make it read the system printers", then
"the system installed printers should be added in the menu categories modal not the
printer modal".

## Behavior as implemented

- Opening the printer modal loads the printers installed on the **server PC**
  (`طابعات النظام (Windows)` card). A refresh button re-reads the list.
- Selecting a printer fills the form:
  - Installed on a **TCP/IP port** → connection `network` with the port's host and
    port (defaults to 9100).
  - **USB/WSD/software** printer → connection `local` (Chrome on the cashier PC);
    the exact Windows printer name is stored in `printers.host` so the cashier
    knows which printer to pick in the browser dialog.
- `kitchen` / `both` roles only see network-capable printers in the picker and
  cannot choose `local`; the server rejects it too.
- `local` printing behavior is unchanged: server returns receipt HTML, the cashier
  browser opens Chrome's print dialog (`finish-checkout-print.ts`). No new
  connection type, no raw spooler printing.
- Empty/error states explain that no printers were detected and manual entry is
  still possible.

## Implementation map

- `lib/types.ts` — `SystemPrinter` (`name, driver, portName, isDefault, host, port`).
- `lib/print/system-printers.ts` (new, client-safe) — parses the PowerShell JSON,
  dedupes case-insensitively, ignores invalid rows, sorts default-first then Arabic
  name; `formValuesForSystemPrinter` maps TCP/IP → network and USB/WSD → local.
- `lib/print/system.ts` (new, server-only) — `listSystemPrinters()` runs a static
  PowerShell script via `execFile` (absolute PowerShell path, `-NoProfile`,
  UTF-8, 12s timeout, `windowsHide`, 1MB buffer). Uses WMI:
  - `Get-CimInstance Win32_Printer` → name/driver/port/default;
  - `Get-CimInstance Win32_TCPIPPrinterPort` → `HostAddress`/`PortNumber`.
  Throws Arabic errors on non-Windows/failure. No user input reaches the script.
- `app/actions/admin.ts` — `getSystemPrinters()` (admin-only, returns
  `{printers}` or `{error}`); `upsertPrinter` now validates `connectionType` and
  explicitly rejects `local` for kitchen/both roles (previously coerced silently).
- `components/admin/PrintersAdmin.tsx` — (superseded, see Revision) Windows printer
  card + select + refresh; controlled name/role/connection/host/port drafts;
  `openPrinterModal()` initializes state in the click handler (avoids
  `react-hooks/set-state-in-effect`); role change forces network mode for kitchen;
  address column shows `Chrome — <printer name>`.
- `lib/print/system-printers.test.ts` (new) — parsing/sorting/dedupe, single-object
  JSON, invalid rows, trimming/empty output (the two form-mapping tests were removed
  in the revision with the helper).
- Docs: `README.md` printer section rewritten (legacy `SETUP.bat` agent removed;
  system picker + Chrome local flow documented); `PROJECT_INDEX.md` printing notes.

## Verification (2026-10-24)

- `npx vitest run lib/print/system-printers.test.ts` — 5 passed.
- `npm test` — 19 files / 88 tests passed.
- `npx tsc --noEmit` — clean; ESLint on changed files — clean.
- `npm run build` — succeeded (`/admin/printers` present). Note: the first build
  failed with `ENOTEMPTY` deleting `.next` (stale dev-server handle); after
  `rm -rf .next` the build passed.
- Browser UI (fresh dev server on 3001, admin/admin123 — existing dev DB still has
  the old password):
  - Modal showed `طابعات النظام (Windows)` and **11 detected printers**:
    Microsoft Print to PDF (default), EPSON L3150/L3250/L3560, Fax, HP LaserJet
    MFP M129-M134, L3150 Series(Network), XPS/OneNote writers.
  - Selecting `EPSON L3250 Series` auto-filled the name, switched connection to
    `Chrome على جهاز الكاشير`, and showed
    `اختر «EPSON L3250 Series»` guidance.
  - Switching role to `مطبخ` removed the system picker (none of this PC's printers
    has a TCP/IP port), showed `لا توجد طابعات شبكة مثبتة على السيرفر — استخدم IP
    يدوياً.`, and locked connection to network.
  - Modal cancelled without saving; no printer rows changed.

## Revision: picker moved to the category modal

The owner revised the placement: system printers belong where kitchen printers are
assigned (category modal), not in the printer modal.

- `lib/print/system-printer-ref.ts` (new, client-safe) — encodes/decodes the
  synthetic option value `sys:<encodeURIComponent(JSON)>` with `{name, host, port}`;
  validates non-empty name (≤120), host without whitespace, port 1–65535.
- `components/admin/ItemsAdmin.tsx` — opening create/edit category calls
  `getSystemPrinters()` and adds an `optgroup` «طابعات النظام (Windows)» to all
  kitchen-printer selects (single and shared restaurant/cafe). Network printers use
  `sys:` values; USB/WSD printers are rendered disabled with «USB — غير مدعومة
  لطباعة المطبخ». Printers already configured by `host:port` are hidden, and the
  hint explains loading/error/no-network/all-added/will-be-created states.
- `app/actions/admin.ts` — `upsertCategory` validates scope/name first, then
  `resolveCategoryPrinterRef()`: a `sys:` value reuses the printer with the same
  `host:port` (rejecting checkout-only or inactive matches with Arabic errors) or
  creates a shared network kitchen printer (`venue_id = null`, `active = true`) and
  revalidates `/admin/printers`; numeric refs keep the old validation. Only the refs
  relevant to the chosen scope are resolved.
- `components/admin/PrintersAdmin.tsx` — reverted to manual entry. Local (Chrome)
  mode keeps an optional «اسم الطابعة في Windows» field (stored in `host`) and
  hides IP/port; kitchen remains network-only.
- `lib/print/system-printers.ts` — removed the now-unused
  `formValuesForSystemPrinter` helper and its two tests.
- Docs: README printer section and PROJECT_INDEX updated to the category-modal flow.

### Revision verification (2026-10-24)

- `npm test` — 20 files / 91 tests passed (after removing the two dead-helper tests).
- `npm run build` — succeeded. First attempt hit the known `ENOTEMPTY` on `.next`
  from the stopped dev server; `rm -rf .next` then the build passed.
- Browser UI (dev server 3001, admin):
  - Category modal listed all 11 Windows printers; all were USB/WSD, so each was
    disabled with the USB explanation and the no-network hint was shown.
  - Injected a synthetic `sys:` network option (192.168.99.99:9100), created a
    disposable category, and confirmed `/admin/printers` auto-created the shared
    network kitchen printer. Both test rows were deleted afterwards.
  - Printer modal has no system-printer card; switching to «Chrome على جهاز
    الكاشير» shows the optional Windows-name field.

## Installer

- Rebuilt after the feature with `npm run installer:build -- -SkipNpm` (reused the verified
  production build): `release/installer/Fast-POS-Setup-0.1.0.exe` (~46 MB),
  Inno Setup 7.1.0 compile succeeded.
- Rebuilt again after the revision (same command) so the installer ships the
  category-modal behavior.

## Notes / constraints

- Enumeration runs on the **server**. If the cashier PC is separate, the receipt
  printer must also be installed there (the local info box and README say this).
- This machine has no printer installed on a TCP/IP port, so the network auto-fill
  path was verified by unit tests rather than live UI. The 5 existing network
  printers in the dev DB are manually configured IPs and were untouched.
- `tools/cashier-print-agent` (port 9288) remains legacy/unused.
- The third undisclosed update from the original "three things" plan is still
  pending. Paused unrelated task: uninstaller leaves `C:\Program Files\Fast POS`.
