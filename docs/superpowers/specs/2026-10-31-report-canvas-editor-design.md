# Report Canvas Editor — Design Spec

**Date:** 2026-10-31
**Status:** Approved design, awaiting implementation plan
**Feature:** Replace the tree/properties/JSON report designer with a drag-and-drop
paper canvas aimed at a non-technical owner.

## Goal

Let the owner customize receipts and reports by dragging, resizing, hiding, and
editing blocks directly on a paper-shaped preview, without knowing JSON, character
widths, or the `.fprep` format. The printed output must stay identical for every
template that has not been edited.

## Non-goals

- Free pixel x/y placement. Thermal receipts print line by line; arbitrary
  positioning would require rasterizing text blocks as images.
- New printable block types (barcodes, images beyond the receipt logo, custom
  mid-document text blocks). Header/footer text lines cover free text.
- Dragging table columns to reorder them. Column order stays editable through the
  advanced JSON editor.
- Per-block page breaks, multi-page flow, or 80 mm-specific layouts beyond the
  existing `paper.columns` choice.
- Any new runtime dependency.

## Decisions already made with the owner

1. **Block canvas** over a freeform x/y canvas.
2. Direct canvas edits: reorder blocks by drag, resize table columns, edit text
   inline, show/hide blocks, add text lines.
3. Supporting tools: undo/redo, an advanced JSON panel behind a toggle, a
   sample/blank data switcher, and large touch-friendly buttons.

## Current state (baseline)

- `lib/print/templates/types.ts` defines a strict v1 template: header, fields,
  items, sections, summary, footer, labels, paper.
- `schema.ts` validates and normalizes every template; unknown keys are rejected.
- `layout.ts` renders blocks in one hardcoded order: header → fields → items →
  sections (template array order) → summary → footer.
- `components/admin/report-design/ReportDesignAdmin.tsx` holds editor state and
  renders `TemplateTree`, `TemplateProperties`, `ReportPreview`, and a JSON tab.
- Storage is one JSON setting per document (`report_template.<doc>`), with
  validation on save and fallback to the built-in default on load.

## 1. Template model changes (additive, v1-compatible)

### New optional root field: `order`

```ts
order?: string[]; // printed top-to-bottom
```

Valid block ids per document:

- `header`
- `fields`
- `items`
- `section:<id>` for every section id the document supports
- `summary`
- `footer`

Canonical order = `header, fields, items, ...template.sections.map(s => "section:" + s.id), summary, footer`.
Using the parsed template's section array order preserves the existing printed
order for templates whose sections were already reordered.

Normalization rules in `validateReportTemplate`:

- `order` absent → canonical order.
- `order` is not an array → error `order يجب أن يكون قائمة`.
- Any entry that is not a known block id for this document → error
  `order[N] غير معروف لهذا التقرير`.
- Duplicate entries → error `order[N] مكرر`.
- Entries missing from a partial list are appended in canonical order, so the
  stored value is always a complete permutation.
- The normalized template always includes `order`.

### New optional visibility flags

```ts
header.show?: boolean; // default true
footer.show?: boolean; // default true
fields.visible?: boolean; // default true
```

- Validator emits all three flags (default `true`) and accepts them in
  `checkKeys`.
- `layoutTemplate` skips a hidden block.
- `fields.visible` is separate from `fields.show` so hiding the block never
  discards the owner's per-field selections; showing it restores exactly the
  same list.
- Existing `items.show`, `section.show`, `summary.show`, `header.logo.show`
  remain the visibility switches for those blocks.

### Dependency split

`DocumentSpec`, `DOCUMENT_SPECS`, and `BASE_PLACEHOLDERS` move from `schema.ts`
into a new `lib/print/templates/document-specs.ts`; `schema.ts` re-exports them
so existing imports keep working. Both `schema.ts` and `blocks.ts` import the
new module, which removes the need for `schema.ts` to import `blocks.ts`. The
canonical-order helper also lives in `blocks.ts`, and `schema.ts` imports it —
one-way dependency: `document-specs` ← `blocks` ← `schema`.

### Defaults and round-trip

- `defaults.ts` adds each document's canonical `order`, `header.show: true`,
  `footer.show: true`, and `fields.visible: true`.
- The existing round-trip test (`templatesEqual(validate(default), default)`)
  must stay green for all five documents.
- No database migration: stored templates without `order`/`show` stay valid and
  are normalized the next time they are saved.

## 2. Layout refactor

`layoutTemplate` becomes an orchestrator over per-block renderers:

```ts
layoutHeader(template, data): LayoutLine[]
layoutFields(template, data): LayoutLine[]
layoutItems(template, data): LayoutLine[]
layoutSection(template, section, data): LayoutLine[]
layoutSummary(template, data): LayoutLine[]
layoutFooter(template, data): LayoutLine[]
```

- Each renderer keeps today's separator and empty-content behavior exactly.
- `layoutTemplate` iterates `template.order`, resolves `section:<id>` to the
  matching section object, skips hidden/missing blocks (`header.show`,
  `footer.show`, `fields.visible`, `items.show`, `section.show`,
  `summary.show`), and concatenates.
- If `order` is absent on a hand-written template, canonical order is used.
- `tableWidths(columns, paper)` is exported for the canvas; its label-minimum
  algorithm is unchanged.
- Canonical-order output must remain byte-identical to today. Existing
  `layout.test.ts` expectations must pass without edits except where new tests
  intentionally cover `order`/`show`.

## 3. Canvas architecture

### Component tree

```
ReportDesignAdmin (state owner: template, history, selection, sample mode, dialogs)
├── EditorToolbar (document tabs, save, test print, undo/redo, sample toggle, advanced toggle)
├── ReportCanvas (paper column + block cards + drag state)
│   └── CanvasBlock (one printable block)
│       ├── drag handle / up / down / eye / edit buttons
│       ├── table column resize handles (items and table sections)
│       └── inline text input (header/footer lines, section title)
├── BlockInspector (properties for the selected block)
└── AdvancedPanel (JSON editor, apply, import/export .fprep, reset)
```

`TemplateTree.tsx` is deleted. `TemplateProperties.tsx` is replaced by
`BlockInspector.tsx`.

### Block descriptors (`lib/print/templates/blocks.ts`)

Pure functions, no React:

```ts
type BlockId = "header" | "fields" | "items" | `section:${string}` | "summary" | "footer";

canonicalBlockIds(sectionIds: string[]): BlockId[];
orderedBlockIds(template: ReportTemplate): BlockId[];  // template.order or canonical
blockVisible(template, id): boolean;
moveBlock(template, id, toIndex): ReportTemplate;      // removes id, then inserts at toIndex (clamped) in the resulting order
setBlockVisible(template, id, visible): ReportTemplate;
addHeaderLine(template): ReportTemplate;               // max 6, returns same template at cap
addFooterLine(template): ReportTemplate;
resizeColumns(columns, targetCharWidths, paper): TemplateColumn[];
blankSample(sample: DocumentData): DocumentData;
```

`blocks.ts` imports `document-specs.ts`; `schema.ts` imports `blocks.ts`; the
reverse dependency never exists.

### Paper canvas

- The paper column mirrors a 58 mm receipt: width 360 CSS px, `dir="rtl"`,
  white background, 1 px dotted border, 384 px-equivalent scale factor
  `previewWidth / paperPx` where `paperPx` is derived from `paper.columns`.
- Each block renders as a card with a 2 px transparent border; the selected
  card uses the primary color and an accessible label (`aria-selected`).
- Card content renders the real sample data with the real layout math:
  - header: logo placeholder when `logo.show`, expanded header lines with their
    alignment/bold/size classes;
  - fields: only rows with non-empty sample values, `label: value`;
  - items: title, header row and sample rows using exported `tableWidths`
    (label-minimum rule), notes;
  - section: title plus kv rows / table rows / grouped rows from the sample;
  - summary: label plus sample total;
  - footer: expanded footer lines.
- A hidden block stays visible on the canvas at 45% opacity with an eye-off icon.
- A block with no printable content shows a muted hint
  «لن يظهر في هذه المعاينة» but remains selectable.
- The canvas never writes to the template while rendering.

### Drag reorder

- Pointer Events only (`onPointerDown`/`onPointerMove`/`onPointerUp` +
  `setPointerCapture`); no dependency and no HTML5 drag-and-drop (unreliable on
  touch).
- Pressing the drag handle arms a drag; movement under 4 px is a click.
- While armed, `pointermove` compares the pointer Y with the vertical midpoint
  of every other block card measured once at drag start
  (`getBoundingClientRect`), producing an insertion index. An insertion line is
  shown at that index.
- Releasing commits `moveBlock(template, id, index)` as one history entry.
  Escape cancels without changes.
- Every card also exposes large up/down buttons that move one step; this is the
  keyboard/touch fallback and the primary path covered by component tests.

### Column resize

- Handles render between adjacent columns of the items table and of table /
  grouped-table sections.
- Each handle is a button (`aria-label="تغيير عرض العمود <label>"`) that also
  supports ArrowLeft/ArrowRight to change width by one character.
- Pointer drag converts the horizontal delta into target character widths:
  1. Convert pointer delta to character units using
     `paper.columns / previewPaperWidth`.
  2. The handle sits between column `i` (visually to its right in RTL) and
     column `i+1`. A positive rightward delta widens column `i` and narrows
     column `i+1` by the same amount.
  3. Clamp every column to `[label.length, 64]` and keep the sum equal to
     `paper.columns`; if the minimums themselves exceed the paper, fall back to
     the existing `charWidths(minimums, paper)` behavior.
  4. Set each `column.width = minimum + extra`, which reproduces the target
     widths through `tableWidths` (minimums reserved, remainder distributed).
- Resizing commits one history entry on release (coalesced key
  `resize:<block>:<index>`).

### Inline text editing

- Double-click (or the card's edit button) on a header line, footer line, or
  section title enters edit mode, replacing that text with an autofocused RTL
  `<input>` sized to the line.
- Enter or blur commits one history entry; Escape cancels.
- Edit mode is reachable without a mouse: the card's edit button focuses the
  same input. The inspector also offers the same text fields.

### Show / hide / add

- Eye button toggles the block's own flag (see §1), including `fields.visible`.
- `+ سطر` appears on header and footer cards; it appends an empty editable line
  and respects the schema's 6-line limit (button disabled with an Arabic hint at
  the cap).
- The inspector exposes the separator switch for each block group.

## 4. Inspector, toolbar, advanced panel

### BlockInspector

Same capabilities as today's `TemplateProperties`, reorganized per block and
sized for touch:

- header: logo switch, logo alignment/max width, line text + alignment, bold,
  size, separator;
- fields: checkbox list with up/down buttons, label rename, separator;
- items: show, title, header-row switch, notes switch, column labels and numeric
  widths, separator;
- section (`section:<id>`): show, title, separator, column labels/widths where
  applicable;
- summary: show, label, separator;
- footer: line text + alignment, separator.

All controls use `input-lg`/`btn-lg` equivalents and Arabic labels.

### EditorToolbar

- Document tabs (unchanged ids, `?doc=`).
- حفظ التصميم (primary, large), طباعة تجريبية with the printer select,
  تراجع / إعادة, بيانات: تجريبية | فارغة, متقدم.
- Dirty and default badges remain.
- Switching documents with unsaved changes opens a DaisyUI confirmation modal
  (replaces `window.confirm`; the native dialog blocked browser automation and
  is easy to dismiss accidentally).
- Reset moves into the advanced panel and keeps its existing confirmation modal.

### AdvancedPanel

Collapsed by default; contains the raw JSON editor with «تطبيق JSON», `.fprep`
import/export, and «استعادة الافتراضي». Invalid JSON never replaces editor
state. All existing validation messages and Arabic error strings are preserved.

### Sample switcher

`blankSample(sample)` returns a copy with empty `fields` values, `items: []`,
`itemNotes: []`, `sections: {}`, `summary: null`, `status: ""`, keeping title,
venue, brand strings, and footer. Purely client-side.

## 5. Editor state and history

`useTemplateEditor(initialTemplate)`:

```ts
type EditorState = {
  template: ReportTemplate;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  commit: (next: ReportTemplate, options?: { coalesceKey?: string }) => void;
  undo: () => void;
  redo: () => void;
  replace: (next: ReportTemplate) => void; // import/reset: always pushes history
  markSaved: (saved: ReportTemplate) => void;
};
```

- History is `{ past: ReportTemplate[], present, future: ReportTemplate[] }`,
  past capped at 50 entries.
- `coalesceKey` merges consecutive edits with the same key inside 500 ms into one
  entry (used by typing and resizing); moves, toggles, adds, imports, and reset
  always push.
- `dirty = !templatesEqual(present, baseline)` where `baseline` is the template
  received from the server. `markSaved(saved)` sets the baseline after a
  successful save, and reset sets it to the built-in default.
- When the `template` prop changes because of `router.refresh`, the hook adopts
  the new value as baseline only if the current state is clean; unsaved edits
  are never clobbered.
- Undo/redo keyboard shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y, ignored
  while focus is inside the JSON textarea or an inline input.
- The existing `beforeunload` guard keys off `dirty` and stays.
- Save sends `JSON.stringify(present)` to `saveReportTemplate`; the server
  re-validates and returns Arabic errors which the toolbar displays.

## 6. Edge cases

- Paper 48 columns: preview scale and resize math use `paper.columns`; no
  hardcoded 32.
- Adding a line when the document already has 6 header/footer lines: no-op and a
  hint.
- Hiding every block: the canvas shows an empty-paper hint; saving stays valid.
- Template `order` referencing a section id that no longer exists: validator
  rejects unknown ids; layout also skips missing sections defensively.
- Importing a template without `order`: accepted; canvas shows canonical order;
  saving adds `order`.
- No active printers: test print shows «اختر طابعة أولاً» as today.
- Empty sample values never make a block look editable-but-broken; the hint is
  shown instead.
- Undo after reset restores the previous in-memory template; persisting the
  reset still requires saving, exactly like other edits.

## 7. Testing

### Pure unit tests

- `blocks.test.ts`: canonical ids for all five documents; normalization of
  partial/duplicate/unknown order; move up/down/ends; visibility toggles
  (including `fields.visible` preserving `fields.show`); 6-line cap; resize math
  (label minimum, clamping, sum preservation,
  32/48 columns); `blankSample`.
- `schema.test.ts`: `order` validation errors, normalization appends missing
  ids, header/footer `show` parsing, defaults round-trip.
- `layout.test.ts`: canonical output unchanged; custom order moves summary above
  items; hidden header/footer/fields/items/summary/section skipped; missing
  `order` falls back to canonical; section blocks render in `order` position.

### Component tests

- `ReportCanvas.test.tsx`: renders blocks in order; up/down buttons reorder and
  emit the new template; eye hides; inline edit commits on Enter and cancels on
  Escape; column resize via Arrow keys changes weights deterministically; pointer
  drag reorder simulated with mocked bounding rects.
- `ReportDesignAdmin.test.tsx` (rewritten): save payload; advanced JSON rejects
  invalid input; import/export; reset modal; test print with selected printer;
  document-switch modal; sample/blank toggle; undo/redo; beforeunload guard.

### Verification

- Full `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Browser verification of the golden paths on the dev server.
- Rebuild the installer and have the owner install it and run a real-printer
  test print.

## 8. File map

| File | Action |
| --- | --- |
| `lib/print/templates/types.ts` | add `order`, header/footer `show` |
| `lib/print/templates/schema.ts` | read/normalize `order` and `show` |
| `lib/print/templates/defaults.ts` | add canonical order and show flags |
| `lib/print/templates/layout.ts` | extract per-block renderers, iterate `order` |
| `lib/print/templates/blocks.ts` | new pure helpers |
| `lib/print/templates/blocks.test.ts` | new tests |
| `lib/print/templates/sample.ts` | add `blankSample` |
| `app/admin/(panel)/reports/design/page.tsx` | pass printer/sample props unchanged; no server change expected |
| `components/admin/report-design/ReportDesignAdmin.tsx` | rewrite around canvas + history |
| `components/admin/report-design/ReportCanvas.tsx` | new |
| `components/admin/report-design/CanvasBlock.tsx` | new |
| `components/admin/report-design/BlockInspector.tsx` | replaces `TemplateProperties.tsx` |
| `components/admin/report-design/EditorToolbar.tsx` | new |
| `components/admin/report-design/AdvancedPanel.tsx` | new |
| `components/admin/report-design/useTemplateEditor.ts` | new |
| `lib/print/templates/document-specs.ts` | new home for `DOCUMENT_SPECS` (re-exported by `schema.ts`) |
| `components/admin/report-design/TemplateTree.tsx` | delete |
| `components/admin/report-design/ReportPreview.tsx` | delete; the canvas is the preview |
| `docs/worklog/2026-10-31-report-canvas-editor.md` | new worklog |
| `README.md`, `PROJECT_INDEX.md` | update the designer description |

No `package.json` changes.

## 9. Acceptance criteria

1. Opening `/admin/reports/design` shows a paper canvas with every block of the
   selected document in printed order, using real sample data.
2. Dragging a block changes its printed position; up/down buttons do the same;
   undo/redo and Ctrl+Z/Ctrl+Y work.
3. Column handles resize table columns; the result is reflected live and the
   saved widths sum to `paper.columns`, never below a header label.
4. Header/footer lines and section titles are editable inline; Enter commits,
   Escape cancels.
5. Eye buttons hide/show every block; hidden blocks print nothing and remain
   selectable on canvas; fields can be hidden and restored.
6. The four-column receipt keeps the same printed order and widths shown on the
   canvas, with الصنف as the rightmost column.
7. Advanced JSON, import/export, and reset still behave as before, including
   Arabic validation errors and validate-before-apply.
8. Document switching with unsaved changes uses an in-app modal; `beforeunload`
   still warns.
9. Full test suite, typecheck, lint (no new errors), and build pass; installer is
   rebuilt and the owner verifies a real-printer test print.
