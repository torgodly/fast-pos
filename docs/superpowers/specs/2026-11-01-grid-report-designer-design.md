# Grid report designer (v2 template) — design

Date: 2026-11-01
Status: approved in brainstorming, pending owner spec review

## 1. Goal

Turn the `.fprep` designer from a fixed-block editor into a grid-based
designer for **all five documents** (`receipt`, `kitchen`, `shift`, `items`,
`sales`), so the owner can:

- place text, data fields, tables, the summary, logo, QR, and separators
  anywhere on the 32/48-column paper;
- bind any field the document already exposes (e.g. the waiter on a kitchen
  ticket) to a new element, or embed it in a sentence with
  `{{field.waiter}}`;
- keep the current fast ESC/POS printing, including the Arabic raster path.

The print pipeline stays line-based: the grid compiles to the existing
`LayoutLine[]`, then to ESC/POS bytes. No whole-ticket rasterization.

## 2. Decisions locked in brainstorming

| Question | Decision |
|---|---|
| DevExpress/Stimulsoft | Not used. Extend the native designer. |
| Documents on the grid | All five. |
| Layout model | Grid canvas: snap to character cells, no overlap, line-based print. |
| Template representation | New v2 element format; v1 auto-migrates. |
| Kitchen data | Existing `DocumentData` only (notes, void title, ticket part, order/table/waiter/time). No seat/course/modifier/reprint data. |
| QR content | `INV-<invoiceId>\|<total>\|<paidAt>`; receipt only. No URL, no custom pattern, no Code128. |
| Extra images | Logo only. No image library, no embedded images. |
| Fields | One `field` element per field (not a grouped block). |
| Field data in text | `{{field.<id>}}` tokens allowed in `text` elements, with an "insert data" dropdown. |
| One-way upgrade | v1 is migrated on load; saves and exports write v2. Old app versions reject v2. |

## 3. Template v2

```json
{
  "format": "fastpos-report",
  "version": 2,
  "document": "kitchen",
  "paper": { "columns": 32 },
  "elements": [ /* ... */ ],
  "labels": { "waiter": "السفرادجي" }
}
```

Strict shape: exactly `format`, `version`, `document`, `paper`, `elements`,
`labels`. Unknown keys are rejected. `version` must be `2`.
`document` must match the expected document when supplied (same rule as v1).

### 3.1 Common element fields

```ts
type ElementBase = {
  id: string;        // ^el_[a-z0-9_]{1,40}$, unique in the template
  type: ElementType; // see below
  row: number;       // integer 0..59
  col: number;       // integer 0..paper.columns-1
  width: number;     // integer 1..paper.columns; col + width <= paper.columns
  visible: boolean;  // default true (editor eye toggle)
};
```

Limits: 64 elements, 60 rows, 100 KB JSON (unchanged), 200 characters per
text/title/label (unchanged in spirit from v1).

Per-document duplicate limits:

- one `logo`, one `qr`, one `itemTable`, one `summary`;
- one `section` per `sectionId`;
- one `field` per `fieldId`;
- unlimited `text` and `separator`.

### 3.2 Element types

| `type` | Extra fields | Allowed where | Rendering |
|---|---|---|---|
| `text` | `text`, `align?`, `bold?`, `size?`, `hideWhenEmpty?` | all documents | Placeholders expanded (see 3.3). With `hideWhenEmpty !== false`, an empty expansion renders nothing. |
| `field` | `fieldId`, `align?`, `bold?`, `size?`, `hideWhenEmpty?` | `fieldId ∈ DOCUMENT_SPECS[doc].fields` | One line `label: value`, label from `labels[fieldId]`. With `hideWhenEmpty !== false`, an empty value renders nothing; otherwise it renders `label:`. |
| `logo` | `align?`, `maxWidth?` (64..384) | all documents | Existing receipt logo raster. Hidden when `data.logoAvailable` is false (today receipt data sets it true; kitchen/shift/items/sales set it false, so a logo stays invisible there). |
| `qr` | `sizePx` (96..384, default 192) | `receipt` only | Rasterized QR of the receipt payload. Hidden when the payload is unavailable. |
| `separator` | `hideWhenEmptyOf?: string[]` (max 12 element ids) | all documents | Full-width dashed line. Requires `col = 0` and `width = paper.columns`. Hidden when `visible` is false or every referenced element rendered nothing. |
| `itemTable` | `title?`, `showHeader?`, `showNotes?`, `columns` | documents with non-empty `itemColumns` | Repeating item rows with the column widths computed against the element's own `width`. Hidden when there are no items or no columns. |
| `section` | `sectionId`, `title?`, `columns?` | `sectionId ∈ DOCUMENT_SPECS[doc].sections` | `kv` sections ignore `columns`; `table`/`groupedTable` require `columns` whose keys are in the spec's `columnKeys`. Hidden per the current v1 empty rules. |
| `summary` | `label` (string, may be empty) | `summaryAllowed` documents | Bold `xlarge` `label: total` line; when the label is empty it renders the total alone. Hidden when there is no total. No separator is implied; separators are explicit elements. |

`align` is `right | center | left`; `size` is `small | normal | large | xlarge`.
`columns` entries are `{ key, label, width, align?, bold?, size? }`, 1–6
entries, unique keys, `width` 1..64, labels non-empty (same rules as v1).

### 3.3 Text placeholders

`text` expands:

- the document's existing global placeholders (`{{title}}`, `{{venue}}`,
  `{{subtitle}}`, `{{brand.phone}}`, `{{brand.address}}`, `{{footer}}`,
  `{{status}}` where the spec allows them); and
- field tokens `{{field.<id>}}` where `<id> ∈ spec.fields`.

Unknown tokens, malformed tokens, and stray braces are validation errors in
Arabic, as today. Field tokens expand to the raw field value and are not
recursively expanded. Field tokens are valid only in `text` elements; labels,
titles, and summary labels are not token-expanded (matching v1).

### 3.4 Labels

`labels` keeps the v1 shape: a map keyed by field ids and section row ids.
Unknown keys are rejected. A non-empty label is required for:

- every `fieldId` used by a `field` element;
- every row id of a **visible** `kv`/`groupedTable` section element (as v1
  required for visible sections).

The editor reads default labels from `DEFAULT_REPORT_TEMPLATES[document]` when
adding a field. Editing a label writes the shared map, so a renamed waiter
label applies everywhere.

### 3.5 QR payload

Receipt only, derived from existing data — no `DocumentData` change:

```
INV-<invoiceId without leading #>|<summary>|<fields.time>
```

Example: `INV-1024|245.50 د.ل|2026-11-01 14:32`.
If `fields.invoiceId` is missing/`—`, `summary` is null, or `fields.time` is
empty, the QR element renders nothing.

## 4. Validation

`parseReportTemplateJson` accepts both versions:

- `version: 2` → strict v2 validation.
- `version: 1` → existing v1 validation, then migration to v2, then v2
  validation (migration output must always be valid).
- Any other version → the existing "version غير مدعوم" error.

Additional v2 rules:

- element ids are unique and match `^el_[a-z0-9_]{1,40}$`;
- `row`, `col`, `width` are integers within bounds and
  `col + width <= paper.columns`;
- no overlaps: for each row, intervals `[col, col + width)` are disjoint;
- if a row contains any element whose type is not `text` or `field`, that row
  must contain exactly one element;
- `separator` requires `col = 0`, `width = paper.columns`, and every
  `hideWhenEmptyOf` id exists, is not a separator, is not self, and is unique;
- duplicate limits from 3.1 hold;
- document-specific allow-lists hold (`qr`, `itemTable`, `section`, `summary`,
  `fieldId`, column keys, placeholders);
- caps (64 elements, 60 rows) hold.

Errors are returned as an Arabic list, same mechanism as today. Invalid stored
v2 or v1 falls back to the document default with the existing one-time warning
in `store.ts`.

## 5. v1 → v2 migration

Runs in memory on load and on v1 `.fprep` import. Rows are assigned
sequentially in the v1 `order` (completed canonically by
`orderedBlockIds`). Each migrated element is full width at `col 0`, one per
row, in v1 print order. The original layout functions remain the parity
oracle.

### 5.1 Deterministic ids

- `el_logo`, `el_header_<i>`, `el_field_<fieldId>`, `el_items`,
  `el_section_<sectionId>`, `el_summary`, `el_footer_<i>`;
- generated separators: `el_sep_header`, `el_sep_fields`, `el_sep_items`,
  `el_sep_<sectionId>`, `el_sep_summary`, `el_sep_footer`.

New elements added in the editor use `el_` plus a short random suffix.
Duplication generates a fresh id.

### 5.2 Block mapping

| v1 input | v2 output (rows in print order) |
|---|---|
| `header.show === false` | logo/text elements with `visible: false`; the header separator is also created with `visible: false`. |
| `header.logo.show` | `logo` element (`align`, `maxWidth`) |
| `header.lines[i]` | `text` element per line (`text`, `align`, `bold`, `size`) |
| `header.separator` | `separator` **after** the header elements, `visible = header.show` |
| `fields.show[i]` | `field` element per id, `visible = fields.visible` |
| `fields.separator` | `separator` **after** the field elements, `visible = fields.visible` |
| `items.show` | `itemTable` element, `visible = items.show`, with `title`, `showHeader`, `showNotes`, `columns` |
| `items.separator` | `separator` **after** the item table, `visible = items.show` |
| each `sections[i]` | `section` element, `visible = section.show`, with `title` and `columns` for table kinds |
| section `separator` | `separator` **before** the section element, `visible = section.show` |
| `summary.show` | `summary` element with `label`, `visible = summary.show` |
| `summary.separator` | `separator` **before** the summary element, `visible = summary.show` |
| `footer.lines[i]` | `text` element per line, `visible = footer.show` |
| `footer.separator` | `separator` **before** the footer texts, `visible = footer.show` |

Notes:

- Documents without item columns (shift, items, sales) get no `itemTable` **and
  no item separator**; their v1 items block had no columns and could not show.
- `footer.lines` empty → no footer text elements and no footer separator
  (v1 printed nothing).
- A hidden `summary` with an empty label stays valid (v1 allowed that); the
  migrated summary keeps the empty label.
- `header.show === false` / `fields.visible === false`: elements and their
  separator are still created but `visible: false`, so the owner can re-enable
  them without losing configuration.
- v1 semantics are data-dependent for some separators. Every migrated
  separator sets `hideWhenEmptyOf` to the elements of the block it belongs to
  (header elements, all field elements, `[itemTable]`, `[section]`,
  `[summary]`, footer texts), reproducing v1 behavior when the block renders
  nothing. The cap is 12 rather than 8 so the receipt's field separator can
  reference all nine default field elements without losing parity. When the
  block itself has no elements (`footer.lines` empty), no separator is created
  at all.
- `labels` is copied verbatim.

### 5.3 Compatibility

- Stored templates remain in the existing `report_template.<document>` settings
  keys; no DB migration.
- `loadReportTemplate` returns v2; `persistReportTemplate` stores v2.
- `.fprep` import accepts v1 (migrates) and v2; export writes pretty-printed v2.
- Backup/restore containing v1 keys loads and migrates on first use.

## 6. Rendering

`lib/print/templates/layout.ts` exposes `layoutTemplate(templateV2, data):
LayoutLine[]`. The build/render callers keep their signatures.

### 6.1 Row flow

1. Respect `visible` and per-type empty rules; compute each element's rendered
   `LayoutLine[]` (`[]` when hidden/empty).
2. Iterate rows `0..maxRow` where `maxRow` is the largest row index that
   contains at least one element. Trailing empty rows are ignored.
3. A row with **no elements** emits one blank text line (a gap). Consecutive
   empty rows emit consecutive blank lines.
4. A row whose elements all rendered nothing emits nothing (it collapses;
   this is the data-empty case, not the explicit gap case).
5. A row with one element emits that element's lines. Text/field at
   `col = 0` and `width = paper.columns` emit plain `text` lines — the byte
   parity path with v1. Narrower or offset text/field elements emit
   `columns` lines with blank padding cells so the horizontal position is
   preserved.
6. A row with multiple elements is allowed only when every element is
   `text`/`field` (validated). Each element renders one line; the row composes
   one `columns` line whose widths are the element regions plus blank gaps and
   whose cells carry each element's text/align/bold/size.
7. Data blocks (`itemTable`, `section`, `summary`) expand to many lines; rows
   below shift down. They are always alone in their row.

Blank gap lines use the existing text line shape (`text: ""`, right align,
normal size).

### 6.2 Element rendering details

- `itemTable`: title (bold; global placeholders expanded, no field tokens),
  optional header row, one `columns` line per item, name wrapping (existing
  `wrapWords` behavior), optional note line (`• note`, small). Table widths
  use `tableWidths(columns, element.width)`.
- `section`: same logic as v1 `layoutSection`, with `tableWidths` using the
  element width. The section title prints verbatim (v1 behavior). No implicit
  separator; separators are explicit elements.
- `summary`: the v1 summary text line (bold, `xlarge`), label verbatim.
- `field`: `${labels[fieldId]}: ${value}`.
- `text`: expanded text with its style.

### 6.3 Images (logo, QR)

- `logo` at full paper width (`col 0`, `width = paper.columns`) keeps today's
  `appendLogo(parts, logo, align)` byte path, preserving v1 parity.
- `logo`/`qr` in a narrower or offset region are rendered as a raster padded
  to the full 384 px paper width with transparent pixels, then appended with
  left alignment. This positions the image without new ESC/POS commands and
  keeps one raster command per image. A QR is centered within its region.
- `qr` adds a new `LayoutLine` kind `{ kind: "qr"; payload: string; sizePx:
  number; col: number; width: number; columns: 32 | 48 }`. `renderLayout`
  generates the raster synchronously and appends it. Payloads are cached in a
  bounded map (64 entries) keyed by `payload|sizePx`, because invoice ids make
  payloads unique.
- QR generation: small MIT dependency `qrcode-generator` for the module matrix;
  `pngjs` (already a dependency) builds the PNG with a quiet zone; the existing
  `pngToEscPosRaster` converts it. No whole-page rasterization, no change to
  the Arabic raster path.

### 6.4 Parity requirement

For every default template, `renderLayout(layoutTemplateV1(defaultV1), data)`
must equal `renderLayout(layoutTemplateV2(migrate(defaultV1)), data)` byte for
byte with the same logo/QR options and sample data. This includes separator
placement (after header/fields/items; before sections/summary/footer), text
styles, title/summary handling, and logo bytes.

## 7. Editor

`/admin/reports/design` keeps its five document tabs, unsaved-changes modal,
sample/blank toggle, save, test print, import/export, reset, advanced JSON,
and undo/redo.

### 7.1 Canvas

- Paper is rendered at the template's 32/48 columns with a toggleable cell
  grid; elements render through the real `layoutTemplate` with sample data, so
  canvas and printer cannot diverge.
- Elements that render nothing in the sample are shown as dashed
  type-labeled placeholders in the editor only, so they stay selectable.
- Drag with Pointer Events by a grip; snap to row/col. A drop that overlaps or
  violates the "block alone in row" rule is rejected and the card springs
  back with an Arabic hint. `pointerup` commits; `pointercancel` and
  `lostpointercapture` abort (as today).
- Arrow keys nudge the selected element one cell; a blocked nudge is a no-op.
  Delete removes the element (undo available, no confirmation) and removes its
  id from any separator's `hideWhenEmptyOf` list; deleting a referenced element
  never leaves a dangling reference.
- Touch targets: grips/nudge handles 40 px; other controls keep `btn-sm`
  sizing and `touch-none select-none` on drag surfaces.

### 7.2 Palette and inspector

- Palette filtered by `DOCUMENT_SPECS`: Text, Field, Logo, QR (receipt), Item
  table (where item columns exist), one entry per section, Summary (where
  allowed), Separator. Entries that would violate a unique limit are disabled
  once used (the Field entry lists only unused field ids; logo/item
  table/summary/QR/section entries hide or disable after use).
- Adding places the element at the first compatible free position (blocks need
  an empty row; text/field find a free interval), default full paper width
  (QR width 8 cells, `sizePx: 192`).
- Text inspector: textarea, insert-data dropdown (global placeholders + field
  tokens, inserted at the caret), align/bold/size, `hideWhenEmpty`, row/col/
  width, duplicate, delete.
- Field inspector: field picker, label (writes `labels`), style,
  `hideWhenEmpty`, position, delete. Duplicate is disabled (one per field).
- Other inspectors expose the fields in 3.2; numeric inputs use draft values
  committed on blur (existing pattern). Duplicate is disabled for unique
  types.
- Separator inspector exposes `hideWhenEmptyOf` as an optional multi-select of
  other elements; default empty (always visible).
- Eye toggles map to `visible`; the inspector shows the same spec-gated hints
  as today.

### 7.3 State and conversions

- `useTemplateEditor` history/coalescing is reused with v2 element operations
  (add, delete, move, nudge, style, width, visibility, reorder within row).
- Advanced JSON shows v2; invalid JSON or v2 errors keep the canvas unchanged.
  Pasting v1 JSON migrates it and shows a note.
- Document switch with unsaved changes keeps the in-app modal and the browser
  warning on close.

## 8. Files

New:

- `lib/print/templates/elements.ts` — v2 types, element id helpers, allowed-type
  helpers, duplicate limits.
- `lib/print/templates/schema-v2.ts` — strict v2 validator.
- `lib/print/templates/migrate.ts` — v1 → v2 migration with deterministic ids.
- `lib/print/templates/layout-v2.ts` — v2 layout (row flow, composition).
- `lib/print/templates/qr.ts` — payload builder, QR PNG, bounded cache.
- `components/admin/report-design/ElementPalette.tsx`,
  `ElementCard.tsx`, `ElementInspector.tsx`, `GridCanvas.tsx` (replacing
  `CanvasBlock`, `BlockInspector`, `ReportCanvas`, `CanvasLines` as needed).
- Tests alongside each new module and updated editor tests.

Modified:

- `lib/print/templates/types.ts` — v2 types, `qr` layout line kind.
- `lib/print/templates/schema.ts` — version detection, v1 path preserved for
  import/migration, v2 delegation.
- `lib/print/templates/layout.ts` — re-export v2 as `layoutTemplate`; v1
  functions retained for migration parity tests.
- `lib/print/templates/render.ts` — QR line rendering.
- `lib/print/templates/store.ts` — v2 load/persist.
- `lib/print/templates/defaults.ts` — all five defaults rewritten as v2 with
  identical printed output; labels unchanged.
- `lib/print/templates/document-specs.ts` — add `qr: boolean`.
- `app/actions/report-templates.ts` — messages/version handling.
- `components/admin/report-design/*` and `ReportDesignAdmin.tsx`.
- `package.json` — `qrcode-generator`.
- `README.md`, `PROJECT_INDEX.md`, `docs/worklog/`.

Deleted: the v1 block editor components that the grid replaces, once the
migration/parity tests pass.

## 9. Testing

- v2 schema: valid defaults; every invalid rule in section 4 (bounds, overlap,
  block-alone, duplicates, allow-lists, tokens, separator references, caps).
- Migration: each default and stored-variant shape (hidden header/fields,
  empty footer, sections on/off, `summary.separator` before, field order,
  custom labels) → deterministic ids and exact element order.
- Parity: byte-for-byte `renderLayout` equality for all five defaults and for
  the stored-variant fixtures, with and without logo.
- Layout v2: row gaps, collapsed data-empty rows, multi-text/field composition
  and gaps, offset text padding, block expansion pushing rows, per-element
  widths, hidden/empty rules, separator `hideWhenEmptyOf`.
- Render: QR payload, raster bounds/quiet zone, padded image placement,
  bounded cache; Arabic raster path unchanged.
- Editor: add/delete/nudge/drag rejection/inspector edits/undo/redo/save
  modal/advanced JSON v1 import; spec-gated palette and hints.
- Commands: `npx vitest run`, `npx tsc --noEmit`, `npx eslint` on touched
  paths, `npm run build`. Editor tests must not open the live DB (mock
  `@/lib/settings` or use in-memory data, per project rule).
- Owner checks: install the built EXE and test print all five documents on the
  real receipt and kitchen printers, including Arabic, after a restart, and
  confirm a v1 design saved before the upgrade still prints the same and saves
  as v2.

## 10. Rollout, risks, non-goals

Rollout:

- One-way upgrade: saved designs become v2 on the next save; older app builds
  treat v2 as invalid and fall back to the built-in defaults with the existing
  warning, so upgrading is one-way.
- No DB migration; settings keys and backup format are unchanged.
- Installer is built and installed only after owner review, per project rule;
  the agent does not commit.

Risks and mitigations:

- **Parity drift** → dedicated byte-parity tests and v1 layout retained as the
  oracle.
- **Grid complexity** → the "block alone in row" rule keeps composition
  line-based and testable; overlaps are rejected.
- **Data-dependent separators** → `hideWhenEmptyOf` reproduces v1 behavior.
- **QR dependency/build** → pure-JS MIT package, rasterized locally; verify in
  the standalone build and installer.
- **Editor regressions** → existing undo/coalescing and save/test-print guards
  are reused; component tests cover the new interactions.

Non-goals:

- DevExpress/Stimulsoft or any external report engine.
- Whole-ticket raster or pixel-absolute/overlapping layout.
- New order data (seat/course/modifiers/reprint/category per line).
- Extra images, image library, QR URLs, custom QR patterns, barcodes.
- Multi-page reports or arbitrary font sizes beyond the four existing sizes.

## 11. Definition of done

- All five documents use the grid designer; owners can add text, field, logo,
  QR (receipt), item table, sections, summary, and separators; drag/snap,
  reorder within a row, nudge, hide, edit styles, and use field tokens.
- Stored v1 designs load, print identically, and save as v2; import/export
  round-trips v2 and imports v1.
- Existing print speed/profile is unchanged except QR/image raster blocks;
  Arabic printing is unchanged.
- Validation, migration, parity, layout, render, and editor tests pass; `tsc`,
  `eslint` on touched paths, and `npm run build` succeed.
- Worklog and `README.md`/`PROJECT_INDEX.md` describe the v2 format and
  migration.
