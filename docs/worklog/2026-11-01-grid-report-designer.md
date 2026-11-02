# Grid report designer (v2) — 2026-11-01

## What changed

- `.fprep` v2 replaces fixed blocks with `elements[]` on a 32/48-column grid:
  text, field, logo, QR (receipt only), separator, itemTable, section, summary.
- Text/field share rows; every other element is alone in its row; blocks expand
  and push later rows down at print time.
- Deterministic v1→v2 migration (`el_logo`, `el_header_<i>`, `el_field_<id>`,
  `el_items`, `el_section_<id>`, `el_summary`, `el_footer_<i>`, `el_sep_*`).
  Stored v1 designs and imported v1 `.fprep` files migrate on load.
- Receipt QR encodes `INV-<invoiceId>|<total>|<time>` via `qrcode-generator`,
  pngjs, and the existing ESC/POS raster path; cache capped at 64 payloads.
- Logo offsets place the raster at the element's column (a narrow logo at
  column 0 included, left-aligned); QR offsets are centred inside their region
  and clamped so the 384-px raster never exceeds the paper. The full-width logo
  path is byte-identical to v1.
- Editor: GridCanvas with real `layoutTemplateV2` preview, drag with snap and
  Arabic rejection hint, arrow/Delete keys, palette, per-type inspector,
  explicit separator references, duplicate (text/separator), undo/redo.
- Schema dispatch accepts v1 (validate → migrate → validate) and v2; exported
  `.fprep` is always v2.

## Removed

- The v1 block canvas is gone: `lib/print/templates/blocks.ts` and the
  `ReportCanvas`, `CanvasBlock`, `CanvasLines`, and `BlockInspector` components,
  together with their tests (`blocks.test.ts`, `ReportCanvas.test.tsx`,
  `BlockInspector.test.tsx`), were deleted.
- Saved v1 designs still open and print: `store.ts` parses them through
  `parseReportTemplateJson`, which validates v1 and runs `migrate.ts`, so the
  print path always sees a v2 template. The stored row is rewritten as v2 the
  next time the design is saved; nothing is rewritten just by opening it.

## Locked decisions

- One element per field, logo, QR, item table, summary, and section id.
- QR payload uses existing data only (invoice id, total, time).
- Logo only for images; no arbitrary image upload.
- Line-based ESC/POS stays; only logo and QR are raster blocks.
- Migrated defaults must be byte-identical to v1 with the same logo/sample.

## Verification

- Parity suite compares `renderLayout(layoutTemplateV1(...))` with
  `layoutTemplateV2(...)` for all five defaults with and without logo, and each
  stored-variant fixture through `parseReportTemplateJson` (the production
  parse/migrate path), all with the 1000-byte non-vacuity floor.
- v2 validator coverage: one failing case per §9 rule (element/row caps,
  bounds, `col + width`, id pattern, duplicate ids, QR size, separator refs)
  plus every shipped default validating for its document.
- Image placement: a narrow logo at `col 0` prints left-aligned at its column,
  and QR offsets are clamped so the raster stays inside the 384-px paper.
- `npx vitest run` — 73 files / 470 tests pass.
- `npx tsc --noEmit` — clean (exit 0).
- `npx eslint` on the changed files — clean (exit 0).
- `npm run build` — succeeds (Next.js 16.4.3, `.next/BUILD_ID` written).
- Installer rebuilt with `scripts/build-installer.ps1 -SkipNpm` →
  `release/installer/Fast-POS-Setup-0.1.0.exe` (75,678,095 bytes, 16:25).
- Installer installed 2026-11-01 over the existing build (silent, default options,
  owner approved UAC): exit 0, installed `BUILD_ID` `kYzyrpb4XrUHN_5aABBNW`,
  service `FastPOS` RUNNING, `http://localhost:3000` returned HTTP 200, and
  `server\data\pos.db` / `pos.db-wal` kept their pre-install size and mtime.
- Owner functional checks pending: print all five documents on receipt and
  kitchen printers, Arabic + QR scan, restart, and confirm a previously saved v1
  design still prints the same and saves as v2.
