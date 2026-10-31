# Report Canvas Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tree/properties/JSON report designer with a paper-shaped, drag-and-drop block canvas that a non-technical owner can operate, without changing the printed output of any unedited template.

**Architecture:** Add a persisted block `order` plus additive visibility flags to the v1 `.fprep` template, refactor the layout engine into per-block renderers that follow `order`, and rebuild the admin page around a 360 px paper canvas (`ReportCanvas` → `CanvasBlock`), an inspector, a toolbar, an advanced JSON panel, and a `useTemplateEditor` history hook. Pure helpers live in `lib/print/templates/blocks.ts`; specs move to `document-specs.ts` to keep the dependency graph acyclic.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Tailwind + DaisyUI, lucide-react, vitest 5 + jsdom + Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-report-canvas-editor-design.md`

## Global Constraints

- **No `package.json` changes and no new dependencies.** Pointer Events only; no HTML5 drag-and-drop library.
- **Never run git.** No `add`, `commit`, `push`, `reset`, `stash`, `checkout`, `clean`. The owner commits every checkpoint; agents stop at "report checkpoint".
- **Never type login credentials or approve UAC.** The owner logs in and elevates.
- **Direct ESC/POS printing only** (Windows system-printer worker or network IP). No browser print path.
- **Tests must never read or write the live `data/pos.db`.** Use mocks for `@/lib/settings`/`@/lib/db`; the feature changes add no DB access.
- **Printed output for unedited templates must stay byte-identical.** Existing `layout.test.ts` expectations stay green without edits.
- **Installer flow:** `npm run build`, then `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -SkipNpm`. On transient `EndUpdateResource failed (110)` (antivirus lock), retry the same command once. Never change antivirus settings. The owner installs and runs the real-printer check.
- **Arabic RTL UI, large touch targets** (`btn-lg`/`input-lg` equivalents), and Arabic validation messages preserved verbatim.
- The agent never claims a UI change is verified without exercising it in a browser; if login blocks automation, say so and hand the check to the owner.

---

## File Structure

| File | Action |
| --- | --- |
| `lib/print/templates/types.ts` | modify: `order?`, `header.show?`, `fields.visible?`, `footer.show?` |
| `lib/print/templates/document-specs.ts` | create: `DocumentSpec`, `BASE_PLACEHOLDERS`, `DOCUMENT_SPECS` |
| `lib/print/templates/schema.ts` | modify: import/re-export specs, read + normalize `order`/`show`/`visible` |
| `lib/print/templates/defaults.ts` | modify: canonical `order` + visibility flags for all five documents |
| `lib/print/templates/blocks.ts` | create: pure block helpers (`BlockId`, order, move, visibility, lines, resize, sample) |
| `lib/print/templates/blocks.test.ts` | create |
| `lib/print/templates/layout.ts` | modify: per-block renderers iterate `order`; export `tableWidths` |
| `lib/print/templates/layout.test.ts` | modify: append order/visibility tests only |
| `lib/print/templates/schema.test.ts` | modify: append order/visibility validation tests |
| `lib/print/templates/defaults.test.ts` | modify: append order/flag test |
| `components/admin/report-design/useTemplateEditor.ts` | create |
| `components/admin/report-design/useTemplateEditor.test.tsx` | create |
| `components/admin/report-design/CanvasLines.tsx` | create |
| `components/admin/report-design/CanvasBlock.tsx` | create |
| `components/admin/report-design/ReportCanvas.tsx` | create |
| `components/admin/report-design/ReportCanvas.test.tsx` | create |
| `components/admin/report-design/BlockInspector.tsx` | create (replaces `TemplateProperties.tsx`) |
| `components/admin/report-design/BlockInspector.test.tsx` | create |
| `components/admin/report-design/EditorToolbar.tsx` | create |
| `components/admin/report-design/AdvancedPanel.tsx` | create |
| `components/admin/report-design/ReportDesignAdmin.tsx` | rewrite around the canvas + history |
| `components/admin/report-design/ReportDesignAdmin.test.tsx` | rewrite |
| `components/admin/report-design/TemplateTree.tsx` | delete |
| `components/admin/report-design/TemplateProperties.tsx` | delete |
| `components/admin/report-design/ReportPreview.tsx` | delete |
| `app/admin/(panel)/reports/design/page.tsx` | unchanged |
| `README.md`, `PROJECT_INDEX.md` | update the designer description |
| `docs/worklog/2026-10-31-report-canvas-editor.md` | create |

---

### Task 1: Template model — persisted order and visibility flags

**Files:**
- Modify: `lib/print/templates/types.ts`
- Modify: `lib/print/templates/schema.ts`
- Modify: `lib/print/templates/defaults.ts`
- Test: `lib/print/templates/schema.test.ts`
- Test: `lib/print/templates/defaults.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ReportTemplate.order?: string[]`, `header.show?: boolean`, `fields.visible?: boolean`, `footer.show?: boolean`. `validateReportTemplate` always returns a complete `order` permutation and all three flags.

- [ ] **Step 1: Add failing schema tests**

Append to `lib/print/templates/schema.test.ts`:

```ts
describe("order and visibility normalization", () => {
  it("appends missing blocks and always returns a full permutation", () => {
    const template = clone(validReceipt);
    template.order = ["summary", "header"];
    const result = validateReportTemplate(template, "receipt");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template.order).toEqual([
        "summary",
        "header",
        "fields",
        "items",
        "footer",
      ]);
    }
  });

  it("rejects non-array, unknown, and duplicate order entries", () => {
    const nonArray = clone(validReceipt) as ReportTemplate & { order?: unknown };
    nonArray.order = "summary";
    expect(validateReportTemplate(nonArray)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["order يجب أن يكون قائمة"]),
    });

    const unknown = clone(validReceipt);
    unknown.order = ["summary", "nope"];
    expect(validateReportTemplate(unknown)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["order[1] غير معروف لهذا التقرير"]),
    });

    const duplicate = clone(validReceipt);
    duplicate.order = ["summary", "summary"];
    expect(validateReportTemplate(duplicate)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["order[1] مكرر"]),
    });
  });

  it("defaults the visibility flags to true and accepts explicit false", () => {
    const result = validateReportTemplate(clone(validReceipt), "receipt");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template.header.show).toBe(true);
      expect(result.template.fields.visible).toBe(true);
      expect(result.template.footer.show).toBe(true);
    }

    const hidden = clone(validReceipt);
    hidden.header = { ...hidden.header, show: false };
    hidden.fields = { ...hidden.fields, visible: false };
    hidden.footer = { ...hidden.footer, show: false };
    const parsed = validateReportTemplate(hidden, "receipt");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.template.header.show).toBe(false);
      expect(parsed.template.fields.visible).toBe(false);
      expect(parsed.template.footer.show).toBe(false);
    }
  });
});
```

Append to `lib/print/templates/defaults.test.ts`:

```ts
describe("default templates — canvas metadata", () => {
  it("every default carries a canonical order and visible blocks", () => {
    for (const doc of REPORT_DOCUMENTS) {
      const template = DEFAULT_REPORT_TEMPLATES[doc];
      expect(template.order, doc).toEqual([
        "header",
        "fields",
        "items",
        ...template.sections.map((section) => `section:${section.id}`),
        "summary",
        "footer",
      ]);
      expect(template.header.show, doc).toBe(true);
      expect(template.fields.visible, doc).toBe(true);
      expect(template.footer.show, doc).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the new tests and confirm they fail**

Run: `npx vitest run lib/print/templates/schema.test.ts lib/print/templates/defaults.test.ts`

Expected: FAIL — `root.order غير معروف`, `result.template.order` undefined, round-trip mismatch.

- [ ] **Step 3: Extend the template type**

In `lib/print/templates/types.ts`, add `order?: string[];` after `document: ReportDocument;` and add the flags:

```ts
export type ReportTemplate = {
  format: "fastpos-report";
  version: 1;
  document: ReportDocument;
  order?: string[];
  paper: { columns: 32 | 48 };
  header: {
    show?: boolean;
    logo: { show: boolean; align?: Align; maxWidth?: number };
    lines: TemplateLine[];
    separator?: boolean;
  };
  fields: { show: string[]; visible?: boolean; separator?: boolean };
  items: {
    show: boolean;
    title?: string;
    header?: boolean;
    showNote?: boolean;
    columns: TemplateColumn[];
    separator?: boolean;
  };
  sections: TemplateSection[];
  summary: { show: boolean; label: string; separator?: boolean };
  labels: Record<string, string>;
  footer: { show?: boolean; separator?: boolean; lines: TemplateLine[] };
};
```

- [ ] **Step 4: Read and normalize `order` and the flags in the schema**

In `lib/print/templates/schema.ts`:

1. Add `"order"` to the root `checkKeys` allow-list (line ~471).
2. Add `"show"` to the `header` allow-list and read it:

```ts
let headerShow = true;
// inside `if (header) { ... }`
headerShow = readBool(header, "show", "header.show", errors, true);
```

3. Add `"visible"` to the `fields` allow-list and read it:

```ts
let fieldsVisible = true;
// inside `if (fields) { ... }`
fieldsVisible = readBool(fields, "visible", "fields.visible", errors, true);
```

4. Add `"show"` to the `footer` allow-list and read it:

```ts
let footerShow = true;
// inside `if (footer) { ... }`
footerShow = readBool(footer, "show", "footer.show", errors, true);
```

5. Add this helper above `validateReportTemplate`:

```ts
function readOrder(
  value: Record<string, unknown>,
  path: string,
  sections: ReportTemplate["sections"],
  errors: string[],
): string[] {
  const canonical = canonicalBlockIds(sections.map((section) => section.id));
  const raw = value.order;
  if (raw === undefined) return canonical;
  if (!Array.isArray(raw)) {
    errors.push(`${path} يجب أن يكون قائمة`);
    return canonical;
  }
  const allowed = new Set<string>(canonical);
  const seen = new Set<string>();
  const ordered: string[] = [];
  raw.forEach((entry, index) => {
    if (typeof entry !== "string" || !allowed.has(entry)) {
      errors.push(`${path}[${index}] غير معروف لهذا التقرير`);
      return;
    }
    if (seen.has(entry)) {
      errors.push(`${path}[${index}] مكرر`);
      return;
    }
    seen.add(entry);
    ordered.push(entry);
  });
  for (const id of canonical) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}
```

6. After `const sections = readSections(...)` add:

```ts
const order = readOrder(value, "order", sections, errors);
```

7. In the returned object, add `order` and the flags:

```ts
return {
  ok: true,
  template: {
    format: "fastpos-report",
    version: 1,
    document: doc,
    order,
    paper: { columns: columns as 32 | 48 },
    header: { show: headerShow, logo, lines: headerLines, separator: headerSeparator },
    fields: { show: fieldIds, visible: fieldsVisible, separator: fieldsSeparator },
    items: {
      show: itemsShow,
      title: itemsTitle,
      header: itemsHeader,
      showNote: itemsShowNote,
      columns: itemColumns,
      separator: itemsSeparator,
    },
    sections,
    summary: {
      show: summaryShow,
      label: summaryLabel,
      separator: summarySeparator,
    },
    labels,
    footer: { show: footerShow, separator: footerSeparator, lines: footerLines },
  },
};
```

8. Add the import at the top of `schema.ts` (the helper lands in Task 2; create a minimal version in this task so this task compiles standalone):

```ts
import { canonicalBlockIds } from "./blocks";
```

- [ ] **Step 5: Create the minimal `blocks.ts` canonical helper (expanded in Task 2)**

Create `lib/print/templates/blocks.ts` with only:

```ts
export type BlockId =
  | "header"
  | "fields"
  | "items"
  | `section:${string}`
  | "summary"
  | "footer";

export function canonicalBlockIds(sectionIds: readonly string[]): BlockId[] {
  return [
    "header",
    "fields",
    "items",
    ...sectionIds.map((id): BlockId => `section:${id}`),
    "summary",
    "footer",
  ];
}
```

- [ ] **Step 6: Add the canonical metadata to all five defaults**

In `lib/print/templates/defaults.ts`, add `order` after `document` and the flags to `header`/`fields`/`footer` for each document:

```ts
// receipt
order: ["header", "fields", "items", "summary", "footer"],
header: { show: true, logo: { ... } },
fields: { show: [...], visible: true, separator: true },
footer: { show: true, separator: false, lines: [...] },

// kitchen
order: ["header", "fields", "items", "summary", "footer"],

// shift
order: [
  "header",
  "fields",
  "items",
  "section:collection",
  "section:expenses",
  "section:reconciliation",
  "summary",
  "footer",
],

// items
order: [
  "header",
  "fields",
  "items",
  "section:overview",
  "section:groups",
  "summary",
  "footer",
],

// sales
order: [
  "header",
  "fields",
  "items",
  "section:totals",
  "section:categories",
  "section:itemsList",
  "summary",
  "footer",
],
```

Every document also gets `show: true` inside `header`, `visible: true` inside `fields`, and `show: true` inside `footer`.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run lib/print/templates/schema.test.ts lib/print/templates/defaults.test.ts`

Expected: PASS (including the existing round-trip test).

- [ ] **Step 8: Report checkpoint**

Report which files changed and the test output. The owner commits; the agent does not run git.

---

### Task 2: Block helpers and document-specs extraction

**Files:**
- Create: `lib/print/templates/document-specs.ts`
- Modify: `lib/print/templates/schema.ts`
- Modify: `lib/print/templates/blocks.ts`
- Test: `lib/print/templates/blocks.test.ts`

**Interfaces:**
- Consumes: `ReportTemplate`, `TemplateColumn`, `DocumentData` from `types.ts`; `charWidths` from `columns.ts`; `tableWidths` from `layout.ts` (tests only).
- Produces:
  - `type BlockId`, `type TemplateCommit`
  - `canonicalBlockIds(sectionIds: readonly string[]): BlockId[]`
  - `orderedBlockIds(template: ReportTemplate): BlockId[]`
  - `blockLabel(template: ReportTemplate, id: BlockId): string`
  - `blockVisible(template: ReportTemplate, id: BlockId): boolean`
  - `moveBlock(template, id, toIndex): ReportTemplate`
  - `setBlockVisible(template, id, visible): ReportTemplate`
  - `addHeaderLine(template): ReportTemplate`, `addFooterLine(template): ReportTemplate`
  - `resizeColumns(columns, targetCharWidths, paper): TemplateColumn[]`
  - `blankSample(sample: DocumentData): DocumentData`
  - `MAX_LINES = 6`
  - `document-specs.ts`: `DocumentSpec`, `BASE_PLACEHOLDERS`, `DOCUMENT_SPECS`

- [ ] **Step 1: Write failing block tests**

Create `lib/print/templates/blocks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addFooterLine,
  addHeaderLine,
  blankSample,
  blockLabel,
  blockVisible,
  canonicalBlockIds,
  moveBlock,
  orderedBlockIds,
  resizeColumns,
  setBlockVisible,
} from "./blocks";
import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import { tableWidths } from "./layout";
import { buildSampleDocuments, sampleSettings } from "./sample";
import { REPORT_DOCUMENTS } from "./types";

describe("block ids", () => {
  it("lists the canonical order for every document", () => {
    expect(canonicalBlockIds([])).toEqual([
      "header",
      "fields",
      "items",
      "summary",
      "footer",
    ]);
    expect(
      canonicalBlockIds(["collection", "expenses", "reconciliation"]),
    ).toEqual([
      "header",
      "fields",
      "items",
      "section:collection",
      "section:expenses",
      "section:reconciliation",
      "summary",
      "footer",
    ]);
    for (const doc of REPORT_DOCUMENTS) {
      const template = DEFAULT_REPORT_TEMPLATES[doc];
      expect(orderedBlockIds(template), doc).toEqual(
        canonicalBlockIds(template.sections.map((section) => section.id)),
      );
    }
  });

  it("normalizes partial, duplicate, and unknown order entries", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.shift);
    template.order = ["summary", "section:collection", "summary", "nope"];
    expect(orderedBlockIds(template)).toEqual([
      "summary",
      "section:collection",
      "header",
      "fields",
      "items",
      "section:expenses",
      "section:reconciliation",
      "footer",
    ]);
  });

  it("labels sections with their title", () => {
    expect(blockLabel(DEFAULT_REPORT_TEMPLATES.receipt, "header")).toBe("الترويسة");
    expect(blockLabel(DEFAULT_REPORT_TEMPLATES.shift, "section:collection")).toBe(
      "التحصيل",
    );
  });
});

describe("moveBlock", () => {
  it("moves blocks to the start, the end, and by one step", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    expect(orderedBlockIds(moveBlock(template, "summary", 0))[0]).toBe("summary");
    expect(orderedBlockIds(moveBlock(template, "summary", 99)).at(-1)).toBe("summary");
    expect(orderedBlockIds(moveBlock(moveBlock(template, "summary", 2), "summary", 3))).toEqual([
      "header",
      "fields",
      "items",
      "summary",
      "footer",
    ]);
    expect(moveBlock(template, "header", -5).order![0]).toBe("header");
  });
});

describe("visibility", () => {
  it("toggles every block without losing field selections", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    const hiddenFields = setBlockVisible(template, "fields", false);
    expect(hiddenFields.fields.visible).toBe(false);
    expect(hiddenFields.fields.show).toEqual(template.fields.show);
    expect(blockVisible(hiddenFields, "fields")).toBe(false);
    expect(blockVisible(setBlockVisible(hiddenFields, "fields", true), "fields")).toBe(true);

    expect(blockVisible(setBlockVisible(template, "header", false), "header")).toBe(false);
    expect(blockVisible(setBlockVisible(template, "summary", false), "summary")).toBe(false);
    expect(blockVisible(setBlockVisible(template, "footer", false), "footer")).toBe(false);

    const shift = structuredClone(DEFAULT_REPORT_TEMPLATES.shift);
    expect(
      blockVisible(setBlockVisible(shift, "section:collection", false), "section:collection"),
    ).toBe(false);
  });
});

describe("line additions", () => {
  it("caps header and footer lines at six", () => {
    let template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    for (let index = 0; index < 10; index += 1) template = addHeaderLine(template);
    expect(template.header.lines).toHaveLength(6);

    let footer = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    for (let index = 0; index < 10; index += 1) footer = addFooterLine(footer);
    expect(footer.footer.lines).toHaveLength(6);
  });
});

describe("resizeColumns", () => {
  it("reproduces requested widths and keeps the paper width", () => {
    const columns = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt).items.columns;
    const resized = resizeColumns(columns, [10, 7, 6, 9], 32);
    expect(resized.map((column) => column.width)).toEqual([10, 7, 6, 9]);
    expect(tableWidths(resized, 32)).toEqual([10, 7, 6, 9]);
    expect(resized.reduce((sum, column) => sum + column.width, 0)).toBe(32);
  });

  it("clamps below-label and oversized requests", () => {
    const columns = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt).items.columns;
    const resized = resizeColumns(columns, [5, 6, 5, 64], 32);
    const rendered = tableWidths(resized, 32);
    expect(rendered.reduce((sum, value) => sum + value, 0)).toBe(32);
    rendered.forEach((width, index) => {
      expect(width).toBeGreaterThanOrEqual(columns[index]!.label.length);
    });
    expect(resized.reduce((sum, column) => sum + column.width, 0)).toBe(32);
  });

  it("falls back when the labels alone exceed the paper, and handles 48 columns", () => {
    const columns = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt).items.columns;
    const wide = columns.map((column) => ({ ...column, label: "x".repeat(10) }));
    const fallback = resizeColumns(wide, [12, 12, 12, 12], 32);
    expect(tableWidths(fallback, 32).reduce((sum, value) => sum + value, 0)).toBe(32);

    const paper48 = resizeColumns(columns, [14, 10, 11, 13], 48);
    expect(tableWidths(paper48, 48)).toEqual([14, 10, 11, 13]);
    expect(paper48.reduce((sum, column) => sum + column.width, 0)).toBe(48);
  });
});

describe("blankSample", () => {
  it("blanks values while keeping the paper heading", () => {
    const sample = buildSampleDocuments(sampleSettings).receipt;
    const blank = blankSample(sample);
    expect(blank.title).toBe(sample.title);
    expect(blank.venue).toBe(sample.venue);
    expect(blank.footer).toBe(sample.footer);
    expect(blank.status).toBe("");
    expect(Object.values(blank.fields).every((value) => value === null)).toBe(true);
    expect(blank.items).toEqual([]);
    expect(blank.itemNotes).toEqual([]);
    expect(blank.sections).toEqual({});
    expect(blank.summary).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run lib/print/templates/blocks.test.ts`

Expected: FAIL — `orderedBlockIds`, `moveBlock`, `resizeColumns`, `blankSample`, `blockLabel`, `blockVisible`, `addHeaderLine`, `addFooterLine` are not exported.

- [ ] **Step 3: Create `document-specs.ts`**

Create `lib/print/templates/document-specs.ts` containing the current `DocumentSpec` type, `BASE_PLACEHOLDERS`, and `DOCUMENT_SPECS` moved verbatim from `schema.ts`:

```ts
import type { ReportDocument, SectionKind } from "./types";

export type DocumentSpec = {
  fields: readonly string[];
  itemColumns: readonly string[];
  sections: Record<
    string,
    { kind: SectionKind; rowIds: readonly string[]; columnKeys: readonly string[] }
  >;
  placeholders: readonly string[];
  summaryAllowed: boolean;
};

export const BASE_PLACEHOLDERS = ["title", "venue"] as const;

export const DOCUMENT_SPECS: Record<ReportDocument, DocumentSpec> = {
  receipt: {
    fields: [
      "orderNo",
      "invoiceId",
      "table",
      "waiter",
      "customer",
      "phone",
      "cashier",
      "payment",
      "time",
    ],
    itemColumns: ["name", "qty", "unitPrice", "lineTotal"],
    sections: {},
    placeholders: [
      ...BASE_PLACEHOLDERS,
      "subtitle",
      "brand.phone",
      "brand.address",
      "footer",
    ],
    summaryAllowed: true,
  },
  kitchen: {
    fields: ["orderNo", "table", "waiter", "time", "ticketPart"],
    itemColumns: ["name", "qty"],
    sections: {},
    placeholders: BASE_PLACEHOLDERS,
    summaryAllowed: false,
  },
  shift: {
    fields: [
      "workDate",
      "openedAt",
      "closedAt",
      "printedAt",
      "printedByName",
      "openedByName",
      "closedByName",
    ],
    itemColumns: [],
    sections: {
      collection: {
        kind: "kv",
        rowIds: ["invoiceCount", "total", "noPayments", "totalItems", "tableQuick"],
        columnKeys: [],
      },
      expenses: {
        kind: "kv",
        rowIds: ["openingFloat", "expenseTotal"],
        columnKeys: [],
      },
      reconciliation: {
        kind: "kv",
        rowIds: ["expectedCash", "countedCash", "difference"],
        columnKeys: [],
      },
    },
    placeholders: [...BASE_PLACEHOLDERS, "status"],
    summaryAllowed: false,
  },
  items: {
    fields: ["workDate", "printedAt", "printedByName"],
    itemColumns: [],
    sections: {
      overview: {
        kind: "kv",
        rowIds: ["categoryCount", "itemCount", "totalItems"],
        columnKeys: [],
      },
      groups: {
        kind: "groupedTable",
        rowIds: ["groupTotal"],
        columnKeys: ["name", "qty"],
      },
    },
    placeholders: BASE_PLACEHOLDERS,
    summaryAllowed: true,
  },
  sales: {
    fields: ["from", "to", "printedAt"],
    itemColumns: [],
    sections: {
      totals: {
        kind: "kv",
        rowIds: ["total", "invoiceCount", "totalItems", "tableQuick", "noPayments"],
        columnKeys: [],
      },
      categories: {
        kind: "table",
        rowIds: [],
        columnKeys: ["index", "name", "qty", "revenue"],
      },
      itemsList: {
        kind: "table",
        rowIds: [],
        columnKeys: ["index", "name", "qty", "revenue"],
      },
    },
    placeholders: BASE_PLACEHOLDERS,
    summaryAllowed: true,
  },
};
```

Remove the moved declarations from `schema.ts` and add re-exports:

```ts
import { DOCUMENT_SPECS } from "./document-specs";
import type { DocumentSpec } from "./document-specs";

export { DOCUMENT_SPECS } from "./document-specs";
export type { DocumentSpec } from "./document-specs";
```

- [ ] **Step 4: Implement the full `blocks.ts`**

Replace `lib/print/templates/blocks.ts` with:

```ts
import { charWidths } from "./columns";
import type { DocumentData, ReportTemplate, TemplateColumn } from "./types";

export type BlockId =
  | "header"
  | "fields"
  | "items"
  | `section:${string}`
  | "summary"
  | "footer";

export type TemplateCommit = (
  next: ReportTemplate,
  options?: { coalesceKey?: string },
) => void;

export const MAX_LINES = 6;

export function canonicalBlockIds(sectionIds: readonly string[]): BlockId[] {
  return [
    "header",
    "fields",
    "items",
    ...sectionIds.map((id): BlockId => `section:${id}`),
    "summary",
    "footer",
  ];
}

export function orderedBlockIds(template: ReportTemplate): BlockId[] {
  const canonical = canonicalBlockIds(
    template.sections.map((section) => section.id),
  );
  if (!template.order) return canonical;
  const known = new Set<string>(canonical);
  const seen = new Set<string>();
  const ordered: BlockId[] = [];
  for (const id of template.order) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id as BlockId);
  }
  for (const id of canonical) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

export function blockLabel(template: ReportTemplate, id: BlockId): string {
  if (id === "header") return "الترويسة";
  if (id === "fields") return "البيانات";
  if (id === "items") return "الأصناف";
  if (id === "summary") return "الإجمالي";
  if (id === "footer") return "التذييل";
  const section = template.sections.find(
    (entry) => `section:${entry.id}` === id,
  );
  return section?.title.trim() || "قسم";
}

export function blockVisible(template: ReportTemplate, id: BlockId): boolean {
  if (id === "header") return template.header.show !== false;
  if (id === "fields") return template.fields.visible !== false;
  if (id === "items") return template.items.show;
  if (id === "summary") return template.summary.show;
  if (id === "footer") return template.footer.show !== false;
  const section = template.sections.find(
    (entry) => `section:${entry.id}` === id,
  );
  return section?.show ?? false;
}

export function moveBlock(
  template: ReportTemplate,
  id: BlockId,
  toIndex: number,
): ReportTemplate {
  const order = orderedBlockIds(template);
  if (!order.includes(id)) return template;
  const rest = order.filter((entry) => entry !== id);
  const index = Math.max(0, Math.min(Math.trunc(toIndex), rest.length));
  rest.splice(index, 0, id);
  return { ...template, order: rest };
}

export function setBlockVisible(
  template: ReportTemplate,
  id: BlockId,
  visible: boolean,
): ReportTemplate {
  if (id === "header") {
    return { ...template, header: { ...template.header, show: visible } };
  }
  if (id === "fields") {
    return { ...template, fields: { ...template.fields, visible } };
  }
  if (id === "items") {
    return { ...template, items: { ...template.items, show: visible } };
  }
  if (id === "summary") {
    return { ...template, summary: { ...template.summary, show: visible } };
  }
  if (id === "footer") {
    return { ...template, footer: { ...template.footer, show: visible } };
  }
  return {
    ...template,
    sections: template.sections.map((section) =>
      `section:${section.id}` === id ? { ...section, show: visible } : section,
    ),
  };
}

export function addHeaderLine(template: ReportTemplate): ReportTemplate {
  if (template.header.lines.length >= MAX_LINES) return template;
  return {
    ...template,
    header: {
      ...template.header,
      lines: [...template.header.lines, { text: "" }],
    },
  };
}

export function addFooterLine(template: ReportTemplate): ReportTemplate {
  if (template.footer.lines.length >= MAX_LINES) return template;
  return {
    ...template,
    footer: {
      ...template.footer,
      lines: [...template.footer.lines, { text: "" }],
    },
  };
}

/**
 * `tableWidths` reserves each column's label width and shares the remaining
 * paper width by the `width` extras. To reproduce a requested character width
 * exactly, the stored extras must add up to the remaining capacity, so this
 * helper clamps and normalizes the requested widths before writing them back.
 */
export function resizeColumns(
  columns: TemplateColumn[],
  targetCharWidths: number[],
  paper: number,
): TemplateColumn[] {
  if (columns.length === 0) return columns;
  const minimums = columns.map((column) => column.label.length);
  const minimumTotal = minimums.reduce((sum, value) => sum + value, 0);
  if (minimumTotal >= paper) {
    const fallback = charWidths(minimums, paper);
    return columns.map((column, index) => ({
      ...column,
      width: Math.max(1, Math.min(64, fallback[index] ?? minimums[index]!)),
    }));
  }
  const capacity = paper - minimumTotal;
  const extras = columns.map((column, index) => {
    const target = targetCharWidths[index];
    const value = Number.isFinite(target) ? Math.round(target!) : column.width;
    return Math.max(0, Math.min(capacity, value - minimums[index]!));
  });
  const total = extras.reduce((sum, value) => sum + value, 0);
  const finalExtras = total === capacity ? extras : charWidths(extras, capacity);
  return columns.map((column, index) => ({
    ...column,
    width: Math.max(
      1,
      Math.min(64, minimums[index]! + (finalExtras[index] ?? 0)),
    ),
  }));
}

export function blankSample(sample: DocumentData): DocumentData {
  return {
    ...sample,
    status: "",
    fields: Object.fromEntries(
      Object.keys(sample.fields).map((key) => [key, null]),
    ),
    items: [],
    itemNotes: [],
    sections: {},
    summary: null,
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run lib/print/templates/blocks.test.ts lib/print/templates/schema.test.ts lib/print/templates/defaults.test.ts`

Expected: PASS.

> Note: `blocks.test.ts` imports `tableWidths` from `layout.ts`, which only exports it after Task 3. If running before Task 3, temporarily move the `resizeColumns` assertions into Task 3; in normal execution order this task runs first and `tableWidths` does not yet exist, so **export `tableWidths` from `layout.ts` at the end of this task** (one-line change: add `export` to `function tableWidths`).

- [ ] **Step 6: Report checkpoint**

Report changes and test output. Owner commits.

---

### Task 3: Layout engine — per-block renderers follow `order`

**Files:**
- Modify: `lib/print/templates/layout.ts`
- Test: `lib/print/templates/layout.test.ts`

**Interfaces:**
- Consumes: `orderedBlockIds` from `blocks.ts`.
- Produces:
  - `layoutHeader(template, data): LayoutLine[]`
  - `layoutFields(template, data): LayoutLine[]`
  - `layoutItems(template, data): LayoutLine[]`
  - `layoutSection(template, section, data): LayoutLine[]`
  - `layoutSummary(template, data): LayoutLine[]`
  - `layoutFooter(template, data): LayoutLine[]`
  - `tableWidths(columns, paper): number[]` (exported)

- [ ] **Step 1: Add failing order/visibility layout tests**

Append to `lib/print/templates/layout.test.ts`:

```ts
describe("layoutTemplate — block order and visibility", () => {
  it("renders blocks in a custom order", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    template.order = ["summary", "items", "header", "fields", "footer"];
    const body = texts(layoutTemplate(template, receiptData));
    expect(body.findIndex((text) => text.startsWith("الإجمالي:"))).toBeLessThan(
      body.indexOf("كابتشينو"),
    );
    expect(body.indexOf("Acme Corner")).toBeLessThan(body.indexOf("رقم الطلب: 7"));
  });

  it("skips blocks hidden with the new flags", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    template.header.show = false;
    template.fields.visible = false;
    template.footer.show = false;
    template.summary.show = false;
    template.items.show = false;
    expect(layoutTemplate(template, receiptData)).toEqual([]);
  });

  it("falls back to canonical order when order is absent", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    delete template.order;
    expect(layoutTemplate(template, receiptData)).toEqual(
      layoutTemplate(DEFAULT_REPORT_TEMPLATES.receipt, receiptData),
    );
  });

  it("places a section block where order says", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.shift);
    template.order = [
      "section:reconciliation",
      "header",
      "fields",
      "items",
      "section:collection",
      "section:expenses",
      "summary",
      "footer",
    ];
    const lines = layoutTemplate(template, {
      ...receiptData,
      title: "إغلاق وردية #3",
      brandPhone: "",
      fields: {},
      items: [],
      itemNotes: [],
      sections: {
        collection: { kind: "kv", rows: [{ labelId: "invoiceCount", value: "2" }] },
        expenses: { kind: "kv", rows: [] },
        reconciliation: {
          kind: "kv",
          rows: [{ labelId: "expectedCash", value: "37.50 د.ل" }],
        },
      },
      summary: null,
    });
    const body = texts(lines);
    expect(body.indexOf("مطابقة النقد")).toBeLessThan(
      body.indexOf("إغلاق وردية #3"),
    );
  });
});
```

- [ ] **Step 2: Run the layout tests and confirm they fail**

Run: `npx vitest run lib/print/templates/layout.test.ts`

Expected: FAIL — custom order ignored, hidden header still printed.

- [ ] **Step 3: Refactor `layout.ts`**

Replace `layoutTemplate` and add the renderers, keeping every existing helper and body byte-identical:

```ts
import { charWidths } from "./columns";
import { orderedBlockIds } from "./blocks";
import type {
  Align,
  DocumentData,
  LayoutLine,
  ReportTemplate,
  TemplateColumn,
  TemplateLine,
  TextSize,
} from "./types";
```

Keep `textLine`, `expandPlaceholders`, `renderLines`, `wrapWords`, `columnCells` as they are. Export `tableWidths`:

```ts
export function tableWidths(columns: TemplateColumn[], paper: number): number[] {
  // body unchanged
}
```

Add the renderers:

```ts
export function layoutHeader(
  template: ReportTemplate,
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  if (template.header.show === false) return out;
  if (template.header.logo.show && data.logoAvailable) {
    out.push({
      kind: "logo",
      align: template.header.logo.align ?? "center",
      maxWidth: template.header.logo.maxWidth ?? 256,
    });
  }
  out.push(...renderLines(template.header.lines, data));
  if (template.header.separator !== false && out.length > 0) {
    out.push({ kind: "separator" });
  }
  return out;
}

export function layoutFields(
  template: ReportTemplate,
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  if (template.fields.visible === false) return out;
  const fieldRows = template.fields.show
    .map((id) => ({ id, value: data.fields[id]?.trim() ?? "" }))
    .filter((row) => row.value.length > 0);
  if (fieldRows.length === 0) return out;
  for (const field of fieldRows) {
    out.push(textLine(`${template.labels[field.id] ?? field.id}: ${field.value}`));
  }
  if (template.fields.separator !== false) out.push({ kind: "separator" });
  return out;
}

export function layoutItems(
  template: ReportTemplate,
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  const paper = template.paper.columns;
  if (
    !template.items.show ||
    data.items.length === 0 ||
    template.items.columns.length === 0
  ) {
    return out;
  }
  const title = (template.items.title ?? "").trim();
  if (title) out.push(textLine(expandPlaceholders(title, data), { bold: true }));
  const columns = template.items.columns;
  const widths = tableWidths(columns, paper);
  const header = columnCells(
    columns,
    Object.fromEntries(columns.map((column) => [column.key, column.label])),
    true,
  );
  if (template.items.header !== false) {
    out.push({ ...header, widths });
  }
  const nameIndex = columns.findIndex((column) => column.key === "name");
  data.items.forEach((item, index) => {
    out.push({ ...columnCells(columns, item), widths });
    if (nameIndex >= 0) {
      const column = columns[nameIndex]!;
      const name = item.name ?? "";
      const limit = Math.max(4, widths[nameIndex]! - 1);
      for (const continuation of wrapWords(name, limit).slice(1)) {
        out.push(
          textLine(continuation, {
            align: column.align ?? "right",
            bold: column.bold,
            size: column.size,
          }),
        );
      }
    }
    const note = data.itemNotes[index]?.trim();
    if (template.items.showNote !== false && note) {
      out.push(textLine(`• ${note}`, { size: "small" }));
    }
  });
  if (template.items.separator !== false) out.push({ kind: "separator" });
  return out;
}

export function layoutSection(
  template: ReportTemplate,
  section: ReportTemplate["sections"][number],
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  const paper = template.paper.columns;
  if (!section.show) return out;
  const sectionData = Object.hasOwn(data.sections, section.id)
    ? data.sections[section.id]
    : undefined;
  if (!sectionData) return out;
  const rendered: LayoutLine[] = [];
  if (section.title.trim()) {
    rendered.push(textLine(section.title, { bold: true }));
  }
  if (sectionData.kind === "kv") {
    for (const row of sectionData.rows) {
      const label =
        row.label ?? template.labels[row.labelId ?? ""] ?? row.labelId ?? "";
      rendered.push(
        textLine(row.value ? `${label}: ${row.value}` : label, {
          bold: row.bold,
        }),
      );
    }
    if (sectionData.rows.length === 0) {
      if (sectionData.emptyText) {
        rendered.push(textLine(sectionData.emptyText, { align: "center" }));
      } else {
        return out;
      }
    }
  } else if (sectionData.kind === "table") {
    const columns = section.columns ?? [];
    const widths = tableWidths(columns, paper);
    rendered.push({
      ...columnCells(
        columns,
        Object.fromEntries(columns.map((column) => [column.key, column.label])),
        true,
      ),
      widths,
    });
    for (const row of sectionData.table ?? []) {
      rendered.push({ ...columnCells(columns, row), widths });
    }
    if ((sectionData.table ?? []).length === 0) {
      if (!sectionData.emptyText) return out;
      rendered.length = section.title.trim() ? 1 : 0;
      rendered.push(textLine(sectionData.emptyText, { align: "center" }));
    }
  } else {
    const columns = section.columns ?? [];
    const widths = tableWidths(columns, paper);
    const groups = sectionData.groups ?? [];
    if (groups.length === 0) {
      if (!sectionData.emptyText) return out;
      rendered.push(textLine(sectionData.emptyText, { align: "center" }));
    } else {
      groups.forEach((group, index) => {
        if (index > 0) rendered.push({ kind: "separator" });
        rendered.push(
          textLine(`— ${group.label} —`, {
            align: "center",
            bold: true,
            size: "large",
          }),
        );
        for (const row of group.rows) {
          rendered.push({ ...columnCells(columns, row), widths });
        }
        rendered.push(
          textLine(
            `${template.labels.groupTotal ?? "الإجمالي"}: ${group.total}`,
          ),
        );
      });
    }
  }
  if (rendered.length === 0) return out;
  if (section.separator !== false) out.push({ kind: "separator" });
  out.push(...rendered);
  return out;
}

export function layoutSummary(
  template: ReportTemplate,
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  if (!template.summary.show || !data.summary) return out;
  if (template.summary.separator !== false) out.push({ kind: "separator" });
  out.push(
    textLine(`${template.summary.label}: ${data.summary}`, {
      bold: true,
      size: "xlarge",
    }),
  );
  return out;
}

export function layoutFooter(
  template: ReportTemplate,
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  if (template.footer.show === false) return out;
  const footer = renderLines(template.footer.lines, data);
  if (footer.length === 0) return out;
  if (template.footer.separator !== false) out.push({ kind: "separator" });
  out.push(...footer);
  return out;
}

export function layoutTemplate(
  template: ReportTemplate,
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  for (const id of orderedBlockIds(template)) {
    if (id === "header") {
      out.push(...layoutHeader(template, data));
    } else if (id === "fields") {
      out.push(...layoutFields(template, data));
    } else if (id === "items") {
      out.push(...layoutItems(template, data));
    } else if (id === "summary") {
      out.push(...layoutSummary(template, data));
    } else if (id === "footer") {
      out.push(...layoutFooter(template, data));
    } else {
      const section = template.sections.find(
        (entry) => `section:${entry.id}` === id,
      );
      if (section) out.push(...layoutSection(template, section, data));
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the layout tests**

Run: `npx vitest run lib/print/templates/layout.test.ts`

Expected: PASS, including every pre-existing expectation.

- [ ] **Step 5: Run all template tests**

Run: `npx vitest run lib/print/templates`

Expected: PASS.

- [ ] **Step 6: Report checkpoint**

Report changes and test output. Owner commits.

---

### Task 4: `useTemplateEditor` history hook

**Files:**
- Create: `components/admin/report-design/useTemplateEditor.ts`
- Test: `components/admin/report-design/useTemplateEditor.test.tsx`

**Interfaces:**
- Consumes: `templatesEqual` from `schema.ts`.
- Produces: `useTemplateEditor(initial: ReportTemplate): TemplateEditor` with `{ template, dirty, canUndo, canRedo, commit, undo, redo, replace, markSaved }`; `EditorCommitOptions` type.

- [ ] **Step 1: Write failing hook tests**

Create `components/admin/report-design/useTemplateEditor.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";
import type { ReportTemplate } from "@/lib/print/templates/types";
import { useTemplateEditor } from "./useTemplateEditor";

function withFooter(text: string): ReportTemplate {
  const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
  template.footer.lines = [{ text }];
  return template;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useTemplateEditor", () => {
  it("commits, undoes, and redoes edits", () => {
    const { result } = renderHook(() =>
      useTemplateEditor(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );
    expect(result.current.dirty).toBe(false);

    act(() => result.current.commit(withFooter("نسخة")));
    expect(result.current.dirty).toBe(true);
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.template.footer.lines[0]!.text).toBe("{{footer}}");
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.template.footer.lines[0]!.text).toBe("نسخة");
  });

  it("coalesces rapid edits with the same key and starts a new step after the pause", () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { result } = renderHook(() =>
      useTemplateEditor(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );

    act(() => result.current.commit(withFooter("أ"), { coalesceKey: "line" }));
    now += 100;
    act(() => result.current.commit(withFooter("أب"), { coalesceKey: "line" }));
    now += 600;
    act(() => result.current.commit(withFooter("أبج"), { coalesceKey: "line" }));

    act(() => result.current.undo());
    expect(result.current.template.footer.lines[0]!.text).toBe("أب");
    act(() => result.current.undo());
    expect(result.current.template.footer.lines[0]!.text).toBe("{{footer}}");
  });

  it("pushes history for replace and clears dirty on markSaved", () => {
    const { result } = renderHook(() =>
      useTemplateEditor(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );
    act(() => result.current.replace(withFooter("مستورد")));
    expect(result.current.dirty).toBe(true);

    act(() => result.current.markSaved(withFooter("مستورد")));
    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(true);
  });

  it("adopts a new prop only while clean", () => {
    const { result, rerender } = renderHook(
      ({ template }) => useTemplateEditor(template),
      {
        initialProps: {
          template: structuredClone(DEFAULT_REPORT_TEMPLATES.receipt),
        },
      },
    );

    act(() => result.current.commit(withFooter("تعديل")));
    rerender({ template: withFooter("من السيرفر") });
    expect(result.current.template.footer.lines[0]!.text).toBe("تعديل");

    act(() => result.current.markSaved(withFooter("تعديل")));
    rerender({ template: withFooter("من السيرفر") });
    expect(result.current.template.footer.lines[0]!.text).toBe("من السيرفر");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run components/admin/report-design/useTemplateEditor.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `components/admin/report-design/useTemplateEditor.ts`:

```ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { templatesEqual } from "@/lib/print/templates/schema";
import type { ReportTemplate } from "@/lib/print/templates/types";

export type EditorCommitOptions = { coalesceKey?: string };

export type TemplateEditor = {
  template: ReportTemplate;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  commit: (next: ReportTemplate, options?: EditorCommitOptions) => void;
  undo: () => void;
  redo: () => void;
  replace: (next: ReportTemplate) => void;
  markSaved: (saved: ReportTemplate) => void;
};

type History = {
  past: ReportTemplate[];
  present: ReportTemplate;
  future: ReportTemplate[];
};

const HISTORY_LIMIT = 50;
const COALESCE_MS = 500;

function clone(template: ReportTemplate): ReportTemplate {
  return JSON.parse(JSON.stringify(template)) as ReportTemplate;
}

export function useTemplateEditor(initial: ReportTemplate): TemplateEditor {
  const [baseline, setBaseline] = useState(() => clone(initial));
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: clone(initial),
    future: [],
  }));
  const coalesceRef = useRef<{ key: string; at: number } | null>(null);

  const present = history.present;
  const dirty = useMemo(
    () => !templatesEqual(present, baseline),
    [present, baseline],
  );

  const push = useCallback(
    (state: History, next: ReportTemplate): History => ({
      past: [...state.past, state.present].slice(-HISTORY_LIMIT),
      present: clone(next),
      future: [],
    }),
    [],
  );

  const commit = useCallback(
    (next: ReportTemplate, options?: EditorCommitOptions) => {
      const key = options?.coalesceKey;
      const now = Date.now();
      const merge =
        key !== undefined &&
        coalesceRef.current !== null &&
        coalesceRef.current.key === key &&
        now - coalesceRef.current.at < COALESCE_MS;
      coalesceRef.current = key ? { key, at: now } : null;
      setHistory((state) => {
        if (templatesEqual(state.present, next)) return state;
        if (merge) return { ...state, present: clone(next), future: [] };
        return push(state, next);
      });
    },
    [push],
  );

  const undo = useCallback(() => {
    coalesceRef.current = null;
    setHistory((state) => {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
      };
    });
  }, []);

  const redo = useCallback(() => {
    coalesceRef.current = null;
    setHistory((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: state.future.slice(1),
      };
    });
  }, []);

  const replace = useCallback(
    (next: ReportTemplate) => {
      coalesceRef.current = null;
      setHistory((state) => {
        if (templatesEqual(state.present, next)) return state;
        return push(state, next);
      });
    },
    [push],
  );

  const markSaved = useCallback((saved: ReportTemplate) => {
    coalesceRef.current = null;
    setBaseline(clone(saved));
  }, []);

  useEffect(() => {
    if (dirty) return;
    if (templatesEqual(initial, baseline)) return;
    const next = clone(initial);
    setBaseline(next);
    setHistory({ past: [], present: next, future: [] });
  }, [initial, baseline, dirty]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  return {
    template: present,
    dirty,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    commit,
    undo,
    redo,
    replace,
    markSaved,
  };
}
```

- [ ] **Step 4: Run the hook tests**

Run: `npx vitest run components/admin/report-design/useTemplateEditor.test.tsx`

Expected: PASS.

- [ ] **Step 5: Report checkpoint**

Report changes and test output. Owner commits.

---

### Task 5: Paper canvas — `CanvasLines`, `CanvasBlock`, `ReportCanvas`

**Files:**
- Create: `components/admin/report-design/CanvasLines.tsx`
- Create: `components/admin/report-design/CanvasBlock.tsx`
- Create: `components/admin/report-design/ReportCanvas.tsx`
- Test: `components/admin/report-design/ReportCanvas.test.tsx`

**Interfaces:**
- Consumes: `BlockId`, `TemplateCommit`, `blockLabel`, `blockVisible`, `moveBlock`, `setBlockVisible`, `addHeaderLine`, `addFooterLine`, `resizeColumns`, `MAX_LINES` from `blocks.ts`; `expandPlaceholders`, `layoutTemplate`, `tableWidths` from `layout.ts`.
- Produces: `ReportCanvas({ template, data, selected, onSelect, onCommit })`; `PAPER_WIDTH = 360`; exported `TEXT_SIZE` from `CanvasLines.tsx`.

- [ ] **Step 1: Write failing canvas tests**

Create `components/admin/report-design/ReportCanvas.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";
import { tableWidths } from "@/lib/print/templates/layout";
import { buildSampleDocuments, sampleSettings } from "@/lib/print/templates/sample";
import type { ReportTemplate } from "@/lib/print/templates/types";
import { ReportCanvas } from "./ReportCanvas";

const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
const sample = buildSampleDocuments(sampleSettings).receipt;

function renderCanvas() {
  const onCommit = vi.fn();
  render(
    <ReportCanvas
      template={template}
      data={sample}
      selected="header"
      onSelect={() => {}}
      onCommit={onCommit}
    />,
  );
  return onCommit;
}

describe("ReportCanvas", () => {
  it("renders every block in printed order with real sample data", () => {
    renderCanvas();
    const groups = screen
      .getAllByRole("group")
      .map((node) => node.getAttribute("aria-label"));
    expect(groups).toEqual([
      "الترويسة",
      "البيانات",
      "الأصناف",
      "الإجمالي",
      "التذييل",
    ]);
    expect(screen.getByText("كابتشينو")).toBeTruthy();
    expect(screen.getByText("REST")).toBeTruthy();
  });

  it("moves a block with the up and down buttons", () => {
    const onCommit = renderCanvas();
    fireEvent.click(screen.getByRole("button", { name: "تحريك الإجمالي لأعلى" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect((onCommit.mock.calls[0]![0] as ReportTemplate).order).toEqual([
      "header",
      "fields",
      "summary",
      "items",
      "footer",
    ]);
  });

  it("hides a block with the eye button", () => {
    const onCommit = renderCanvas();
    fireEvent.click(screen.getByRole("button", { name: "إخفاء البيانات" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect((onCommit.mock.calls[0]![0] as ReportTemplate).fields.visible).toBe(
      false,
    );
  });

  it("edits a header line inline and commits on Enter", () => {
    const onCommit = renderCanvas();
    fireEvent.doubleClick(screen.getByText("REST"));
    const input = screen.getByLabelText("نص السطر 1");
    fireEvent.change(input, { target: { value: "مرحباً" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      (onCommit.mock.calls[0]![0] as ReportTemplate).header.lines[0]!.text,
    ).toBe("مرحباً");
  });

  it("cancels an inline edit on Escape", () => {
    const onCommit = renderCanvas();
    fireEvent.doubleClick(screen.getByText("REST"));
    const input = screen.getByLabelText("نص السطر 1");
    fireEvent.change(input, { target: { value: "لن يُحفظ" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("نص السطر 1")).toBeNull();
  });

  it("resizes a table column with the arrow keys", () => {
    const onCommit = renderCanvas();
    const before = tableWidths(template.items.columns, 32);
    fireEvent.keyDown(
      screen.getByRole("button", { name: "تغيير عرض العمود الصنف" }),
      { key: "ArrowLeft" },
    );
    expect(onCommit).toHaveBeenCalledTimes(1);
    const next = onCommit.mock.calls[0]![0] as ReportTemplate;
    const after = tableWidths(next.items.columns, 32);
    expect(after[0]).toBeLessThan(before[0]!);
    expect(after.reduce((sum, value) => sum + value, 0)).toBe(32);
    expect(next.items.columns.reduce((sum, column) => sum + column.width, 0)).toBe(
      32,
    );
  });

  it("reorders blocks by dragging the handle", () => {
    const onCommit = renderCanvas();
    const cards = screen.getAllByRole("group");
    const tops = [0, 100, 200, 300, 400];
    cards.forEach((card, index) => {
      card.getBoundingClientRect = () =>
        ({
          top: tops[index],
          y: tops[index],
          bottom: tops[index]! + 100,
          height: 100,
          left: 0,
          right: 360,
          width: 360,
          x: 0,
          toJSON: () => ({}),
        }) as DOMRect;
    });
    const handle = screen.getByRole("button", { name: "اسحب لتحريك التذييل" });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 450 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 10 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 10 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect((onCommit.mock.calls[0]![0] as ReportTemplate).order![0]).toBe(
      "footer",
    );
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run components/admin/report-design/ReportCanvas.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Create `CanvasLines.tsx`**

```tsx
"use client";

import type { LayoutLine, TextSize } from "@/lib/print/templates/types";

export const TEXT_SIZE: Record<TextSize, number> = {
  small: 11,
  normal: 12,
  large: 14,
  xlarge: 16,
};

export function CanvasLines({ lines }: { lines: LayoutLine[] }) {
  return (
    <div className="space-y-0.5">
      {lines.map((line, index) => {
        if (line.kind === "separator") {
          return (
            <hr key={index} className="my-1 border-dashed border-neutral-400" />
          );
        }
        if (line.kind === "logo") {
          return (
            <div
              key={index}
              className="my-1 text-center text-[10px] text-neutral-400"
            >
              [شعار]
            </div>
          );
        }
        if (line.kind === "columns") {
          return (
            <div key={index} className="flex flex-row gap-1">
              {line.cells.map((cell, cellIndex) => (
                <span
                  key={cellIndex}
                  className="truncate"
                  style={{
                    flex: line.widths[cellIndex] ?? 1,
                    textAlign: cell.align,
                    fontWeight: cell.bold ? 800 : 400,
                    fontSize: TEXT_SIZE[cell.size],
                  }}
                >
                  {cell.text}
                </span>
              ))}
            </div>
          );
        }
        return (
          <p
            key={index}
            style={{
              textAlign: line.align,
              fontWeight: line.bold ? 800 : 400,
              fontSize: TEXT_SIZE[line.size],
            }}
          >
            {line.text}
          </p>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Create `CanvasBlock.tsx`**

```tsx
"use client";

import {
  Fragment,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  Plus,
} from "lucide-react";
import {
  addFooterLine,
  addHeaderLine,
  blockLabel,
  blockVisible,
  MAX_LINES,
  resizeColumns,
  setBlockVisible,
  type BlockId,
  type TemplateCommit,
} from "@/lib/print/templates/blocks";
import {
  expandPlaceholders,
  layoutTemplate,
  tableWidths,
} from "@/lib/print/templates/layout";
import type {
  DocumentData,
  LayoutLine,
  ReportTemplate,
  TemplateColumn,
  TemplateLine,
} from "@/lib/print/templates/types";
import { CanvasLines, TEXT_SIZE } from "./CanvasLines";

export const PAPER_WIDTH = 360;

type Editing =
  | { kind: "header" | "footer"; index: number }
  | { kind: "section" }
  | null;

type CanvasBlockProps = {
  id: BlockId;
  template: ReportTemplate;
  data: DocumentData;
  selected: boolean;
  dragging: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSelect: () => void;
  onCommit: TemplateCommit;
  onDragPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onMove: (direction: -1 | 1) => void;
};

function clone(template: ReportTemplate): ReportTemplate {
  return JSON.parse(JSON.stringify(template)) as ReportTemplate;
}

function previewTemplate(
  template: ReportTemplate,
  id: BlockId,
): ReportTemplate {
  return {
    ...template,
    order: [id],
    header: { ...template.header, show: id === "header" },
    fields: { ...template.fields, visible: id === "fields" },
    items: { ...template.items, show: id === "items" },
    summary: { ...template.summary, show: id === "summary" },
    footer: { ...template.footer, show: id === "footer" },
    sections: template.sections.map((section) => ({
      ...section,
      show: `section:${section.id}` === id,
    })),
  };
}

function lineStyle(line: TemplateLine): CSSProperties {
  return {
    textAlign: line.align ?? "right",
    fontWeight: line.bold ? 800 : 400,
    fontSize: TEXT_SIZE[line.size ?? "normal"],
  };
}

export function CanvasBlock({
  id,
  template,
  data,
  selected,
  dragging,
  canMoveUp,
  canMoveDown,
  onSelect,
  onCommit,
  onDragPointerDown,
  onMove,
}: CanvasBlockProps) {
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState("");
  const cancelRef = useRef(false);
  const resizeRef = useRef<{
    pointerId: number;
    x: number;
    index: number;
    widths: number[];
  } | null>(null);

  const visible = blockVisible(template, id);
  const label = blockLabel(template, id);
  const section = template.sections.find(
    (entry) => `section:${entry.id}` === id,
  );
  const isHeader = id === "header";
  const isFooter = id === "footer";
  const editableLines: TemplateLine[] = isHeader
    ? template.header.lines
    : isFooter
      ? template.footer.lines
      : [];
  const preview = previewTemplate(template, id);
  const sectionPreview: ReportTemplate = section
    ? {
        ...preview,
        sections: preview.sections.map((entry) =>
          entry.id === section.id ? { ...entry, title: "" } : entry,
        ),
      }
    : preview;
  const lines: LayoutLine[] = layoutTemplate(
    section ? sectionPreview : preview,
    data,
  );
  const columns: TemplateColumn[] =
    id === "items" ? template.items.columns : (section?.columns ?? []);
  const widths =
    columns.length > 0 ? tableWidths(columns, template.paper.columns) : [];

  const hasContent = isHeader
    ? (template.header.logo.show && data.logoAvailable) ||
      editableLines.some((line) => expandPlaceholders(line.text, data))
    : isFooter
      ? editableLines.some((line) => expandPlaceholders(line.text, data))
      : lines.length > 0 || Boolean(section?.title.trim());

  function startLineEdit(kind: "header" | "footer", index: number) {
    const line =
      kind === "header"
        ? template.header.lines[index]
        : template.footer.lines[index];
    if (!line) return;
    setDraft(line.text);
    cancelRef.current = false;
    setEditing({ kind, index });
  }

  function startSectionEdit() {
    if (!section) return;
    setDraft(section.title);
    cancelRef.current = false;
    setEditing({ kind: "section" });
  }

  function finishEdit(text: string) {
    if (!editing) return;
    if (editing.kind === "section") {
      if (!section) {
        setEditing(null);
        return;
      }
      const next = clone(template);
      const target = next.sections.find((entry) => entry.id === section.id);
      if (target) target.title = text;
      setEditing(null);
      onCommit(next);
      return;
    }
    const next = clone(template);
    if (editing.kind === "header") {
      next.header.lines[editing.index] = {
        ...next.header.lines[editing.index]!,
        text,
      };
    } else {
      next.footer.lines[editing.index] = {
        ...next.footer.lines[editing.index]!,
        text,
      };
    }
    setEditing(null);
    onCommit(next);
  }

  function shiftWidths(index: number, delta: number, base: number[]): number[] {
    const next = [...base];
    const leftMin = columns[index]!.label.length;
    const rightMin = columns[index + 1]!.label.length;
    const grow = next[index + 1]! - rightMin;
    const shrink = next[index]! - leftMin;
    const applied = Math.max(-shrink, Math.min(grow, delta));
    next[index] = next[index]! + applied;
    next[index + 1] = next[index + 1]! - applied;
    return next;
  }

  function resizeBy(index: number, delta: number) {
    const target = shiftWidths(index, delta, widths);
    onCommit(resizeColumns(columns, target, template.paper.columns), {
      coalesceKey: `resize:${id}:${index}`,
    });
  }

  function editInput(ariaLabel: string, className: string) {
    return (
      <input
        autoFocus
        aria-label={ariaLabel}
        dir="rtl"
        className={className}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            finishEdit(draft);
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancelRef.current = true;
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (cancelRef.current) {
            cancelRef.current = false;
            setEditing(null);
            return;
          }
          finishEdit(draft);
        }}
      />
    );
  }

  return (
    <section
      data-block-id={id}
      role="group"
      aria-label={label}
      aria-selected={selected}
      onClick={onSelect}
      className={`rounded-lg border-2 bg-white p-2 text-black transition ${
        selected ? "border-primary" : "border-transparent"
      } ${dragging ? "opacity-60" : ""} ${visible ? "" : "opacity-45"}`}
    >
      <div
        className="mb-1 flex flex-wrap items-center gap-1"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label={`اسحب لتحريك ${label}`}
          className="btn btn-xs btn-ghost cursor-grab"
          onPointerDown={onDragPointerDown}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`تحريك ${label} لأعلى`}
          className="btn btn-xs btn-ghost"
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
        >
          <ArrowUp className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`تحريك ${label} لأسفل`}
          className="btn btn-xs btn-ghost"
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
        >
          <ArrowDown className="size-4" />
        </button>
        <button
          type="button"
          aria-label={visible ? `إخفاء ${label}` : `إظهار ${label}`}
          className="btn btn-xs btn-ghost"
          onClick={() => onCommit(setBlockVisible(template, id, !visible))}
        >
          {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
        {(isHeader || isFooter ? editableLines.length > 0 : Boolean(section)) && (
          <button
            type="button"
            aria-label={`تعديل النص — ${label}`}
            className="btn btn-xs btn-ghost"
            onClick={() => {
              if (isHeader) startLineEdit("header", 0);
              else if (isFooter) startLineEdit("footer", 0);
              else startSectionEdit();
            }}
          >
            <Pencil className="size-4" />
          </button>
        )}
        {(isHeader || isFooter) && (
          <button
            type="button"
            aria-label={`إضافة سطر إلى ${label}`}
            className="btn btn-xs btn-ghost"
            disabled={editableLines.length >= MAX_LINES}
            onClick={() =>
              onCommit(
                isHeader ? addHeaderLine(template) : addFooterLine(template),
              )
            }
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>

      {(isHeader || isFooter) && (
        <>
          {isHeader && template.header.logo.show && data.logoAvailable && (
            <div className="my-1 text-center text-[10px] text-neutral-400">
              [شعار]
            </div>
          )}
          {editableLines.map((line, index) => {
            const kind = isHeader ? "header" : "footer";
            const text = expandPlaceholders(line.text, data);
            if (editing?.kind === kind && editing.index === index) {
              return (
                <Fragment key={index}>
                  {editInput(
                    `نص السطر ${index + 1}`,
                    "w-full rounded border border-primary bg-white px-1 text-black",
                  )}
                </Fragment>
              );
            }
            if (!text) {
              return (
                <button
                  key={index}
                  type="button"
                  className="block w-full text-right text-[11px] text-neutral-400"
                  onDoubleClick={() => startLineEdit(kind, index)}
                  onClick={(event) => {
                    event.stopPropagation();
                    startLineEdit(kind, index);
                  }}
                >
                  (سطر فارغ — اضغط للتعديل)
                </button>
              );
            }
            return (
              <p
                key={index}
                style={lineStyle(line)}
                onDoubleClick={() => startLineEdit(kind, index)}
              >
                {text}
              </p>
            );
          })}
        </>
      )}

      {section && (
        <>
          {editing?.kind === "section"
            ? editInput(
                "عنوان القسم",
                "w-full rounded border border-primary bg-white px-1 font-bold text-black",
              )
            : (
                <p className="font-bold" onDoubleClick={startSectionEdit}>
                  {section.title.trim() || (
                    <span className="text-[11px] font-normal text-neutral-400">
                      (بلا عنوان — اضغط للتعديل)
                    </span>
                  )}
                </p>
              )}
        </>
      )}

      {!isHeader && !isFooter && <CanvasLines lines={lines} />}

      {!hasContent && (
        <p className="py-1 text-center text-[11px] text-neutral-400">
          لن يظهر في هذه المعاينة
        </p>
      )}

      {columns.length > 1 && (
        <div
          className="mt-2 flex flex-wrap items-center justify-center gap-1"
          dir="rtl"
        >
          {columns.map((column, index) => (
            <Fragment key={column.key}>
              <span className="rounded bg-neutral-100 px-1 text-[10px] text-neutral-500">
                {column.label}
              </span>
              {index < columns.length - 1 && (
                <button
                  type="button"
                  aria-label={`تغيير عرض العمود ${column.label}`}
                  className="btn btn-xs btn-ghost px-1 text-neutral-500"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (event.button !== 0) return;
                    try {
                      event.currentTarget.setPointerCapture(event.pointerId);
                    } catch {
                      /* jsdom has no pointer capture */
                    }
                    resizeRef.current = {
                      pointerId: event.pointerId,
                      x: event.clientX,
                      index,
                      widths: [...widths],
                    };
                  }}
                  onPointerMove={(event) => {
                    const start = resizeRef.current;
                    if (!start || start.pointerId !== event.pointerId) return;
                    const delta = Math.round(
                      ((event.clientX - start.x) * template.paper.columns) /
                        PAPER_WIDTH,
                    );
                    const target = shiftWidths(start.index, delta, start.widths);
                    onCommit(
                      resizeColumns(
                        columns,
                        target,
                        template.paper.columns,
                      ),
                      { coalesceKey: `resize:${id}:${start.index}` },
                    );
                  }}
                  onPointerUp={() => {
                    resizeRef.current = null;
                  }}
                  onPointerCancel={() => {
                    resizeRef.current = null;
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key !== "ArrowLeft" &&
                      event.key !== "ArrowRight"
                    ) {
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    resizeBy(index, event.key === "ArrowRight" ? 1 : -1);
                  }}
                >
                  <Columns3 className="size-3" />
                </button>
              )}
            </Fragment>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Create `ReportCanvas.tsx`**

```tsx
"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  moveBlock,
  orderedBlockIds,
  type BlockId,
  type TemplateCommit,
} from "@/lib/print/templates/blocks";
import type { DocumentData, ReportTemplate } from "@/lib/print/templates/types";
import { CanvasBlock } from "./CanvasBlock";

type ReportCanvasProps = {
  template: ReportTemplate;
  data: DocumentData;
  selected: BlockId | null;
  onSelect: (id: BlockId) => void;
  onCommit: TemplateCommit;
};

type DragState = {
  id: BlockId;
  pointerId: number;
  startY: number;
  moved: boolean;
  rects: Array<{ id: BlockId; mid: number }>;
};

export function ReportCanvas({
  template,
  data,
  selected,
  onSelect,
  onCommit,
}: ReportCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragId, setDragId] = useState<BlockId | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const order = orderedBlockIds(template);
  const rest = dragId ? order.filter((entry) => entry !== dragId) : order;

  function beginDrag(id: BlockId, event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const cards = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>("[data-block-id]") ??
        [],
    );
    const rects = cards
      .map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          id: card.dataset.blockId as BlockId,
          mid: rect.top + rect.height / 2,
        };
      })
      .filter((entry) => entry.id !== id);
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startY: event.clientY,
      moved: false,
      rects,
    };
    setDragId(id);
    setDropIndex(null);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* jsdom has no pointer capture */
    }
  }

  useEffect(() => {
    if (!dragId) return;
    function onMove(event: PointerEvent) {
      const state = dragRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (!state.moved) {
        if (Math.abs(event.clientY - state.startY) < 4) return;
        state.moved = true;
      }
      let index = state.rects.length;
      for (let position = 0; position < state.rects.length; position += 1) {
        if (event.clientY < state.rects[position]!.mid) {
          index = position;
          break;
        }
      }
      setDropIndex(index);
    }
    function onUp(event: PointerEvent) {
      const state = dragRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (state.moved && dropIndex !== null) {
        onCommit(moveBlock(template, state.id, dropIndex));
      }
      dragRef.current = null;
      setDragId(null);
      setDropIndex(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      dragRef.current = null;
      setDragId(null);
      setDropIndex(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [dragId, dropIndex, template, onCommit]);

  return (
    <div className="overflow-x-auto py-2">
      <div
        ref={containerRef}
        dir="rtl"
        className="mx-auto flex w-[360px] flex-col gap-1 rounded-xl bg-white p-3 text-black shadow"
      >
        {order.map((id) => {
          const restIndex = rest.indexOf(id);
          return (
            <Fragment key={id}>
              {dropIndex !== null && restIndex === dropIndex && (
                <div className="h-1 rounded bg-primary" data-drop-line />
              )}
              <CanvasBlock
                id={id}
                template={template}
                data={data}
                selected={selected === id}
                dragging={dragId === id}
                canMoveUp={order.indexOf(id) > 0}
                canMoveDown={order.indexOf(id) < order.length - 1}
                onSelect={() => onSelect(id)}
                onCommit={onCommit}
                onDragPointerDown={(event) => beginDrag(id, event)}
                onMove={(direction) => {
                  const from = order.indexOf(id);
                  onCommit(moveBlock(template, id, from + direction));
                }}
              />
            </Fragment>
          );
        })}
        {dropIndex !== null && dropIndex === rest.length && (
          <div className="h-1 rounded bg-primary" data-drop-line />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the canvas tests**

Run: `npx vitest run components/admin/report-design/ReportCanvas.test.tsx`

Expected: PASS.

> If jsdom lacks `PointerEvent`, Testing Library falls back to a generic event and still copies `clientY`/`pointerId`. If the drag test fails at dispatch, replace the three `fireEvent.pointer*` calls with `fireEvent(window, new MouseEvent("pointermove", { clientY: 10 }) as unknown as Event)` style dispatch and set `pointerId` via `Object.defineProperty` on the event; do not change production code to accommodate the test.

- [ ] **Step 7: Report checkpoint**

Report changes and test output. Owner commits.

---

### Task 6: `BlockInspector`

**Files:**
- Create: `components/admin/report-design/BlockInspector.tsx`
- Test: `components/admin/report-design/BlockInspector.test.tsx`

**Interfaces:**
- Consumes: `blockLabel`, `setBlockVisible`, `TemplateCommit`, `BlockId`; `DOCUMENT_SPECS` from `document-specs.ts`.
- Produces: `BlockInspector({ template, selected, onChange })`.

- [ ] **Step 1: Write failing inspector tests**

Create `components/admin/report-design/BlockInspector.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";
import type { ReportTemplate } from "@/lib/print/templates/types";
import { BlockInspector } from "./BlockInspector";

function renderInspector(
  selected: "header" | "fields" | "items",
  onChange = vi.fn(),
) {
  render(
    <BlockInspector
      template={structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)}
      selected={selected}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("BlockInspector", () => {
  it("edits a header line and its style", () => {
    const onChange = renderInspector("header");
    fireEvent.change(screen.getByLabelText("سطر الترويسة 1"), {
      target: { value: "مرحباً" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as ReportTemplate;
    expect(next.header.lines[0]!.text).toBe("مرحباً");
  });

  it("hides the fields block without losing its selection", () => {
    const onChange = renderInspector("fields");
    fireEvent.click(screen.getByLabelText("إظهار البيانات"));
    const next = onChange.mock.calls[0]![0] as ReportTemplate;
    expect(next.fields.visible).toBe(false);
    expect(next.fields.show).toEqual(
      DEFAULT_REPORT_TEMPLATES.receipt.fields.show,
    );
  });

  it("renames an item column label", () => {
    const onChange = renderInspector("items");
    fireEvent.change(
      screen.getByLabelText("عنوان العمود الصنف"),
      { target: { value: "المنتج" } },
    );
    const next = onChange.mock.calls[0]![0] as ReportTemplate;
    expect(next.items.columns[0]!.label).toBe("المنتج");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run components/admin/report-design/BlockInspector.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `BlockInspector.tsx`**

```tsx
"use client";

import {
  blockLabel,
  setBlockVisible,
  type BlockId,
  type TemplateCommit,
} from "@/lib/print/templates/blocks";
import { DOCUMENT_SPECS } from "@/lib/print/templates/document-specs";
import type {
  Align,
  ReportTemplate,
  TemplateColumn,
  TemplateLine,
  TextSize,
} from "@/lib/print/templates/types";

type BlockInspectorProps = {
  template: ReportTemplate;
  selected: BlockId | null;
  onChange: TemplateCommit;
};

const ALIGNS: Align[] = ["right", "center", "left"];
const ALIGN_LABELS: Record<Align, string> = {
  right: "يمين",
  center: "وسط",
  left: "يسار",
};
const SIZES: TextSize[] = ["small", "normal", "large", "xlarge"];
const SIZE_LABELS: Record<TextSize, string> = {
  small: "صغير",
  normal: "عادي",
  large: "كبير",
  xlarge: "كبير جداً",
};

function clone(template: ReportTemplate): ReportTemplate {
  return JSON.parse(JSON.stringify(template)) as ReportTemplate;
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-base font-bold">
      <input
        type="checkbox"
        aria-label={label}
        className="checkbox checkbox-lg"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function LineEditorRows({
  target,
  lines,
  onPatch,
}: {
  target: "header" | "footer";
  lines: TemplateLine[];
  onPatch: (index: number, patch: Partial<TemplateLine>) => void;
}) {
  const prefix = target === "header" ? "سطر الترويسة" : "سطر التذييل";
  return (
    <>
      {lines.map((line, index) => (
        <div key={index} className="space-y-2 rounded-xl border border-base-200 p-2">
          <input
            aria-label={`${prefix} ${index + 1}`}
            className="input input-bordered input-lg w-full"
            value={line.text}
            onChange={(event) => onPatch(index, { text: event.target.value })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={`محاذاة السطر ${index + 1}`}
              className="select select-bordered select-lg"
              value={line.align ?? "right"}
              onChange={(event) =>
                onPatch(index, { align: event.target.value as Align })
              }
            >
              {ALIGNS.map((align) => (
                <option key={align} value={align}>
                  {ALIGN_LABELS[align]}
                </option>
              ))}
            </select>
            <select
              aria-label={`حجم السطر ${index + 1}`}
              className="select select-bordered select-lg"
              value={line.size ?? "normal"}
              onChange={(event) =>
                onPatch(index, { size: event.target.value as TextSize })
              }
            >
              {SIZES.map((size) => (
                <option key={size} value={size}>
                  {SIZE_LABELS[size]}
                </option>
              ))}
            </select>
            <Switch
              label={`السطر ${index + 1} عريض`}
              checked={line.bold ?? false}
              onChange={(value) => onPatch(index, { bold: value })}
            />
          </div>
        </div>
      ))}
    </>
  );
}

export function BlockInspector({
  template,
  selected,
  onChange,
}: BlockInspectorProps) {
  function updateLine(
    target: "header" | "footer",
    index: number,
    patch: Partial<TemplateLine>,
  ) {
    const next = clone(template);
    if (target === "header") {
      next.header.lines[index] = { ...next.header.lines[index]!, ...patch };
    } else {
      next.footer.lines[index] = { ...next.footer.lines[index]!, ...patch };
    }
    onChange(next, { coalesceKey: `${target}-line-${index}` });
  }

  function updateColumn(
    target: "items" | string,
    index: number,
    patch: Partial<TemplateColumn>,
  ) {
    const next = clone(template);
    if (target === "items") {
      next.items.columns[index] = { ...next.items.columns[index]!, ...patch };
    } else {
      const section = next.sections.find((entry) => entry.id === target);
      if (!section || !section.columns) return;
      section.columns[index] = { ...section.columns[index]!, ...patch };
    }
    onChange(next, { coalesceKey: `column-${target}-${index}` });
  }

  function updateFieldLabel(id: string, value: string) {
    const next = clone(template);
    next.labels[id] = value;
    onChange(next, { coalesceKey: `label-${id}` });
  }

  function toggleField(id: string, checked: boolean) {
    const next = clone(template);
    next.fields.show = checked
      ? [...next.fields.show, id]
      : next.fields.show.filter((entry) => entry !== id);
    if (checked && !next.labels[id]) next.labels[id] = id;
    onChange(next);
  }

  function moveField(index: number, direction: -1 | 1) {
    const next = clone(template);
    const show = [...next.fields.show];
    const target = index + direction;
    if (target < 0 || target >= show.length) return;
    [show[index], show[target]] = [show[target]!, show[index]!];
    next.fields.show = show;
    onChange(next);
  }

  function columnEditor(
    columns: TemplateColumn[],
    target: "items" | string,
  ) {
    return (
      <div className="space-y-2">
        {columns.map((column, index) => (
          <div key={column.key} className="grid grid-cols-[1fr_6rem] gap-2">
            <input
              aria-label={`عنوان العمود ${column.label}`}
              className="input input-bordered input-lg w-full"
              value={column.label}
              onChange={(event) =>
                updateColumn(target, index, { label: event.target.value })
              }
            />
            <input
              aria-label={`عرض العمود ${column.label}`}
              type="number"
              min={1}
              max={64}
              className="input input-bordered input-lg w-full"
              value={column.width}
              onChange={(event) =>
                updateColumn(target, index, {
                  width: Number(event.target.value) || 1,
                })
              }
            />
          </div>
        ))}
      </div>
    );
  }

  const section =
    selected?.startsWith("section:")
      ? template.sections.find((entry) => `section:${entry.id}` === selected)
      : undefined;

  let body: React.ReactNode;
  if (selected === "header") {
    body = (
      <>
        <Switch
          label="إظهار الترويسة"
          checked={template.header.show !== false}
          onChange={(value) => onChange(setBlockVisible(template, "header", value))}
        />
        <Switch
          label="إظهار الشعار"
          checked={template.header.logo.show}
          onChange={(value) => {
            const next = clone(template);
            next.header.logo.show = value;
            onChange(next);
          }}
        />
        <Switch
          label="خط فاصل بعد الترويسة"
          checked={template.header.separator !== false}
          onChange={(value) => {
            const next = clone(template);
            next.header.separator = value;
            onChange(next);
          }}
        />
        <LineEditorRows
          target="header"
          lines={template.header.lines}
          onPatch={(index, patch) => updateLine("header", index, patch)}
        />
      </>
    );
  } else if (selected === "fields") {
    const spec = DOCUMENT_SPECS[template.document];
    body = (
      <>
        <Switch
          label="إظهار البيانات"
          checked={template.fields.visible !== false}
          onChange={(value) => onChange(setBlockVisible(template, "fields", value))}
        />
        <Switch
          label="خط فاصل بعد البيانات"
          checked={template.fields.separator !== false}
          onChange={(value) => {
            const next = clone(template);
            next.fields.separator = value;
            onChange(next);
          }}
        />
        <div className="space-y-2">
          {spec.fields.map((id) => {
            const index = template.fields.show.indexOf(id);
            const shown = index >= 0;
            return (
              <div key={id} className="flex flex-wrap items-center gap-2">
                <Switch
                  label={template.labels[id] ?? id}
                  checked={shown}
                  onChange={(value) => toggleField(id, value)}
                />
                <button
                  type="button"
                  aria-label={`تحريك الحقل ${id} لأعلى`}
                  className="btn btn-sm"
                  disabled={!shown || index === 0}
                  onClick={() => moveField(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`تحريك الحقل ${id} لأسفل`}
                  className="btn btn-sm"
                  disabled={!shown || index === template.fields.show.length - 1}
                  onClick={() => moveField(index, 1)}
                >
                  ↓
                </button>
                <input
                  aria-label={`عنوان الحقل ${id}`}
                  className="input input-bordered input-lg min-w-40 flex-1"
                  value={template.labels[id] ?? ""}
                  onChange={(event) => updateFieldLabel(id, event.target.value)}
                />
              </div>
            );
          })}
        </div>
      </>
    );
  } else if (selected === "items") {
    body = (
      <>
        <Switch
          label="إظهار الأصناف"
          checked={template.items.show}
          onChange={(value) => onChange(setBlockVisible(template, "items", value))}
        />
        <label className="block space-y-1 text-base font-bold">
          <span>عنوان الجدول</span>
          <input
            aria-label="عنوان الأصناف"
            className="input input-bordered input-lg w-full"
            value={template.items.title ?? ""}
            onChange={(event) => {
              const next = clone(template);
              next.items.title = event.target.value;
              onChange(next, { coalesceKey: "items-title" });
            }}
          />
        </label>
        <Switch
          label="إظهار صف العناوين"
          checked={template.items.header !== false}
          onChange={(value) => {
            const next = clone(template);
            next.items.header = value;
            onChange(next);
          }}
        />
        <Switch
          label="إظهار الملاحظات"
          checked={template.items.showNote !== false}
          onChange={(value) => {
            const next = clone(template);
            next.items.showNote = value;
            onChange(next);
          }}
        />
        <Switch
          label="خط فاصل بعد الأصناف"
          checked={template.items.separator !== false}
          onChange={(value) => {
            const next = clone(template);
            next.items.separator = value;
            onChange(next);
          }}
        />
        {columnEditor(template.items.columns, "items")}
      </>
    );
  } else if (selected === "summary") {
    body = (
      <>
        <Switch
          label="إظهار الإجمالي"
          checked={template.summary.show}
          onChange={(value) => onChange(setBlockVisible(template, "summary", value))}
        />
        <label className="block space-y-1 text-base font-bold">
          <span>عنوان الإجمالي</span>
          <input
            aria-label="عنوان الإجمالي"
            className="input input-bordered input-lg w-full"
            value={template.summary.label}
            onChange={(event) => {
              const next = clone(template);
              next.summary.label = event.target.value;
              onChange(next, { coalesceKey: "summary-label" });
            }}
          />
        </label>
        <Switch
          label="خط فاصل قبل الإجمالي"
          checked={template.summary.separator !== false}
          onChange={(value) => {
            const next = clone(template);
            next.summary.separator = value;
            onChange(next);
          }}
        />
      </>
    );
  } else if (selected === "footer") {
    body = (
      <>
        <Switch
          label="إظهار التذييل"
          checked={template.footer.show !== false}
          onChange={(value) => onChange(setBlockVisible(template, "footer", value))}
        />
        <Switch
          label="خط فاصل قبل التذييل"
          checked={template.footer.separator !== false}
          onChange={(value) => {
            const next = clone(template);
            next.footer.separator = value;
            onChange(next);
          }}
        />
        <LineEditorRows
          target="footer"
          lines={template.footer.lines}
          onPatch={(index, patch) => updateLine("footer", index, patch)}
        />
      </>
    );
  } else if (section && selected) {
    body = (
      <>
        <Switch
          label="إظهار القسم"
          checked={section.show}
          onChange={(value) => onChange(setBlockVisible(template, selected, value))}
        />
        <label className="block space-y-1 text-base font-bold">
          <span>عنوان القسم</span>
          <input
            aria-label="عنوان القسم"
            className="input input-bordered input-lg w-full"
            value={section.title}
            onChange={(event) => {
              const next = clone(template);
              const target = next.sections.find(
                (entry) => entry.id === section.id,
              );
              if (target) target.title = event.target.value;
              onChange(next, { coalesceKey: `section-title-${section.id}` });
            }}
          />
        </label>
        <Switch
          label="خط فاصل قبل القسم"
          checked={section.separator !== false}
          onChange={(value) => {
            const next = clone(template);
            const target = next.sections.find(
              (entry) => entry.id === section.id,
            );
            if (target) target.separator = value;
            onChange(next);
          }}
        />
        {section.columns && section.columns.length > 0
          ? columnEditor(section.columns, section.id)
          : null}
      </>
    );
  } else {
    body = (
      <p className="text-base text-base-content/50">
        اختر حزمة من الورقة لتعديلها.
      </p>
    );
  }

  return (
    <aside className="space-y-3 rounded-2xl border border-base-300 bg-base-100 p-4">
      <h3 className="text-lg font-black">
        {selected ? `خصائص — ${blockLabel(template, selected)}` : "الخصائص"}
      </h3>
      {body}
    </aside>
  );
}
```

- [ ] **Step 4: Run the inspector tests**

Run: `npx vitest run components/admin/report-design/BlockInspector.test.tsx`

Expected: PASS.

- [ ] **Step 5: Report checkpoint**

Report changes and test output. Owner commits.

---

### Task 7: Toolbar and advanced panel

**Files:**
- Create: `components/admin/report-design/EditorToolbar.tsx`
- Create: `components/admin/report-design/AdvancedPanel.tsx`

**Interfaces:**
- Consumes: `ReportDocument`, printer type.
- Produces:
  - `EditorToolbar(props)` with callbacks: `onDocumentChange`, `onSave`, `onUndo`, `onRedo`, `onPrinterChange`, `onTestPrint`, `onSampleModeChange`, `onToggleAdvanced`.
  - `AdvancedPanel(props)` with `onJsonChange`, `onApply`, `onImport`, `onExport`, `onRequestReset`.

- [ ] **Step 1: Create `EditorToolbar.tsx`**

```tsx
"use client";

import type { ReportDocument } from "@/lib/print/templates/types";

const DOCUMENT_LABELS: Record<ReportDocument, string> = {
  receipt: "إيصال الدفع",
  kitchen: "تذكرة المطبخ",
  shift: "تقرير الوردية",
  items: "تذكرة الأصناف",
  sales: "تقرير المبيعات",
};

type EditorToolbarProps = {
  document: ReportDocument;
  documents: ReportDocument[];
  dirty: boolean;
  isDefault: boolean;
  canUndo: boolean;
  canRedo: boolean;
  sampleMode: "sample" | "blank";
  advanced: boolean;
  printerId: number;
  printers: Array<{
    id: number;
    name: string;
    connectionType: "local" | "network";
  }>;
  onDocumentChange: (document: ReportDocument) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPrinterChange: (id: number) => void;
  onTestPrint: () => void;
  onSampleModeChange: (mode: "sample" | "blank") => void;
  onToggleAdvanced: () => void;
};

export function EditorToolbar({
  document,
  documents,
  dirty,
  isDefault,
  canUndo,
  canRedo,
  sampleMode,
  advanced,
  printerId,
  printers,
  onDocumentChange,
  onSave,
  onUndo,
  onRedo,
  onPrinterChange,
  onTestPrint,
  onSampleModeChange,
  onToggleAdvanced,
}: EditorToolbarProps) {
  return (
    <div className="space-y-3">
      <div role="tablist" className="tabs tabs-boxed w-fit">
        {documents.map((doc) => (
          <button
            key={doc}
            type="button"
            role="tab"
            aria-selected={doc === document}
            className={`tab ${doc === document ? "tab-active" : ""}`}
            onClick={() => onDocumentChange(doc)}
          >
            {DOCUMENT_LABELS[doc]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary btn-lg" onClick={onSave}>
          حفظ التصميم
        </button>
        <button
          type="button"
          className="btn btn-lg"
          onClick={onUndo}
          disabled={!canUndo}
        >
          تراجع
        </button>
        <button
          type="button"
          className="btn btn-lg"
          onClick={onRedo}
          disabled={!canRedo}
        >
          إعادة
        </button>
        <div className="join">
          <button
            type="button"
            className={`btn join-item btn-lg ${sampleMode === "sample" ? "btn-active" : ""}`}
            aria-pressed={sampleMode === "sample"}
            onClick={() => onSampleModeChange("sample")}
          >
            بيانات تجريبية
          </button>
          <button
            type="button"
            className={`btn join-item btn-lg ${sampleMode === "blank" ? "btn-active" : ""}`}
            aria-pressed={sampleMode === "blank"}
            onClick={() => onSampleModeChange("blank")}
          >
            بيانات فارغة
          </button>
        </div>
        <button
          type="button"
          className={`btn btn-lg ${advanced ? "btn-active" : ""}`}
          aria-pressed={advanced}
          onClick={onToggleAdvanced}
        >
          متقدم
        </button>
        <div className="join">
          <select
            className="select select-bordered join-item select-lg"
            aria-label="طابعة الاختبار"
            value={printerId}
            onChange={(event) => onPrinterChange(Number(event.target.value))}
          >
            {printers.length === 0 && <option value={0}>لا طابعات</option>}
            {printers.map((printer) => (
              <option key={printer.id} value={printer.id}>
                {printer.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary join-item btn-lg"
            onClick={onTestPrint}
          >
            طباعة تجريبية
          </button>
        </div>
        {dirty && (
          <span className="badge badge-warning badge-lg">تغييرات غير محفوظة</span>
        )}
        {isDefault && (
          <span className="badge badge-ghost badge-lg">التصميم الافتراضي</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `AdvancedPanel.tsx`**

```tsx
"use client";

import { useRef } from "react";

type AdvancedPanelProps = {
  jsonText: string;
  onJsonChange: (value: string) => void;
  onApply: () => void;
  onImport: (file: File | undefined) => void;
  onExport: () => void;
  onRequestReset: () => void;
};

export function AdvancedPanel({
  jsonText,
  onJsonChange,
  onApply,
  onImport,
  onExport,
  onRequestReset,
}: AdvancedPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <section className="space-y-3 rounded-2xl border border-base-300 bg-base-100 p-4">
      <h3 className="text-lg font-black">محرر JSON المتقدم</h3>
      <textarea
        aria-label="محرر JSON"
        className="textarea textarea-bordered min-h-96 w-full font-mono text-xs"
        dir="ltr"
        value={jsonText}
        onChange={(event) => onJsonChange(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-lg" onClick={onApply}>
          تطبيق JSON
        </button>
        <button
          type="button"
          className="btn btn-lg"
          onClick={() => fileInput.current?.click()}
        >
          استيراد .fprep
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".fprep,application/json"
          className="hidden"
          aria-label="استيراد ملف .fprep"
          onChange={(event) => {
            onImport(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button type="button" className="btn btn-lg" onClick={onExport}>
          تصدير .fprep
        </button>
        <button
          type="button"
          className="btn btn-lg btn-error"
          onClick={onRequestReset}
        >
          استعادة الافتراضي
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck the new files**

Run: `npx tsc --noEmit`

Expected: PASS for the new files (unused import warnings are lint-only).

- [ ] **Step 4: Report checkpoint**

Report changes and command output. Owner commits.

---

### Task 8: Rewrite `ReportDesignAdmin` and its tests

**Files:**
- Modify: `components/admin/report-design/ReportDesignAdmin.tsx`
- Modify: `components/admin/report-design/ReportDesignAdmin.test.tsx`
- Delete: `components/admin/report-design/TemplateTree.tsx`
- Delete: `components/admin/report-design/TemplateProperties.tsx`
- Delete: `components/admin/report-design/ReportPreview.tsx`

**Interfaces:**
- Consumes: `useTemplateEditor`, `ReportCanvas`, `BlockInspector`, `EditorToolbar`, `AdvancedPanel`, `blankSample`, `parseReportTemplateJson`, `DEFAULT_REPORT_TEMPLATES`, the three server actions.
- Produces: the page component with the same props as today (`document`, `documents`, `template`, `templateJson`, `isDefault`, `sample`, `printers`).

- [ ] **Step 1: Rewrite the admin tests first**

Replace `components/admin/report-design/ReportDesignAdmin.test.tsx` with:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";
import {
  buildSampleDocuments,
  sampleSettings,
} from "@/lib/print/templates/sample";
import type { ReportTemplate } from "@/lib/print/templates/types";
import { ReportDesignAdmin } from "./ReportDesignAdmin";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const actions = vi.hoisted(() => ({
  saveReportTemplate: vi.fn(async () => ({ ok: true as const })),
  resetReportTemplate: vi.fn(async () => ({ ok: true as const })),
  testPrintReportTemplate: vi.fn(async () => ({
    ok: true as const,
    message: "تم الإرسال",
  })),
}));
vi.mock("@/app/actions/report-templates", () => ({
  saveReportTemplate: actions.saveReportTemplate,
  resetReportTemplate: actions.resetReportTemplate,
  testPrintReportTemplate: actions.testPrintReportTemplate,
}));

const document = "receipt" as const;
const receiptDefault = DEFAULT_REPORT_TEMPLATES[document];
const defaultHeaderText = receiptDefault.header.lines[0]!.text;
const sample = buildSampleDocuments(sampleSettings)[document];

const printers = [
  { id: 4, name: "كاشير", connectionType: "local" as const },
  { id: 5, name: "شبكة", connectionType: "network" as const },
];

function renderAdmin(printerList = printers) {
  render(
    <ReportDesignAdmin
      document={document}
      documents={["receipt", "kitchen", "shift", "items", "sales"]}
      template={DEFAULT_REPORT_TEMPLATES[document]}
      templateJson={JSON.stringify(DEFAULT_REPORT_TEMPLATES[document], null, 2)}
      isDefault
      sample={sample}
      printers={printerList}
    />,
  );
}

function editHeaderLine(text: string) {
  fireEvent.change(screen.getByLabelText("سطر الترويسة 1"), {
    target: { value: text },
  });
}

function savedTemplate(callIndex = 0): ReportTemplate {
  const [, json] = actions.saveReportTemplate.mock.calls[callIndex]!;
  return JSON.parse(json as string) as ReportTemplate;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReportDesignAdmin", () => {
  it("renders the canvas, inspector, and toolbar", () => {
    renderAdmin();
    expect(screen.getAllByRole("group")).toHaveLength(5);
    expect(screen.getByText(/خصائص — الترويسة/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "حفظ التصميم" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "بيانات تجريبية" })).toBeTruthy();
  });

  it("edits a header line and saves the template", async () => {
    renderAdmin();
    editHeaderLine("مرحباً");
    fireEvent.click(screen.getByRole("button", { name: "حفظ التصميم" }));

    expect(actions.saveReportTemplate).toHaveBeenCalledTimes(1);
    expect(actions.saveReportTemplate.mock.calls[0]![0]).toBe("receipt");
    expect(savedTemplate().header.lines[0]!.text).toBe("مرحباً");
    expect(await screen.findByText("تم حفظ التصميم")).toBeTruthy();
  });

  it("undoes and redoes a canvas edit", () => {
    renderAdmin();
    editHeaderLine("مرحباً");
    fireEvent.click(screen.getByRole("button", { name: "تراجع" }));
    expect(screen.getByLabelText("سطر الترويسة 1")).toHaveValue(defaultHeaderText);

    fireEvent.click(screen.getByRole("button", { name: "إعادة" }));
    expect(screen.getByLabelText("سطر الترويسة 1")).toHaveValue("مرحباً");
  });

  it("switches between sample and blank data", () => {
    renderAdmin();
    expect(screen.getByText("كابتشينو")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "بيانات فارغة" }));
    expect(screen.queryByText("كابتشينو")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "بيانات تجريبية" }));
    expect(screen.getByText("كابتشينو")).toBeTruthy();
  });

  it("rejects invalid raw JSON without applying it", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    fireEvent.change(screen.getByLabelText("محرر JSON"), {
      target: { value: "{" },
    });
    fireEvent.click(screen.getByRole("button", { name: "تطبيق JSON" }));

    expect(screen.getByText("ملف التصميم ليس JSON صالحاً")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "حفظ التصميم" }));
    expect(savedTemplate().header.lines[0]!.text).toBe(defaultHeaderText);
  });

  it("imports a .fprep file into the editor", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    const file = new File(
      [
        JSON.stringify({
          ...DEFAULT_REPORT_TEMPLATES.receipt,
          labels: {
            ...DEFAULT_REPORT_TEMPLATES.receipt.labels,
            orderNo: "طلب",
          },
        }),
      ],
      "fastpos-receipt.fprep",
      { type: "application/json" },
    );
    fireEvent.change(screen.getByLabelText("استيراد ملف .fprep"), {
      target: { files: [file] },
    });

    await screen.findByDisplayValue(/"orderNo": "طلب"/);
    expect(screen.getByText("تم استيراد fastpos-receipt.fprep")).toBeTruthy();
    expect(actions.saveReportTemplate).not.toHaveBeenCalled();
  });

  it("refuses to import an invalid .fprep file", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    const file = new File(["{", ""], "broken.fprep", {
      type: "application/json",
    });
    fireEvent.change(screen.getByLabelText("استيراد ملف .fprep"), {
      target: { files: [file] },
    });

    expect(await screen.findByText("ملف التصميم ليس JSON صالحاً")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "حفظ التصميم" }));
    expect(savedTemplate().header.lines[0]!.text).toBe(defaultHeaderText);
  });

  it("confirms before resetting the design and restores the default state", async () => {
    renderAdmin();
    editHeaderLine("مرحباً");
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    fireEvent.click(screen.getByRole("button", { name: "استعادة الافتراضي" }));
    expect(screen.getByText("استعادة التصميم الافتراضي؟")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الاستعادة" }));

    expect(actions.resetReportTemplate).toHaveBeenCalledWith("receipt");
    expect(screen.getByLabelText("سطر الترويسة 1")).toHaveValue(defaultHeaderText);
    expect(receiptDefault.header.lines[0]!.text).toBe(defaultHeaderText);
  });

  it("sends the current design and selected printer to the test print action", async () => {
    renderAdmin();
    editHeaderLine("مرحباً");
    fireEvent.change(screen.getByLabelText("طابعة الاختبار"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "طباعة تجريبية" }));

    expect(actions.testPrintReportTemplate).toHaveBeenCalledTimes(1);
    const [doc, json, printerId] = actions.testPrintReportTemplate.mock.calls[0]!;
    expect(doc).toBe("receipt");
    expect(printerId).toBe(5);
    expect(
      (JSON.parse(json as string) as ReportTemplate).header.lines[0]!.text,
    ).toBe("مرحباً");
    expect(await screen.findByText("تم الإرسال")).toBeTruthy();
  });

  it("refuses to test print without a printer", () => {
    renderAdmin([]);
    fireEvent.click(screen.getByRole("button", { name: "طباعة تجريبية" }));

    expect(screen.getByText("اختر طابعة أولاً")).toBeTruthy();
    expect(actions.testPrintReportTemplate).not.toHaveBeenCalled();
  });

  it("asks before switching documents with unsaved changes", () => {
    renderAdmin();
    editHeaderLine("مرحباً");

    fireEvent.click(screen.getByRole("tab", { name: "تذكرة المطبخ" }));
    expect(screen.getByText("تغييرات غير محفوظة")).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "تبديل" }));
    expect(router.push).toHaveBeenCalledWith(
      "/admin/reports/design?doc=kitchen",
    );
  });
});

describe("ReportDesignAdmin guards", () => {
  it("warns before leaving with unsaved changes", () => {
    renderAdmin();
    editHeaderLine("مرحباً");

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not warn when nothing changed", () => {
    renderAdmin();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run components/admin/report-design/ReportDesignAdmin.test.tsx`

Expected: FAIL — old UI renders `شجرة التصميم`, no canvas groups, no `متقدم`/`تراجع` controls.

- [ ] **Step 3: Rewrite `ReportDesignAdmin.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  resetReportTemplate,
  saveReportTemplate,
  testPrintReportTemplate,
} from "@/app/actions/report-templates";
import {
  blankSample,
  type BlockId,
  type TemplateCommit,
} from "@/lib/print/templates/blocks";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";
import { parseReportTemplateJson } from "@/lib/print/templates/schema";
import type {
  DocumentData,
  ReportDocument,
  ReportTemplate,
} from "@/lib/print/templates/types";
import { AdvancedPanel } from "./AdvancedPanel";
import { BlockInspector } from "./BlockInspector";
import { EditorToolbar } from "./EditorToolbar";
import { ReportCanvas } from "./ReportCanvas";
import { useTemplateEditor } from "./useTemplateEditor";

type ReportDesignAdminProps = {
  document: ReportDocument;
  documents: ReportDocument[];
  template: ReportTemplate;
  templateJson: string;
  isDefault: boolean;
  sample: DocumentData;
  printers: Array<{
    id: number;
    name: string;
    connectionType: "local" | "network";
  }>;
};

export function ReportDesignAdmin(props: ReportDesignAdminProps) {
  const router = useRouter();
  const editor = useTemplateEditor(props.template);
  const [selected, setSelected] = useState<BlockId | null>("header");
  const [sampleMode, setSampleMode] = useState<"sample" | "blank">("sample");
  const [advanced, setAdvanced] = useState(false);
  const [jsonText, setJsonText] = useState(props.templateJson);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingDocument, setPendingDocument] = useState<ReportDocument | null>(
    null,
  );
  const [printerId, setPrinterId] = useState(props.printers[0]?.id ?? 0);

  const template = editor.template;
  const data = sampleMode === "sample" ? props.sample : blankSample(props.sample);

  useEffect(() => {
    if (!editor.dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editor.dirty]);

  const commit: TemplateCommit = (next, options) => {
    editor.commit(next, options);
    setError(null);
    setMessage(null);
  };

  function changeDocument(next: ReportDocument) {
    if (next === props.document) return;
    if (editor.dirty) {
      setPendingDocument(next);
      return;
    }
    router.push(`/admin/reports/design?doc=${next}`);
  }

  function confirmSwitch() {
    const next = pendingDocument;
    setPendingDocument(null);
    if (next) router.push(`/admin/reports/design?doc=${next}`);
  }

  async function save() {
    const snapshot = template;
    let result: Awaited<ReturnType<typeof saveReportTemplate>>;
    try {
      result = await saveReportTemplate(
        props.document,
        JSON.stringify(snapshot),
      );
    } catch {
      setError("تعذر حفظ التصميم، حاول مجدداً");
      setMessage(null);
      return;
    }
    if ("error" in result) {
      setError(result.error);
      setMessage(null);
      return;
    }
    editor.markSaved(snapshot);
    setJsonText(JSON.stringify(snapshot, null, 2));
    setError(null);
    setMessage("تم حفظ التصميم");
    router.refresh();
  }

  async function reset() {
    let result: Awaited<ReturnType<typeof resetReportTemplate>>;
    try {
      result = await resetReportTemplate(props.document);
    } catch {
      setConfirmReset(false);
      setError("تعذر استعادة التصميم، حاول مجدداً");
      setMessage(null);
      return;
    }
    setConfirmReset(false);
    if ("error" in result) {
      setError(result.error);
      setMessage(null);
      return;
    }
    const fallback = structuredClone(DEFAULT_REPORT_TEMPLATES[props.document]);
    editor.replace(fallback);
    editor.markSaved(fallback);
    setJsonText(JSON.stringify(fallback, null, 2));
    setError(null);
    setMessage("تمت استعادة التصميم الافتراضي");
    router.refresh();
  }

  async function testPrint() {
    if (!printerId) {
      setError("اختر طابعة أولاً");
      setMessage(null);
      return;
    }
    let result: Awaited<ReturnType<typeof testPrintReportTemplate>>;
    try {
      result = await testPrintReportTemplate(
        props.document,
        JSON.stringify(template),
        printerId,
      );
    } catch {
      setError("تعذر إرسال الطباعة التجريبية، حاول مجدداً");
      setMessage(null);
      return;
    }
    if ("error" in result) {
      setError(result.error);
      setMessage(null);
      return;
    }
    setError(null);
    setMessage(result.message);
  }

  function applyJson() {
    const result = parseReportTemplateJson(jsonText, props.document);
    if (!result.ok) {
      setError(result.errors.join("\n"));
      setMessage(null);
      return;
    }
    editor.replace(result.template);
    setJsonText(JSON.stringify(result.template, null, 2));
    setError(null);
    setMessage("تم تطبيق التصميم من JSON");
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setError("تعذر قراءة الملف");
      setMessage(null);
      return;
    }
    const result = parseReportTemplateJson(text, props.document);
    if (!result.ok) {
      setError(result.errors.join("\n"));
      setMessage(null);
      return;
    }
    editor.replace(result.template);
    setJsonText(JSON.stringify(result.template, null, 2));
    setError(null);
    setMessage(`تم استيراد ${file.name}`);
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(template, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `fastpos-${props.document}.fprep`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toggleAdvanced() {
    if (!advanced) setJsonText(JSON.stringify(template, null, 2));
    setAdvanced(!advanced);
  }

  return (
    <div className="space-y-5">
      <EditorToolbar
        document={props.document}
        documents={props.documents}
        dirty={editor.dirty}
        isDefault={props.isDefault}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        sampleMode={sampleMode}
        advanced={advanced}
        printerId={printerId}
        printers={props.printers}
        onDocumentChange={changeDocument}
        onSave={save}
        onUndo={editor.undo}
        onRedo={editor.redo}
        onPrinterChange={setPrinterId}
        onTestPrint={testPrint}
        onSampleModeChange={setSampleMode}
        onToggleAdvanced={toggleAdvanced}
      />

      {error && (
        <div className="alert alert-error whitespace-pre-line text-sm">{error}</div>
      )}
      {message && <div className="alert alert-success text-sm">{message}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <ReportCanvas
          template={template}
          data={data}
          selected={selected}
          onSelect={setSelected}
          onCommit={commit}
        />
        <BlockInspector
          template={template}
          selected={selected}
          onChange={commit}
        />
      </div>

      {advanced && (
        <AdvancedPanel
          jsonText={jsonText}
          onJsonChange={setJsonText}
          onApply={applyJson}
          onImport={importFile}
          onExport={exportFile}
          onRequestReset={() => setConfirmReset(true)}
        />
      )}

      {confirmReset && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="text-lg font-bold">استعادة التصميم الافتراضي؟</h3>
            <p className="py-3 text-sm text-base-content/60">
              سيتم حذف التخصيص المحفوظ لهذا التقرير.
            </p>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-lg"
                onClick={() => setConfirmReset(false)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-error btn-lg"
                onClick={reset}
              >
                تأكيد الاستعادة
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDocument && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="text-lg font-bold">تغييرات غير محفوظة</h3>
            <p className="py-3 text-sm text-base-content/60">
              هل تريد تجاهلها والانتقال إلى تقرير آخر؟
            </p>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-lg"
                onClick={() => setPendingDocument(null)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-warning btn-lg"
                onClick={confirmSwitch}
              >
                تبديل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Delete the old designer components**

Delete `components/admin/report-design/TemplateTree.tsx`, `TemplateProperties.tsx`, and `ReportPreview.tsx`. Confirm nothing else imports them:

Run: `rg -n "TemplateTree|TemplateProperties|ReportPreview" components app lib`

Expected: no output.

- [ ] **Step 5: Run the admin tests**

Run: `npx vitest run components/admin/report-design`

Expected: PASS.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx vitest run`

Run: `npx tsc --noEmit`

Expected: all tests pass; typecheck clean.

- [ ] **Step 7: Report checkpoint**

Report changes and output. Owner commits.

---

### Task 9: Full verification, browser check, docs, memory, installer

**Files:**
- Create: `docs/worklog/2026-10-31-report-canvas-editor.md`
- Modify: `README.md`
- Modify: `PROJECT_INDEX.md`
- Modify: `C:\Users\zakaria\.qoder\projects\C--Users-zakaria-fast-pos\memory\report-design-templates.md`
- Modify: `C:\Users\zakaria\.qoder\projects\C--Users-zakaria-fast-pos\memory\MEMORY.md` (only if a new pointer is added)

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: a verified, documented, installable build.

- [ ] **Step 1: Run the complete verification battery**

Run each and capture the output:

```bash
npx vitest run
npx tsc --noEmit
npm run lint
npm run build
```

Expected:
- Vitest: all files/tests pass (record the exact totals for the worklog).
- Typecheck: no output.
- Lint: no **new** errors. The known pre-existing error is `windows-raw.test.ts:353`; warnings in feature files must be zero.
- Build: succeeds. If `clean-next.mjs` throws `ENOTEMPTY` right after a dev server was stopped, rerun `npm run build`.

- [ ] **Step 2: Verify the golden paths in a browser**

Start the dev server:

```bash
npm run dev
```

Open `/admin/reports/design` in the browser and verify:
1. A paper canvas shows the five receipt blocks in printed order with sample data (`REST`, `كابتشينو`, totals).
2. Up/down buttons reorder a block; dragging the grip reorders it; undo (`تراجع`) restores the previous order.
3. Column handles change the item table widths; the saved weights sum to 32.
4. Double-clicking a header/footer line edits it inline; Enter commits; Escape cancels.
5. Eye buttons dim a block; switching to «بيانات فارغة» empties the sample; switching back restores it.
6. «متقدم» opens the JSON panel; invalid JSON is rejected with an Arabic error; import/export/reset still work.
7. Switching document with unsaved changes opens the in-app modal; the browser close warning still appears.

If the admin login blocks automation, stop and ask the owner to log in; do not type credentials. State explicitly in the final report which checks were owner-assisted.

- [ ] **Step 3: Write the worklog**

Create `docs/worklog/2026-10-31-report-canvas-editor.md`:

```markdown
# 2026-10-31 — Report canvas editor

## What changed

- Added an additive `order` field and `header.show`, `fields.visible`,
  `footer.show` flags to the v1 `.fprep` template. No DB migration: stored
  templates without them stay valid and are normalized on the next save.
- Split `DocumentSpec`/`DOCUMENT_SPECS`/`BASE_PLACEHOLDERS` into
  `lib/print/templates/document-specs.ts` so `schema.ts` and `blocks.ts` share
  a one-way dependency graph (`document-specs ← blocks ← schema`).
- Added `lib/print/templates/blocks.ts` with pure helpers: canonical/ordered
  block ids, move, visibility, line additions, column resizing, blank sample.
- Refactored `layout.ts` into per-block renderers (`layoutHeader`,
  `layoutFields`, `layoutItems`, `layoutSection`, `layoutSummary`,
  `layoutFooter`) iterating `order`. Canonical output is unchanged.
- Replaced the tree/properties/preview designer with a 360 px paper canvas:
  draggable block cards (Pointer Events + up/down buttons), inline text
  editing, eye toggles, `+ سطر`, column resize handles, inspector, toolbar
  (save, undo/redo, sample/blank, advanced), and an advanced JSON panel.
- Added `useTemplateEditor`: 50-entry history, 500 ms coalescing for typing
  and resizing, baseline adoption only while clean, Ctrl/Cmd+Z / Shift+Z / Y.
- Document switching now uses an in-app DaisyUI modal instead of native
  `window.confirm`.

## Locked decisions

- Block `order` stores `header | fields | items | section:<id> | summary |
  footer`; a partial list is completed in canonical order on validation.
- `fields.visible` is separate from `fields.show` so hiding never discards the
  owner's field selection.
- Column resize writes stored widths whose extras sum to the paper capacity,
  so `tableWidths` reproduces the requested widths; at the feasible boundary
  the clamp makes a step a no-op rather than corrupting the table.
- The canvas renders each block through the real `layoutTemplate` with a
  single-block preview template, so the canvas and the printer never diverge.
- Blank mode is client-side only (`blankSample`), keeping titles, venue, brand
  strings, and the footer.

## Files

- New: `lib/print/templates/document-specs.ts`, `blocks.ts`, `blocks.test.ts`,
  `components/admin/report-design/{useTemplateEditor.ts,CanvasLines.tsx,
  CanvasBlock.tsx,ReportCanvas.tsx,BlockInspector.tsx,EditorToolbar.tsx,
  AdvancedPanel.tsx}` + tests.
- Rewritten: `ReportDesignAdmin.tsx` + test.
- Deleted: `TemplateTree.tsx`, `TemplateProperties.tsx`, `ReportPreview.tsx`.
- Modified: `types.ts`, `schema.ts`, `defaults.ts`, `layout.ts`, and their
  tests; `README.md`, `PROJECT_INDEX.md`.

## Verification

- `npx vitest run` — … (record exact totals here from the run)
- `npx tsc --noEmit` — clean
- `npm run lint` — no new errors (pre-existing `windows-raw.test.ts:353` only)
- `npm run build` — success
- Browser: golden paths exercised on the dev server (note owner-assisted steps)
- Installer: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -SkipNpm`
  — record the EXE size/time; retry once on `EndUpdateResource failed (110)`.

## Remaining owner checks

- Install the new build and run a real-printer test print for receipt, kitchen,
  shift, items, and sales designs.
- Confirm the installed app still prints the edited template after a restart.
```

Record the exact vitest totals and installer size/time in the `…` line and the
installer paragraph before reporting.

- [ ] **Step 4: Update README**

Replace the "تصميم التقارير" section body (lines 235–241) with:

```markdown
يفتح المدير **تصميم التقارير** من لوحة الإدارة لتخصيص الإيصالات والتقارير الخمسة
(إيصال الدفع، تذكرة المطبخ، تقرير الوردية، تذكرة الأصناف، تقرير المبيعات).

- يعرض المحرر ورقة الحساب الحقيقية كمكوّنات: اسحب أي مكوّن لإعادة ترتيبه، أو استخدم أسهم الأعلى/الأسفل.
- غيّر نص الترويسة والتذييل وعناوين الأقسام مباشرة على الورقة، وعدّل عرض أعمدة الجداول من المقابض بين الأعمدة.
- أيقونة العين تُخفي المكوّن من الطباعة دون حذفه، وزر **+ سطر** يضيف سطراً جديداً.
- **تراجع/إعادة** واختصارات Ctrl+Z / Ctrl+Y متاحة، ويمكن التبديل بين بيانات تجريبية وبيانات فارغة.
- اللوحة **متقدم** تحتوي JSON الكامل واستيراد/تصدير `.fprep` و**استعادة الافتراضي**.
- التصميم يُحفظ في قاعدة البيانات (`report_template.<document>`) ولا يتأثر بتحديث التطبيق.
- **طباعة تجريبية** ترسل معاينة إلى الطابعة المختارة.
```

- [ ] **Step 5: Update PROJECT_INDEX**

Replace the `print/templates/` bullet (line 78) with:

```markdown
- **`print/templates/`**: `types.ts` + `schema.ts` (`.fprep` JSON v1 validation, per-document specs re-exported from `document-specs.ts`, persisted block `order` + visibility flags, order-insensitive `templatesEqual`), `blocks.ts` (pure canvas helpers: block ids/order/move/visibility, line additions, column resize, blank sample), `defaults.ts` (built-in templates; receipt items are `الصنف | الكمية | السعر | الإجمالي`), `columns.ts` (character widths → 384 px), `layout.ts` (per-block renderers following `order`; pure isomorphic), `data.ts`/`sample.ts` (document adapters + preview samples), `build.ts`/`render.ts` (ESC/POS bytes, Arabic raster, logo), `store.ts` (load/persist/reset in `app_settings` under `report_template.<document>` with default fallback).
```

Replace the designer bullet (line 80) with:

```markdown
- **`app/admin/(panel)/reports/design/` + `components/admin/report-design/`**: canvas report designer (paper-shaped block canvas with drag/up-down reorder, inline text editing, column resize, visibility toggles, inspector, undo/redo, sample/blank switch, advanced JSON with import/export `.fprep` and reset, test print).
```

- [ ] **Step 6: Update project memory**

Update `C:\Users\zakaria\.qoder\projects\C--Users-zakaria-fast-pos\memory\report-design-templates.md`:

- Update the description to mention the canvas editor.
- Append a "Canvas editor (2026-10-31)" section recording the locked decisions:
  persisted `order` + visibility flags, `fields.visible` semantics, per-block
  layout renderers, 360 px paper canvas with Pointer Events, history
  coalescing, in-app document-switch modal, exact verification totals, and the
  worklog pointer `docs/worklog/2026-10-31-report-canvas-editor.md`.
- Keep the existing receipt-orientation and round-trip notes.

No new `MEMORY.md` pointer is needed because the existing
`report-design-templates.md` entry covers this feature.

- [ ] **Step 7: Build and compile the installer**

```bash
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -SkipNpm
```

Record the EXE path, size, and timestamp. If `EndUpdateResource failed (110)`
appears, rerun the same PowerShell command once; do not change antivirus
settings or delete the partially written EXE.

- [ ] **Step 8: Hand off the installed-build check**

Report the installer path and ask the owner to install it and run real-printer
test prints for all five documents, plus a restart check. The agent must not
type credentials or approve UAC.

- [ ] **Step 9: Final report checkpoint**

Summarize: what changed, test totals, typecheck/lint/build status, installer
path, browser checks performed (and which were owner-assisted), and the
remaining owner checks. Owner commits.
