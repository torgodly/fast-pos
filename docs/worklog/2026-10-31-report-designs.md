# Report designs (`.fprep`) + four-column receipt — 2026-10-31

## What changed

- `.fprep` template format (JSON v1, `format: "fastpos-report"`) for five documents:
  `receipt`, `kitchen`, `shift`, `items`, `sales`. Validation in
  `lib/print/templates/schema.ts` rejects unknown keys, placeholders, columns, section
  ids, duplicate fields and out-of-range widths; a valid parse is rebuilt into a
  canonical template.
- Receipt items table redesigned to four columns. The template authors them in RTL
  reading order — `name | qty | unitPrice | lineTotal` with weights `[11, 4, 7, 8]` —
  because the ESC/POS column builder treats the **first column as the rightmost**
  cell. On paper the row therefore reads **الإجمالي | السعر | الكمية | الصنف** from
  left to right, with rendered widths `[10, 6, 7, 9]` (label-minimum rule in
  `columns.ts`; the sum always equals `paper.columns` and renders on 384 px). The
  admin preview uses the same `dir="rtl"` flex order as the print so both match.
- Pure isomorphic layout engine (`layout.ts`) shared by preview and ESC/POS builder;
  `build.ts` renders bytes (Arabic raster, logo, cut) for all five documents.
- Storage in `app_settings` under `report_template.<document>`; a missing or invalid
  template falls back to the built-in default (one warning per document) so a bad
  design can never stop printing.
- Admin page `/admin/reports/design`: five document tabs, design tree, properties
  editor, live preview, raw JSON tab, import/export `.fprep`, reset-to-default, and a
  test print to any active printer read from the `printers` table.
- Server actions (`app/actions/report-templates.ts`) are admin-only and audited
  (`settings` on save/reset, `test` on test print). Test print validates the unsaved
  JSON, then sends through the same direct ESC/POS transports (no browser path).
- Unsaved-change guard: in-app confirm when switching documents and `beforeunload`
  while dirty.

## Locked decisions

- All templates live in the database, not on disk, so app updates never overwrite them.
- A broken design falls back to the default; it never blocks checkout or shift close.
- No browser print path — previews and test prints use direct ESC/POS.
- Column widths are character-based and converted to 384 px at render time.

## Bug fixes found during browser verification

- Switching document tabs kept the previous document's client state (App Router soft
  navigation) and showed a false dirty badge. Fixed with `key={document}` on
  `ReportDesignAdmin`.
- Saving a template left `تغييرات غير محفوظة` visible: stored JSON uses canonical key
  order while defaults use another order, so `JSON.stringify` comparison was wrong.
  Fixed with an order-insensitive `templatesEqual` used by both the client `dirty` memo
  and the server `isDefault` flag, plus two regression tests.
- The designer preview was horizontally mirrored against the printed receipt: it used
  `flex flex-row-reverse` under `dir="rtl"`, which put the template's first (rightmost
  on paper) column at the far left. Fixed to `flex flex-row`; browser measurements then
  matched the printed order الإجمالي | السعر | الكمية | الصنف. No template change was
  needed because the ESC/POS builder already treats the first column as rightmost.
- Saving a default template still showed it as customized: defaults omitted optional
  `separator` flags that validation always emits, so the normalized template never
  equalled the raw default. Added the flags (kitchen/shift summaries, shift/items/sales
  items) and a round-trip test asserting `templatesEqual(validated, default)` for all
  five documents.
- A `.fprep` with section id `__proto__`/`constructor` could resolve inherited
  `DocumentSpec` properties during validation. Fixed with `Object.hasOwn` guards and a
  try/catch around validation, plus a regression test.

## Verification

- Scoped re-review of the fix round: APPROVED; its three NITs were closed
  (`parseReportTemplateJson` prototype test, `Object.hasOwn` in `layout.ts`, 1000 ms
  revoke delay).
- `npx vitest run` — 61 files / 324 tests pass.
- `npx tsc --noEmit` — clean.
- `npm run lint` — no new errors (one pre-existing `prefer-const` error in
  `lib/print/windows-raw.test.ts:353`).
- `npm run build` — succeeds (`.next/BUILD_ID` written).
- Browser checks 1–6 and 8 pass: default receipt opens with the four-column preview,
  edits live-update and mark dirty, invalid JSON is rejected without saving, export
  produces `fastpos-receipt.fprep` and re-import restores the edit, reset asks for
  confirmation and returns to the فاست بوس default (DB override removed), all five tabs
  load their own template, and dirty appears after an edit.
- Check 7 (test print) error path verified in the browser (`connect ETIMEDOUT` shown);
  the venue printers were offline from the dev machine. Success-path printing is
  verified on the installed build.
- Installer rebuilt after the final fixes with `scripts/build-installer.ps1 -SkipNpm` →
  `release/installer/Fast-POS-Setup-0.1.0.exe` (75,659,196 bytes, 19:16). Inno again
  failed once with `EndUpdateResource failed (110)` (antivirus lock on the fresh EXE);
  an immediate retry succeeded. Owner still needs to install it and verify checks 1–3
  plus a real-printer test print.
