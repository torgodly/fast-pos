# Report designs (`.fprep`) and the four-column receipt table — design

Date: 2026-10-31
Status: approved design, implementation pending
Scope: customer receipt layout, kitchen ticket, shift reports, sales & items report, new admin design page, printing pipeline

## Problem

1. The customer receipt prints each item as a wrapped name followed by
   `qty x price  =  total` on its own line. The owner wants a real four-column table:
   item name | quantity | price | total.
2. Every document layout is hard-coded in `lib/print/escpos.ts`. Changing a label,
   hiding a field, or reordering a section requires a code change and a new installer
   build, which is impractical for a single restaurant owner.

The owner is familiar with DevExpress report designers (`.repx`) and asked for the same
idea: a file-based, editable layout file with an in-app designer.

## Goals

1. The customer receipt renders a four-column items table by default.
2. All five printed documents are driven by an editable layout file: customer receipt,
   kitchen ticket, shift report, shift-items report, sales & items report.
3. A new admin page edits those layouts with a live preview, test print, import/export
   of `.fprep` files, a raw JSON editor, and reset-to-default.
4. Printing never fails because of a bad or missing layout: the built-in default is used.
5. Existing installations upgrade without touching data; layouts live in the database
   and therefore survive installer upgrades and are covered by backups.

## Non-goals

- Pixel-level canvas designer, drag-free placement coordinates, or WYSIWYG page layout.
- Custom fonts, colors, images other than the existing receipt logo, barcodes, or QR.
- Multiple named layouts per document or per-venue layouts.
- Conditional logic, repeaters, or expressions beyond a fixed placeholder whitelist.
- Changing printing transports, printer configuration, or the browser-free printing flow.
- A browser/HTML print path.

## Decisions

| Decision | Choice |
| --- | --- |
| File format | JSON document with `.fprep` extension, `format: "fastpos-report"`, `version: 1` |
| Designer model | Hybrid: structured bands (header, fields, items table, sections, summary, footer) plus free text/logo elements inside header and footer |
| Item rows | Text per cell, laid out by a column table; weights normalized to the paper width |
| Storage | `app_settings` key `report_template.<document>`; defaults live in code |
| Import/export | Real `.fprep` file upload/download in the browser; the DB remains the source of truth |
| Bad stored layout | Fall back to the built-in default and log one warning per document per process |
| Editing guard | Template edits never affect a sale in progress; print builders read the stored layout at print time |
| Access | Admin only, all actions audited |

## Architecture

### 1. Template model

```ts
type ReportDocument = "receipt" | "kitchen" | "shift" | "items" | "sales";

type Align = "right" | "center" | "left";
type TextSize = "small" | "normal" | "large" | "xlarge";

type TemplateLine = {
  text: string;            // may contain whitelisted {{placeholders}}
  align?: Align;           // default "right"
  bold?: boolean;
  size?: TextSize;         // default "normal"
};

type TemplateColumn = {
  key: string;             // whitelisted per document
  label: string;
  width: number;           // positive integer weight, not a character count
  align?: Align;
  bold?: boolean;
  size?: TextSize;         // default "normal"
};

type ReportTemplate = {
  format: "fastpos-report";
  version: 1;
  document: ReportDocument;
  paper: { columns: 32 | 48 };            // character grid used by the text fallback
  header: {
    logo: { show: boolean; align?: Align; maxWidth?: number }; // 64..384, default 256
    lines: TemplateLine[];                 // max 6
    separator?: boolean;                   // divider after the header block
  };
  fields: {
    show: string[];                       // ordered whitelisted field ids
    separator?: boolean;                   // divider after the fields block
  };
  items: {
    show: boolean;
    title?: string;                       // hidden when empty
    header?: boolean;                     // print the column header row
    showNote?: boolean;                   // note under the item row
    columns: TemplateColumn[];            // max 6
    separator?: boolean;                   // divider after the items block
  };
  sections: Array<{
    id: string;                           // whitelisted per document
    title: string;
    show: boolean;
    separator?: boolean;
    columns?: TemplateColumn[];           // table/groupedTable sections only, max 6
  }>;
  summary: {
    show: boolean;
    label: string;                        // "الإجمالي" etc.
    separator?: boolean;                  // divider before the summary
  };
  labels: Record<string, string>;         // field ids and static section row ids
  footer: {
    separator?: boolean;
    lines: TemplateLine[];                // max 6
  };
};
```

Item column labels live in `TemplateColumn.label`; `labels` covers fields and static
section rows only. Payment rows keep the payment-method names from the data.

Placeholders and where they are allowed:

| Placeholder | Value | Allowed in |
| --- | --- | --- |
| `{{title}}` | Document title for this print (brand name on receipts, `طلبات المطبخ`, `إغلاق وردية #4`, …) | all |
| `{{venue}}` | Venue display name | all |
| `{{subtitle}}` | Receipt subtitle — `${venue} · إيصال الدفع`, or `إيصال الدفع` when no brand name is set | `receipt` |
| `{{brand.phone}}` | Brand phone (empty → line skipped) | `receipt` |
| `{{brand.address}}` | Brand address (empty → line skipped) | `receipt` |
| `{{footer}}` | Receipt footer message from settings | `receipt` |

Newlines are not supported inside text lines; the renderer wraps long lines to the paper
width. A line that expands to an empty string is skipped (no blank line), so optional
brand fields do not leave gaps.

### 2. Per-document whitelist

| Document | Fields | Item columns | Sections | Summary |
| --- | --- | --- | --- | --- |
| `receipt` | `orderNo`, `invoiceId`, `table`, `waiter`, `customer`, `phone`, `cashier`, `payment`, `time` | `name`, `qty`, `unitPrice`, `lineTotal` | — | allowed |
| `kitchen` | `orderNo`, `table`, `waiter`, `time`, `ticketPart` | `name`, `qty` | — | off |
| `shift` | `workDate`, `openedAt`, `closedAt`, `printedAt`, `printedByName`, `openedByName`, `closedByName` | — | `collection`, `expenses`, `reconciliation` | off |
| `items` | `workDate`, `printedAt`, `printedByName` | — | `overview`, `groups` | allowed |
| `sales` | `from`, `to`, `printedAt` | — | `totals`, `categories`, `itemsList` | allowed |

Section types and row ids (static row ids are also keys in `labels`):

- `collection` (key/value): `invoiceCount`, `total` (bold), payment rows (dynamic, no id),
  `noPayments`, `totalItems`, `tableQuick`.
- `expenses` (key/value, `shift`): `openingFloat`, expense rows (dynamic reason),
  `expenseTotal`; when no expense was recorded the adapter inserts a label-only
  `لا مصروفات في هذه الوردية` row between the opening float and the total.
- `reconciliation` (key/value, `shift`): `expectedCash`, `countedCash`,
  `difference` (bold).
- `overview` (key/value, `items` document): `categoryCount`, `itemCount`,
  `totalItems` (bold).
- `groups` (grouped table, `items` document): category heading rows (dynamic), item rows
  with columns `name`/`qty`, and a per-group subtotal labelled `labels.groupTotal`.
- `totals` (key/value, `sales`): `total` (bold), `invoiceCount`, `totalItems`,
  `tableQuick`, payment rows (dynamic), `noPayments`.
- `categories` / `itemsList` (table, `sales`): columns `index`, `name`, `qty`, `revenue`.

Table and grouped-table sections carry their own column list in the template, so their
labels, widths, alignment, and styles are customizable the same way as the item table.

Bands that are not applicable to a document are forced off and hidden in the designer.

### 3. Layout engine (pure, isomorphic)

`lib/print/templates/layout.ts` turns `(template, DocumentData)` into a line model. It has
no Node or DB imports, so the admin page runs the identical code for previews.

```ts
type DocumentData = {
  title: string;
  subtitle: string;                                   // receipt only; empty elsewhere
  venue: string;
  brandPhone: string;
  brandAddress: string;
  footer: string;                                     // receipt footer message
  status: string;                                     // shift close/open status
  logoAvailable: boolean;
  fields: Record<string, string | null>;               // values for whitelisted ids
  items: Array<Record<string, string>>;                // cell text per column key
  itemNotes: Array<string | null>;                     // parallel to items
  sections: Record<
    string,
    {
      kind: "kv" | "table" | "groupedTable";
      rows: Array<{ labelId?: string; label?: string; value: string; bold?: boolean }>;
      table?: Array<Record<string, string>>;
      groups?: Array<{
        label: string;
        rows: Array<Record<string, string>>;
        total: string;
      }>;                                              // groupedTable only
      emptyText?: string;                              // centered when the section is empty
    }
  >;
  summary: string | null;                              // pre-formatted value or null
};

type LayoutLine =
  | { kind: "text"; text: string; align: Align; bold: boolean; size: TextSize }
  | { kind: "separator" }
  | { kind: "logo"; align: Align; maxWidth: number }
  | { kind: "columns"; widths: number[]; cells: Array<{ text: string; align: Align; bold: boolean; size: TextSize }> };
// `widths` are normalized character counts summing to `paper.columns`.
```

Rules:

- Header: logo (when shown and available), then lines in order.
- Fields: one `label: value` line per shown field that has a non-empty value, in the
  template's order. Labels come from `labels[id]`.
- Items: optional title, optional separator, optional header row (labels from the
  matching column `label`), then one `columns` line per item plus a wrapped continuation
  line whenever the name cell needs more than one line; continuation lines carry the
  name only. Cells use the column `bold`/`size`/`align`. Notes render as a separate small
  right-aligned line (`• note`) when `showNote` is true.
- Sections: in the template's order; `kv` rows render as `label: value` (a row with an
  empty value renders the label alone); `table` sections
  render a header row and one `columns` line per row using the section's `columns`;
  `groupedTable` renders, per group, a centered bold heading (`— name —`), its rows using
  the section's `columns`, and its subtotal line, separated from the next group. A section
  with no rows or groups renders `emptyText` centered when provided; otherwise an empty
  `kv` section is skipped.
- Summary: a bold `xlarge` text line `label: value`, when `show` and a value exists. The
  value is preformatted by the adapter (`money()` for money totals, `N قطعة` for the items
  ticket).
- Footer: optional separator, then lines.
- Separator flags are trailing for `header`, `fields`, and `items` (divider after the
  band), and leading for a section, the summary, and the footer (divider before it). A
  divider is emitted only when the adjacent band actually produced lines, so empty
  optional fields never leave double rules. The defaults keep the current visual rhythm
  (header | fields | items | sections | summary | footer).

Column widths are weights. `lib/print/templates/columns.ts` normalizes them to the paper
width and exposes:

- `charWidths(widths, columns)` — integer character counts summing to `paper.columns`,
  used by the text fallback.
- `pixelWidths(widths, 384)` — integer pixel widths summing to the raster width.

`lib/print/templates/layout.ts` applies a label-minimum rule on top of the weights: a
table column may never be narrower than its own header label (the header prints those
labels verbatim, so a short weight such as a 4-character quantity column could not hold
`الكمية`). `tableWidths(columns, paper)` reserves each label's length first, then shares
the remaining width by each column's extra weight. Widths still sum to the paper width;
only columns whose label exceeds their weight grow, at the expense of their neighbors.
With the default receipt template on 32 columns this yields `[10, 7, 6, 9]`.

Columns are placed right-to-left, matching Arabic reading order: the first column in the
template (`الصنف`) sits at the right edge. The text fallback builds the row by reversing
the cells before padding; the raster renderer draws at the computed offsets from the
right edge; the preview uses `row-reverse`.

### 4. Byte renderer (server)

`lib/print/templates/render.ts` converts `LayoutLine[]` to ESC/POS bytes using the
existing primitives:

- Shared helpers (`concat`, `cmd`, `textLine`, `money`, `init`, `align`, `bold`,
  `doubleSize`, `cut`, `separator`, `printLine`) move to `lib/print/primitives.ts`;
  `lib/print/escpos.ts` imports from there and keeps `buildTestEscPos` with its local
  helpers.
- `text` / `kv` → `printLine` (Arabic raster when enabled, text otherwise). Both modes
  support right/center/left; the raster path draws left-aligned text at x = 0, so
  `textToEscPosRaster` gains a `"left"` alignment value.
- `separator` → the existing 32-dash separator.
- `logo` → `getReceiptLogoEscPos(maxWidth)`; the helper gains an optional `maxWidth`
  argument (default 384) and its cache key includes the width.
- `columns` → new `columnsToEscPos` in `lib/print/text-raster.ts`:
  - Raster enabled: one canvas per row, 384 px wide, cells drawn at measured x offsets
    (`align` right/center/left inside the cell), RTL direction for right-aligned text,
    LTR for numeric cells. Cells share a baseline using the row's largest configured
    size. If a cell exceeds its width, the row font is reduced from its configured size
    in 2 px steps down to 20 px before the text is clipped with `…`.
  - Raster disabled: `columnsToText(cells, charWidths)` pads with spaces; numeric cells
    that exceed their width are truncated only as a last resort.
- Text sizes map to pixels 22/26/30/34; the text mode maps `large`/`xlarge` (≥ 32 px) to
  `doubleSize`.
- Every document starts with `init()` and ends with `cut()`; the 8-line cutter feed is
  preserved.

### 5. Document data adapters

`lib/print/templates/data.ts` maps the existing print data types to `DocumentData`:

- `receipt`: order number, invoice id, table, waiter, customer, phone, cashier, payment
  label, paid time; item cells formatted as name, `qty`, `unitPrice.toFixed(2)`,
  `lineTotal.toFixed(2)`; summary `money(total)`. Title, brand contacts, and footer come
  from settings; the title is the brand name, falling back to the venue name.
- `kitchen`: ticket title (`طلبات المطبخ` / `إلغاء — لا تحضّر`), order number, table,
  waiter, created time, ticket part; name and qty cells.
- `shift`: title by `kind` (`ملخص` / `إغلاق` / `إعادة طباعة` + `#number`), the date/time
  fields, and the `collection` / `cash` sections from `ShiftReportPrintData`.
- `items`: title `تقرير أصناف الوردية #N` (plus `— إعادة طباعة` for a reprint), date/print
  fields, the `overview` counts, the category `groups` with their subtotals, and the grand
  total as the summary.
- `sales`: title `تقرير المبيعات`, from/to/printed fields, `totals` key/value rows,
  `categories` and `itemsList` tables, summary total.

Adapters are pure functions of their input plus the current settings; they never throw on
missing optional values.

### 6. Print entry points

`lib/print/templates/build.ts` exports async builders that load the stored template,
adapt the data, fetch the logo when needed, and render:

```ts
buildReceiptEscPos(data: CheckoutReceiptData): Promise<Uint8Array>
buildKitchenEscPos(data: KitchenReceiptData): Promise<Uint8Array>
buildShiftReportEscPos(data: ShiftReportPrintData): Promise<Uint8Array>
buildShiftItemsEscPos(data: ShiftItemsPrintData): Promise<Uint8Array>
buildSalesReportEscPos(data: ReportSummaryPrintData): Promise<Uint8Array>
```

- `lib/print/checkout-bytes.ts` keeps its signature and delegates to
  `buildReceiptEscPos` (unpaid previews included).
- `app/actions/orders.ts` kitchen/void printing awaits `buildKitchenEscPos`.
- `app/actions/reports.ts` awaits `buildSalesReportEscPos`, `buildShiftReportEscPos`,
  and `buildShiftItemsEscPos`.
- `buildTestEscPos` stays as the raw printer diagnostic and is not template-driven.
- The old document builders and their private helpers in `escpos.ts`
  (`buildCheckoutEscPos`, `buildKitchenEscPos`, `buildReportSummaryEscPos`,
  `buildShiftReportEscPos`, `buildShiftItemsEscPos`, `printWrappedName`, `kitchenLine`,
  `printSalesRow`, `itemQuantityRow`) are removed once no caller remains.
  `headerBlock`/`reportSep` stay because `buildTestEscPos` still uses them, and
  `chunkKitchenLines`/`KITCHEN_ITEMS_PER_TICKET` stay exported. Update every import
  (tests included) in the same change.

Print builders read the stored template synchronously through better-sqlite3; a template
read is a primary-key lookup and adds no meaningful latency to a print.

### 7. Default templates

Defaults live in `lib/print/templates/defaults.ts` as code constants (never as shipped
`.fprep` files, because the installer payload overwrites files under `{app}` while
`data/` is preserved).

The default receipt (`receipt`) produces:

```
        [logo]
        {{title}}                 (center, bold, xlarge)
        {{subtitle}}              (center)
        {{brand.phone}}           (center, small)
        {{brand.address}}         (center, small)
--------------------------------
رقم الطلب: 12
فاتورة: #148
الطاولة: 4
السفرادجي: أحمد
الكاشير: سارة
الدفع: نقدي
الوقت: 2026-10-31 14:05
--------------------------------
الأصناف
الصنف        الكمية   السعر   الإجمالي
كابتشينو        2      12.00     24.00
قهوة عربية      1       8.00      8.00
  • بدون سكر
--------------------------------
الإجمالي: 32.00 د.ل            (bold, xlarge)
        {{footer}}             (center)
```

- Column weights: `name 11`, `qty 4`, `price 7`, `total 8` (sum 30; normalized).
- Amount cells show the plain amount without `د.ل`; the summary line carries the currency.
- The header row uses the column labels; `items.header` defaults to true.
- `items.showNote` defaults to true.
- Fields default order: `orderNo`, `invoiceId`, `table`, `waiter`, `customer`, `phone`,
  `cashier`, `payment`, `time`; empty values are hidden (so optional customer fields do
  not print labels without values).
- Labels default to the current Arabic strings.

Default shapes for the other documents preserve today's layouts:

- `kitchen`: logo off; `{{title}}` center xlarge bold; order/table/waiter/time/ticket part
  fields; items title off; name (bold, large, weight 26) and qty (weight 6); no summary;
  footer empty; no divider between the title and the fields block (one divider follows
  the fields and another follows the items). Ticket chunking
  (`KITCHEN_ITEMS_PER_TICKET = 18`) stays in the caller.
- `shift`: logo off; `{{title}}` header + venue; fields listed above; `collection`,
  `expenses`, and `reconciliation` sections with the existing labels; summary off; footer
  line `تم إغلاق الوردية` / `الوردية ما زالت مفتوحة`.
- `items`: `{{title}}` + venue header; date/print fields; `overview` counts; `groups`
  grouped table (`name` weight 26, `qty` weight 6) with per-category subtotals; summary
  `الإجمالي العام`; footer `— نهاية التقرير —`.
- `sales`: `{{title}}` + venue; from/to/printed fields; `totals` section (`invoiceCount`,
  `totalItems`, `tableQuick`, payment rows); `categories` and `itemsList` table sections
  with `index` weight 3, `name` weight 17, `qty` weight 5, `revenue` weight 9; summary
  total on; footer `— نهاية التقرير —`.

### 8. Storage

`lib/print/templates/store.ts` (server-only):

```ts
loadReportTemplate(doc): ReportTemplate          // stored → validate → fallback default
getReportTemplateJson(doc): string               // pretty JSON of the effective template
persistReportTemplate(doc, json: string): { ok: true } | { ok: false; errors: string[] }
deleteReportTemplate(doc): void                  // DELETE the app_settings row
```

- Key format: `report_template.<doc>`.
- `loadReportTemplate` parses and validates. On any failure it returns
  `DEFAULT_REPORT_TEMPLATES[doc]` and logs
  `[report-template] <doc>: <reason>; using default` once per document per process.
- Store access needs exported value helpers in `lib/settings.ts`
  (`getSettingValue`, `setSettingValue`, `deleteSettingValue`) because its current
  `getSetting`/`setSetting` are private.
- No new tables, migrations, or DDL. `app_settings` is already part of the backup archive,
  so `.fastpos` backups and restores cover designs with no change to
  `lib/backup/core.ts`.
- The installer replaces only the shipped payload; templates stored in `data/pos.db` are
  untouched by upgrades.

### 9. Validation and safety

`lib/print/templates/schema.ts` exports `validateReportTemplate(value, expectedDoc?)`.

- Strict object shapes: unknown keys are rejected; types and ranges are checked.
- `paper.columns` ∈ {32, 48}; column widths are integers 1..64; at most 6 item columns;
  at most 6 header lines, 6 footer lines, and 40 configured text lines overall; each text
  line ≤ 200 characters.
- Field ids, column keys, section ids, and label keys must belong to the document's
  whitelist; section order follows the template but may be reordered, not invented.
- `table`/`groupedTable` sections require at least one whitelisted column `columns`;
  `kv` sections must omit `columns`.
- `labels` must define every field listed in `fields.show` and every static row id of an
  enabled `kv` section; unused extra labels are allowed.
- Placeholders must be whitelisted for the document; an unknown `{{…}}` is an error with
  the offending token in the message.
- `kitchen` and `shift` must have `summary.show = false`; `receipt` and `kitchen` must
  have empty `sections`; `shift`, `items`, and `sales` may use only their whitelisted
  sections, each at most once. Documents with no item columns must have `items.show = false`.
- Uploads are limited to 100 KB of UTF-8 JSON; anything larger is rejected before parsing.
- C0/C1 control characters are stripped from user text before rendering, so a design file
  cannot inject ESC/POS commands. The renderer only emits commands it constructs itself.
- Validation messages are Arabic and name the JSON path (e.g.
  `items.columns[3].width غير صالح`).

### 10. Admin design page

Route: `app/admin/(panel)/reports/design/page.tsx`; nav entry
`/admin/reports/design` labelled **تصميم التقارير** (`FileText` icon) placed after
**التقارير**.

The server page loads the five effective templates, their raw JSON, a `DocumentData`
sample per document, the venue name, and whether a receipt logo exists, then renders
`components/admin/report-design/ReportDesignAdmin.tsx` (client).

Layout: document tabs, then three panes.

- **Left — عناصر التصميم**: element tree (header, fields, items, sections, summary,
  footer) that selects which element the properties pane edits.
- **Middle — الخصائص**: properties of the selected element — header text lines and logo
  toggle; field labels; items header toggle plus column label/width; per-section toggle,
  title and column labels; summary toggle and label; footer text lines. Adding or
  removing lines, enabling/reordering columns, and editing separator flags are done
  through the JSON editor rather than dedicated buttons.
- **Right — المعاينة**: an 80 mm white strip (384 px scaled to fit) with black Tahoma
  text. It renders `layoutTemplate(currentTemplate, sampleData[doc])`; a logo line is
  shown as a `[شعار]` placeholder, hidden when `logo.show` is false. Line breaks,
  alignment, and column placement mirror the raster renderer.

Toolbar: **حفظ** (save), **استعادة الافتراضي** (reset with confirmation), **استيراد**
(`<input type="file" accept=".fprep,application/json">`), **تصدير** (Blob download named
`fastpos-<doc>.fprep`), **JSON** editor tab, and **طباعة تجريبية** with a printer select.

Behavior:

- Edits update the preview immediately; the JSON editor shows the same document and can
  apply raw JSON to the preview (`تطبيق`). Parse/validation errors are listed with paths
  and block saving.
- Import loads the file into the editor/preview with a notice that it is not saved until
  **حفظ** is pressed.
- Switching tabs or leaving the page with unsaved changes asks for confirmation
  (`beforeunload` + in-page confirm).
- Reset restores the built-in default from the server and clears the stored row.
- Test print validates the current editor JSON, builds the document with sample data,
  routes to the selected printer (Windows system → `printRawToWindowsPrinter`,
  network → `printToPrinter`), and reports Arabic success/failure. Default printer:
  the first active printer.

Sample data (`lib/print/templates/sample.ts`) is fixed and realistic for all five
documents (three receipt items with a note, customer, several payment methods, category
groups, report sections) so previews and test prints are repeatable; title, brand,
footer, and venue values come from settings.

### 11. Server actions

`app/actions/report-templates.ts` (all call an `assertAdmin` copied from the existing
admin-action pattern):

| Action | Behavior |
| --- | --- |
| `saveReportTemplate(doc, json)` | Validate (size, schema, document match), persist, `revalidatePath("/admin/reports/design")`, audit |
| `resetReportTemplate(doc)` | Delete the stored row and audit |
| `testPrintReportTemplate(doc, json, printerId)` | Validate, build with sample data, resolve the printer and print, audit with the failure detail |

Auditing uses `recordSessionAudit` with kind `settings` for save/reset and kind `test`
for the test print; the detail names the document (e.g. `report-design:receipt`).
Imports are not a separate action: the file is read client-side and persisted through
`saveReportTemplate`.

## Error handling

- A malformed stored template never blocks printing: the default is used and a warning is
  logged.
- Saving an invalid template returns field errors and does not touch the stored value.
- A template-related print failure returns the existing Arabic print error; payments and
  shift closes never roll back because a print failed.
- A missing printer, unsupported connection, or print timeout keeps the existing error
  paths and audit entries.
- Reading the logo for preview is best-effort; a missing logo simply hides it.

## Testing strategy (TDD, failing tests first)

Unit tests:

1. `lib/print/templates/schema.test.ts` — all five defaults validate; wrong
   format/version/document, unknown keys, unknown field/section/column/label ids,
   unknown placeholders, bad widths, too many lines, `kitchen` summary on, and >100 KB
   are rejected; control characters are stripped.
2. `lib/print/templates/columns.test.ts` — weight normalization sums to the paper width
   for 32 and 48; pixel widths sum to 384; right-to-left ordering.
3. `lib/print/templates/layout.test.ts` — receipt column header and row order, wrapped
   name continuations, hidden empty fields, label overrides, section order, summary,
   footer placeholder expansion, skipped empty lines.
4. `lib/print/templates/render.test.ts` — with `PRINTER_ARABIC_RASTER=0` the decoded
   bytes contain the four labels and padded amounts, never `x`/`=` item lines; with
   raster enabled the row block is emitted per item; init/cut/separator bytes present.
   Follow the existing pattern in `lib/print/order-number.test.ts` (set the env var,
   rebuild the module in `beforeAll`, assert decoded text).
5. `lib/print/templates/data.test.ts` — each adapter maps representative print data to
   the expected fields, rows, sections (including category grouping and subtotals for
   `items`), and formatted amounts; title/brand/venue/footer fallbacks.
6. `lib/print/templates/store.test.ts` — unset key → default; save/load round-trip;
   reset; per-document isolation; invalid stored JSON → default plus one warning.
7. `lib/print/templates/build.test.ts` — receipt bytes from `buildReceiptEscPos` contain
   order number, invoice id, customer, phone, four column labels, per-item amounts and
   the total; kitchen bytes omit totals; shift/sales/items builders render their sections.
8. `app/actions/report-templates.test.ts` — non-admin rejected; invalid JSON rejected and
   not stored; save/reset persist; test print validates and routes local and network
   printers (mocked) with audits.

Component test:

9. `components/admin/report-design/ReportDesignAdmin.test.tsx` — tab switching loads the
   right preview; toggling a field removes it from the preview; changing a label updates
   the preview; invalid raw JSON blocks save and shows paths; import loads a file;
   export produces a `<doc>.fprep` download; reset confirmation; unsaved-change prompt.

Existing print tests (`escpos.brand.test.ts`, `escpos-cut.test.ts`, `kitchen-font.test.ts`,
`order-number.test.ts`, `shift-report.test.ts`, `receipts.test.ts`) are ported to the new
builders in the same change; none may be deleted to make the suite pass.

Regression and manual verification:

- Full `npm test`, `npx tsc --noEmit`, `npm run build`.
- Real print to the XP-80C of each document from the design page; verify Arabic columns
  and amounts align on paper.
- Quick sale at the counter: the receipt shows the four-column table; kitchen ticket
  still arrives first.
- In a development database, store invalid JSON for one document: printing still succeeds
  with the default.
- Build and install the installer
  (`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -SkipNpm`
  after `npm run build`) on the owner's machine; confirm saved designs survive the
  upgrade and appear in the designer.

## Documentation

- `README.md`: admin section on تصميم التقارير (edit, preview, test print, import/export,
  reset) and the `.fprep` format warning.
- `PROJECT_INDEX.md`: printing section updated with the template pipeline and the
  receipt table.
- `docs/worklog/2026-10-31-report-designs.md`: format, decisions, test evidence.
- Project memory entry with the locked decisions and pitfalls.

## Risks

- **Alignment fidelity**: raster rows are drawn per row at measured offsets; widths that
  are too narrow shrink the font or clip. The defaults are sized for `12.00`-style
  amounts on an 80 mm printer; verify on paper.
- **Performance**: each item row is one canvas. A 20-item receipt adds ~20 small canvas
  renders (tens of milliseconds); the existing Arabic line rasterizer has the same cost.
- **RTL/digit mixing**: numeric cells render LTR inside the cell; right-aligned Arabic
  text uses RTL direction. Both paths need a visual check with mixed names
  (`كافيه 2`) on the installed build.
- **Designer scope creep**: the schema is intentionally fixed-band. Adding new fields or
  sections requires a code change and a whitelist update.
- **Stored-template skew**: future schema changes must bump `version`; version 1 files are
  rejected after a bump and fall back to the default.
- **Installer payload**: no new shipped files, so standalone tracing is unchanged; verify
  template loading from the installed bundle, not just `next dev`.
