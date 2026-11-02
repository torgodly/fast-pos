# PDF export of every printable document — 2026-11-01

## Why

The owner tried printing the designer test to “Microsoft Print to PDF” as the
cashier printer and got “sent” with no file. That can never work: Fast POS
prints RAW ESC/POS straight to the spooler from the LocalSystem service
(session 0), so a PDF driver has no document to format and its save dialog is
invisible. The fix is an in-app PDF export that renders the same template to an
80 mm page, independent of any printer.

## What changed

- **Shared drawing primitives** — `lib/print/text-raster.ts` now exports
  `fontFor`, `wrapTextRows`, `drawTextRows`, `drawColumnCells`,
  `TEXT_RASTER_WIDTH`, `TEXT_RASTER_PAD`, and `FONT_FAMILY`. ESC/POS raster
  code calls the same helpers, so PDF and thermal output share font sizes
  (22/26/30/34), line height (`fontSize + 10`), padding, and column widths
  (`pixelWidths(weights, 384)`).
- **Image-based PDF writer** — `lib/print/pdf/image-pdf.ts` writes a one-page
  PDF by hand (no new dependency): Catalog/Pages/Page/image XObject/content
  stream, FlateDecode RGB image, MediaBox width `(80/25.4)*72 = 226.77 pt`,
  height proportional to the rendered strip. Arabic comes from the canvas
  raster, so shaping is correct; the text is not selectable.
- **Page renderer** — `lib/print/pdf/render-page.ts` draws `LayoutLine[]` on a
  384-logical-width canvas at `PAGE_SCALE = 2` (768 px), then returns RGB
  bytes: text, columns (via `drawColumnCells`), separators, logo (only when
  the PNG loads), and QR (via `qrMatrix` from `templates/qr.ts`, 4-module quiet
  zone).
- **Document builders** — `lib/print/pdf/documents.ts` exposes
  `receiptPdfForOrder`, `kitchenPdfForOrder`, `shiftPdf`, `itemsPdf`,
  `salesPdf`, `samplePdf`, plus `pdfFilename`:
  - receipt/kitchen → `<doc>-<orderNo ?? orderId>.pdf`
  - shift/items → `<doc>-<shiftNumber>.pdf`
  - sales → `sales-<from>_<to>.pdf`
  - designer → `design-<document>.pdf`
- **Data loaders moved** — `lib/print/order-documents.ts` now owns
  `loadCheckoutReceiptForOrder`, `loadKitchenReceiptForOrder`, and
  `receiptCustomer` (previously inline in `app/actions/orders.ts`), so print
  actions and PDF builders share one DB→print-data mapping.
  `summaryToPrintData` moved out of the `"use server"` file into
  `lib/reports/print-data.ts`.
- **Page builders** — `lib/print/templates/build.ts` adds `documentPage` and
  thin `receiptPage`/`kitchenPage`/`shiftPage`/`itemsPage`/`salesPage`/
  `samplePage` wrappers that return `{ lines, logoPng }` from the same v2
  layout used for ESC/POS. `lib/print/logo.ts` adds `readReceiptLogoPng()`.
- **API route** — `POST /api/reports/pdf` (`app/api/reports/pdf/route.ts`,
  `runtime = "nodejs"`) takes
  `{ document, source?, orderId?, shiftId?, filters?, template? }` and returns
  `application/pdf` with an attachment filename, `no-store`, and the byte
  length. Permissions live in `lib/print/pdf/access.ts`:
  - admin: anything;
  - cashier: only invoices whose `orders.cashierId` is theirs (receipt and
    kitchen);
  - shift/items: admin or the active `isMainCashier` cashier;
  - sales reports and designer previews: admin only.
  An open shift exports as kind `summary`; a closed one as `reprint`.
- **UI buttons** — `lib/client/download-pdf.ts` POSTs the request and saves the
  blob under the server-provided filename; `components/PdfDownloadButton.tsx`
  shows a spinner and a toast. Wired at:
  - cashier sales list (next to reprint buttons) — receipt PDF;
  - admin invoice detail — receipt PDF (paid orders) + kitchen PDF;
  - cashier shift panel — «ملخص PDF» for the open shift and a PDF button per
    closed history row;
  - admin shifts page — PDF on the open-shift banner and per closed row;
  - admin reports — «تنزيل التقرير PDF» with the on-screen filters;
  - designer toolbar — «تنزيل PDF» exports the unsaved template as a preview
    with sample data (mirrors the thermal test print, which also ignores the
    blank/sample toggle); errors and the filename show in the inline alert
    area, not a toast.

## Locked decisions

- Scope: all documents the app can print (receipt, kitchen, shift summary,
  items ticket, sales report, designer preview).
- Output geometry: 80 mm receipt strip, not A4.
- PDFs are images of the same raster pipeline (no PDF text layer, no browser
  print dialog, no new npm dependency).
- No audit event for PDF downloads (nothing is sent to hardware; the printed
  paths keep their audits).
- Sales PDF uses the same `printFilters` the thermal report button uses, so
  both outputs always match the on-screen filters.

## Verification

- TDD throughout: shared raster helpers (9 tests), PDF writer (5), page
  renderer (5), print-data mapping (2), document builders (6), route
  (12), client download helper (4), download button (2), designer PDF action
  (1 new test in `ReportDesignAdmin.test.tsx`).
- `npx vitest run` — 80 files / 515 tests pass.
- `npx tsc --noEmit` — exit 0.
- `npx eslint` on the changed files — exit 0.
- `npm run build` — succeeds and lists `/api/reports/pdf` as a dynamic route
  (`.next/BUILD_ID` `8RUuTWB5mCigB_vvdYvY2`).
- Sample pages rendered through `renderLayoutPage` and inspected as PNGs:
  receipt (logo, Arabic shaping, right-aligned RTL columns, item note) and
  shift report (closed-shift header, collection/float/reconciliation sections)
  both match the thermal layout on an 80 mm strip.
- Installer rebuilt with `scripts/build-installer.ps1 -SkipNpm` →
  `release/installer/Fast-POS-Setup-0.1.0.exe` (75,698,937 bytes, 18:51).
- Installed silently over the existing build (owner approved UAC): installed
  `server/.next/BUILD_ID` equals the repo build, `FastPOS` service RUNNING,
  `http://127.0.0.1:3000/` → 200, `POST /api/reports/pdf` without a session →
  401, `deployment.json` SHA-256 unchanged (`1d5d…`), and the logical DB
  fingerprint (all 25 tables) is identical before/after (`92586d0d…`).

Owner check still required on the installed build: open **مبيعاتي**, download a
PDF for a paid invoice and for a shift; confirm the file opens, Arabic is
shaped correctly, and the page is an 80 mm strip matching the designer.
