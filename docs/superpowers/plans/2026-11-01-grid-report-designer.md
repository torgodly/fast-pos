# Grid Report Designer (v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed-block `.fprep` designer with a v2 grid-element model for all five documents while keeping the existing line-based ESC/POS print pipeline and byte-identical default output.

**Architecture:** Add v2 modules beside the v1 engine (`ReportTemplateV1` stays live until the cutover), migrate v1 templates deterministically, render the grid row-by-row into the existing `LayoutLine[]`, then swap the designer UI, store, schema dispatch, and defaults to v2 in one cutover task. QR is the only new raster primitive; everything else reuses `printLine`, `columns`, `separator`, and `appendLogo`.

**Tech Stack:** Next.js 16.4.3, React 19, TypeScript 5.9, better-sqlite3 settings store, `@napi-rs/canvas`, `pngjs`, `iconv-lite`, Vitest 5 + Testing Library, Tailwind/DaisyUI, `qrcode-generator` (new, MIT).

**Spec:** `docs/superpowers/specs/2026-11-01-grid-report-designer-design.md`

## Global Constraints

- **Never run `git add`, `git commit`, `git push`, `git reset`, `git stash`, or any history-writing command.** The owner reviews and commits after each task. End every task with an owner review/commit checkpoint.
- Tasks 1–9 add v2 modules beside v1 and keep the full suite green. Task 10 is the single cutover and must end with the full suite, `tsc`, `eslint`, and `npm run build` green. Do not merge between tasks.
- Never touch the live DB in tests. Mock `@/lib/settings` exactly as `lib/print/templates/store.test.ts` does, or use in-memory sample data.
- UI strings are Arabic; validation errors are Arabic. Keep the existing Arabic copy where a screen already has it.
- Print output stays line-based. The only raster blocks are the existing logo and the new QR; never rasterize a whole ticket.
- Migrated v1 defaults must render byte-identically in v2 (same logo options, same sample data).
- `qrcode-generator` is the only new runtime dependency; do not add UI/design-system packages.
- All commands run from the repo root in Git Bash. Use `npx vitest run <path>` for targeted tests.

---

## File Structure

**New v2 core (lib/print/templates/)**
- `elements.ts` — v2 element constants, id helpers, row helpers, logo lookup.
- `schema-common.ts` — validator helpers shared by v1/v2 (`readString`, `readColumns`, placeholder checks).
- `schema-v2.ts` — strict v2 validator.
- `migrate.ts` — deterministic v1 → v2 migration.
- `defaults-v1.ts` — frozen copy of today's v1 defaults (migration/parity oracle).
- `defaults-v2.ts` — the five default designs expressed as v2 elements.
- `layout-core.ts` — `textLine`, `expandPlaceholders`, `wrapWords`, `tableWidths`, `columnCells` shared by both layouts.
- `layout-v1.ts` — current layout code, renamed exports, used as the parity oracle.
- `layout-v2.ts` — grid row-flow renderer.
- `qr-payload.ts` — receipt QR payload builder (client-safe).
- `qr.ts` — QR module matrix → PNG → ESC/POS raster, bounded cache (server-only).
- `element-ops.ts` — pure add/move/delete/update operations for the editor.

**New editor components (`components/admin/report-design/`)**
- `GridCanvas.tsx`, `ElementCard.tsx`, `ElementPalette.tsx`, `ElementInspector.tsx`, `QrBox.tsx`.

**Modified**
- `lib/print/templates/types.ts`, `schema.ts`, `layout.ts`, `render.ts`, `logo.ts`, `store.ts`, `build.ts`, `document-specs.ts`, `defaults.ts`.
- `app/actions/report-templates.ts` (version-neutral JSON passthrough; verify messages).
- `components/admin/report-design/ReportDesignAdmin.tsx`, `EditorToolbar.tsx` (only if props change).
- `package.json`, `tsconfig` ambient types under `types/`.
- `README.md`, `PROJECT_INDEX.md`, `docs/worklog/`.

**Deleted at cutover (Task 10)**
- `blocks.ts`, `blocks.test.ts`, `CanvasBlock.tsx`, `CanvasLines.tsx`, `ReportCanvas.tsx`, `BlockInspector.tsx`, and their component tests. `layout.test.ts` is renamed to `layout-v1.test.ts` (same assertions, v1 imports); `defaults.test.ts` is rewritten for v2. `data.test.ts` stays and must pass unchanged against v2 defaults.

---

### Task 1: v2 types and element helpers

**Files:**
- Modify: `lib/print/templates/types.ts`
- Create: `lib/print/templates/elements.ts`
- Test: `lib/print/templates/elements.test.ts`

**Interfaces:**
- Consumes: existing `ReportDocument`, `Align`, `TextSize`, `TemplateColumn`.
- Produces: `ReportTemplateV1` (old shape), temporary `ReportTemplate = ReportTemplateV1`, `ReportTemplateV2`, `TemplateElement` and per-type element types, `ElementType`, and `elements.ts` constants/helpers used by every later task.

- [ ] **Step 1: Write the failing test**

```ts
// lib/print/templates/elements.test.ts
import { describe, expect, it } from "vitest";
import {
  ELEMENT_ID_PATTERN,
  MAX_ELEMENTS,
  MAX_QR_SIZE,
  DEFAULT_QR_SIZE,
  elementsByRow,
  logoElement,
  maxElementRow,
  newElementId,
  slugElementId,
  sortElements,
} from "./elements";
import type { ReportTemplateV2, TemplateElement } from "./types";

function element(
  patch: Pick<TemplateElement, "id" | "type"> & Record<string, unknown>,
): TemplateElement {
  return {
    row: 0,
    col: 0,
    width: 32,
    visible: true,
    ...patch,
  } as TemplateElement;
}

function template(elements: TemplateElement[]): ReportTemplateV2 {
  return {
    format: "fastpos-report",
    version: 2,
    document: "receipt",
    paper: { columns: 32 },
    elements,
    labels: {},
  };
}

describe("elements", () => {
  it("generates ids that match the schema pattern", () => {
    const id = newElementId();
    expect(id).toMatch(ELEMENT_ID_PATTERN);
    expect(newElementId()).not.toBe(id);
  });

  it("slugifies field and section ids deterministically", () => {
    expect(slugElementId("field", "orderNo")).toBe("el_field_orderno");
    expect(slugElementId("section", "itemsList")).toBe("el_section_itemslist");
  });

  it("sorts by row then col", () => {
    const sorted = sortElements([
      element({ id: "b", type: "text", row: 2, col: 0 }),
      element({ id: "a", type: "text", row: 1, col: 5 }),
      element({ id: "c", type: "text", row: 1, col: 2 }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["c", "a", "b"]);
  });

  it("groups rows, reports the last row, and caps values exist", () => {
    const groups = elementsByRow([
      element({ id: "a", type: "text", row: 1 }),
      element({ id: "b", type: "text", row: 1, col: 10, width: 5 }),
      element({ id: "c", type: "text", row: 4 }),
    ]);
    expect(groups.get(1)?.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(maxElementRow([])).toBe(-1);
    expect(maxElementRow([...groups.values()].flat())).toBe(4);
    expect(MAX_ELEMENTS).toBe(64);
    expect(DEFAULT_QR_SIZE).toBe(192);
    expect(MAX_QR_SIZE).toBe(384);
  });

  it("finds the logo element", () => {
    expect(
      logoElement(
        template([
          element({ id: "el_logo", type: "logo", align: "center", maxWidth: 256 }),
        ]),
      ),
    ).toMatchObject({ id: "el_logo", maxWidth: 256 });
    expect(logoElement(template([]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/print/templates/elements.test.ts`
Expected: FAIL — cannot resolve `./elements`.

- [ ] **Step 3: Implement the types and helpers**

In `lib/print/templates/types.ts`, rename the existing `export type ReportTemplate = {` block to `export type ReportTemplateV1 = {` and immediately after that block add:

```ts
// Temporary alias while v1 is still the live public type. Task 10 flips it
// to ReportTemplateV2.
export type ReportTemplate = ReportTemplateV1;
```

Then append:

```ts
export const ELEMENT_TYPES = [
  "text",
  "field",
  "logo",
  "qr",
  "separator",
  "itemTable",
  "section",
  "summary",
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];

export type ElementBase = {
  id: string;
  type: ElementType;
  row: number;
  col: number;
  width: number;
  visible: boolean;
};

export type TextElement = ElementBase & {
  type: "text";
  text: string;
  align?: Align;
  bold?: boolean;
  size?: TextSize;
  hideWhenEmpty?: boolean;
};

export type FieldElement = ElementBase & {
  type: "field";
  fieldId: string;
  align?: Align;
  bold?: boolean;
  size?: TextSize;
  hideWhenEmpty?: boolean;
};

export type LogoElement = ElementBase & {
  type: "logo";
  align?: Align;
  maxWidth?: number;
};

export type QrElement = ElementBase & {
  type: "qr";
  sizePx: number;
};

export type SeparatorElement = ElementBase & {
  type: "separator";
  hideWhenEmptyOf?: string[];
};

export type ItemTableElement = ElementBase & {
  type: "itemTable";
  title?: string;
  showHeader?: boolean;
  showNotes?: boolean;
  columns: TemplateColumn[];
};

export type SectionElement = ElementBase & {
  type: "section";
  sectionId: string;
  title?: string;
  columns?: TemplateColumn[];
};

export type SummaryElement = ElementBase & {
  type: "summary";
  label: string;
};

export type TemplateElement =
  | TextElement
  | FieldElement
  | LogoElement
  | QrElement
  | SeparatorElement
  | ItemTableElement
  | SectionElement
  | SummaryElement;

export type ReportTemplateV2 = {
  format: "fastpos-report";
  version: 2;
  document: ReportDocument;
  paper: { columns: 32 | 48 };
  elements: TemplateElement[];
  labels: Record<string, string>;
};
```

`LayoutLine` stays untouched in this task; the QR line kind is added in Task 5.

Create `lib/print/templates/elements.ts`:

```ts
import type {
  ElementType,
  LogoElement,
  ReportTemplateV2,
  TemplateElement,
} from "./types";
import { ELEMENT_TYPES } from "./types";

export const MAX_ELEMENTS = 64;
export const MAX_ROWS = 60;
export const MAX_TABLE_COLUMNS = 6;
export const MAX_ELEMENT_TEXT = 200;
export const MIN_LOGO_WIDTH = 64;
export const MAX_LOGO_WIDTH = 384;
export const DEFAULT_LOGO_WIDTH = 256;
export const MIN_QR_SIZE = 96;
export const MAX_QR_SIZE = 384;
export const DEFAULT_QR_SIZE = 192;
export const DEFAULT_QR_WIDTH = 8;
export const MAX_SEPARATOR_REFS = 12;
export const ELEMENT_ID_PATTERN = /^el_[a-z0-9_]{1,40}$/;

export function isElementType(value: unknown): value is ElementType {
  return typeof value === "string" && (ELEMENT_TYPES as readonly string[]).includes(value);
}

export function newElementId(): string {
  return `el_${Math.random().toString(36).slice(2, 10)}`;
}

export function slugElementId(kind: string, value: string): string {
  return `el_${kind}_${value.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

export function sortElements(elements: TemplateElement[]): TemplateElement[] {
  return [...elements].sort(
    (a, b) => a.row - b.row || a.col - b.col || a.id.localeCompare(b.id),
  );
}

export function elementsByRow(
  elements: TemplateElement[],
): Map<number, TemplateElement[]> {
  const rows = new Map<number, TemplateElement[]>();
  for (const element of sortElements(elements)) {
    const list = rows.get(element.row);
    if (list) list.push(element);
    else rows.set(element.row, [element]);
  }
  return rows;
}

export function maxElementRow(elements: TemplateElement[]): number {
  return elements.reduce((max, element) => Math.max(max, element.row), -1);
}

export function logoElement(template: ReportTemplateV2): LogoElement | null {
  return (
    template.elements.find(
      (element): element is LogoElement => element.type === "logo",
    ) ?? null
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/print/templates/elements.test.ts`
Expected: PASS.

- [ ] **Step 5: Owner review/commit checkpoint**

Show the diff to the owner. Do not commit.

---

### Task 2: Shared validator helpers and strict v2 validator

**Files:**
- Create: `lib/print/templates/schema-common.ts`
- Create: `lib/print/templates/schema-v2.ts`
- Modify: `lib/print/templates/schema.ts` (import helpers instead of defining them)
- Modify: `lib/print/templates/document-specs.ts` (add `qr: boolean`)
- Test: `lib/print/templates/schema-v2.test.ts`

**Interfaces:**
- Consumes: `elements.ts`, `types.ts`, `document-specs.ts`.
- Produces: `validateReportTemplateV2(value, expectedDoc?): ValidationResultV2`; `schema-common.ts` helpers `isPlainObject`, `clean`, `checkKeys`, `readString`, `readBool`, `readAlign`, `readSize`, `readColumns`, `checkPlaceholders(text, spec, path, errors, { fieldTokens })`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/print/templates/schema-v2.test.ts
import { describe, expect, it } from "vitest";
import { validateReportTemplateV2 } from "./schema-v2";
import type { ReportTemplateV2 } from "./types";

function validReceipt(): ReportTemplateV2 {
  return {
    format: "fastpos-report",
    version: 2,
    document: "receipt",
    paper: { columns: 32 },
    labels: {
      orderNo: "رقم الطلب",
      waiter: "السفرادجي",
    },
    elements: [
      { id: "el_title", type: "text", row: 0, col: 0, width: 32, visible: true, text: "{{title}}", align: "center", bold: true, size: "xlarge" },
      { id: "el_logo", type: "logo", row: 1, col: 0, width: 32, visible: true, align: "center", maxWidth: 256 },
      { id: "el_field_orderno", type: "field", row: 2, col: 0, width: 32, visible: true, fieldId: "orderNo" },
      { id: "el_sep", type: "separator", row: 3, col: 0, width: 32, visible: true, hideWhenEmptyOf: ["el_field_orderno"] },
      { id: "el_items", type: "itemTable", row: 4, col: 0, width: 32, visible: true, showHeader: true, showNotes: true, columns: [
        { key: "name", label: "الصنف", width: 11 },
        { key: "qty", label: "الكمية", width: 4, align: "center" },
        { key: "unitPrice", label: "السعر", width: 7, align: "center" },
        { key: "lineTotal", label: "الإجمالي", width: 8, align: "center" },
      ] },
      { id: "el_summary", type: "summary", row: 5, col: 0, width: 32, visible: true, label: "الإجمالي" },
      { id: "el_qr", type: "qr", row: 6, col: 12, width: 8, visible: true, sizePx: 192 },
      { id: "el_waiter_row", type: "text", row: 7, col: 0, width: 14, visible: true, text: "السفرادجي: {{field.waiter}}" },
      { id: "el_time_row", type: "field", row: 7, col: 16, width: 16, visible: true, fieldId: "waiter" },
    ],
  };
}

function errorsOf(value: unknown): string[] {
  const result = validateReportTemplateV2(value, "receipt");
  return result.ok ? [] : result.errors;
}

describe("validateReportTemplateV2", () => {
  it("accepts the valid grid receipt", () => {
    expect(validateReportTemplateV2(validReceipt(), "receipt").ok).toBe(true);
  });

  it("rejects unknown root keys and overlapping elements", () => {
    expect(errorsOf({ ...validReceipt(), extra: 1 }).length).toBeGreaterThan(0);

    const overlap = validReceipt();
    overlap.elements.push({ id: "el_overlap", type: "text", row: 2, col: 20, width: 12, visible: true, text: "x" });
    expect(errorsOf(overlap)).toContain("elements: تداخل في الصف 2");
  });

  it("rejects a block sharing a row with another element", () => {
    const value = validReceipt();
    value.elements.push({ id: "el_beside", type: "text", row: 4, col: 0, width: 4, visible: true, text: "x" });
    expect(errorsOf(value)).toContain("elements: عناصر البيانات والفاصل والصور يجب أن تكون وحدها في الصف 4");
  });

  it("rejects QR outside receipts and unknown field ids", () => {
    const kitchen: ReportTemplateV2 = {
      ...validReceipt(),
      document: "kitchen",
      elements: [
        { id: "el_qr", type: "qr", row: 0, col: 0, width: 8, visible: true, sizePx: 192 },
      ],
      labels: {},
    };
    expect(validateReportTemplateV2(kitchen, "kitchen").ok).toBe(false);

    const value = validReceipt();
    value.elements[2] = { ...value.elements[2]!, fieldId: "unknown" } as never;
    expect(errorsOf(value).some((error) => error.includes("fieldId"))).toBe(true);
  });

  it("rejects bad field tokens and dangling separator references", () => {
    const value = validReceipt();
    value.elements[0] = { ...value.elements[0]!, text: "{{field.nope}}" } as never;
    expect(errorsOf(value).some((error) => error.includes("field.nope"))).toBe(true);

    const dangling = validReceipt();
    dangling.elements[3] = { ...dangling.elements[3]!, hideWhenEmptyOf: ["el_missing"] } as never;
    expect(errorsOf(dangling)).toContain("elements[3].hideWhenEmptyOf: el_missing غير معروف");
  });

  it("enforces duplicate limits, separators full width, and labels", () => {
    const duplicate = validReceipt();
    duplicate.elements.push({ id: "el_logo2", type: "logo", row: 8, col: 0, width: 32, visible: true });
    expect(errorsOf(duplicate).some((error) => error.includes("logo"))).toBe(true);

    const separator = validReceipt();
    separator.elements[3] = { ...separator.elements[3]!, width: 20 } as never;
    expect(errorsOf(separator).some((error) => error.includes("separator"))).toBe(true);

    const labels = validReceipt();
    labels.labels = { orderNo: "رقم الطلب" };
    expect(errorsOf(labels).some((error) => error.includes("waiter"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/print/templates/schema-v2.test.ts`
Expected: FAIL — cannot resolve `./schema-v2`.

- [ ] **Step 3: Extract shared helpers**

Create `schema-common.ts` with the helpers currently defined in `schema.ts`: `isPlainObject`, `clean`, `checkKeys`, `readString`, `readBool`, `readAlign`, `readSize`, `readColumns`, `ALIGNS`, `SIZES`, `MAX_TEXT`, `MAX_COLUMNS`, `CONTROL_CHARS`. Move them verbatim and add `export` to each. Extend `checkPlaceholders`:

```ts
export function checkPlaceholders(
  text: string,
  spec: DocumentSpec,
  path: string,
  errors: string[],
  options: { fieldTokens?: boolean } = {},
) {
  for (const match of text.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)) {
    const token = match[1]!;
    if (token.startsWith("field.")) {
      const fieldId = token.slice("field.".length);
      if (!options.fieldTokens) {
        errors.push(`${path}: {{${token}}} غير مدعوم في هذا التقرير`);
      } else if (!spec.fields.includes(fieldId)) {
        errors.push(`${path}: {{${token}}} غير معروف في هذا التقرير`);
      }
      continue;
    }
    if (!spec.placeholders.includes(token)) {
      errors.push(`${path}: {{${token}}} غير مدعوم في هذا التقرير`);
    }
  }
  const leftovers = text.replace(/\{\{\s*[^}\s]+\s*\}\}/g, "");
  if (/[{}]/.test(leftovers)) errors.push(`${path}: أقواس غير صالحة`);
}
```

Update `schema.ts` imports to use these from `schema-common.ts`. Behavior must not change; existing `schema.test.ts` passes.

Add `qr: boolean` to `DocumentSpec` and set it `true` only for `receipt`, `false` for the other four documents.

- [ ] **Step 4: Implement the v2 validator**

Create `schema-v2.ts`:

```ts
import { DOCUMENT_SPECS } from "./document-specs";
import type { DocumentSpec } from "./document-specs";
import {
  DEFAULT_LOGO_WIDTH,
  DEFAULT_QR_SIZE,
  ELEMENT_ID_PATTERN,
  MAX_ELEMENTS,
  MAX_LOGO_WIDTH,
  MAX_QR_SIZE,
  MAX_ROWS,
  MAX_SEPARATOR_REFS,
  MIN_LOGO_WIDTH,
  MIN_QR_SIZE,
  isElementType,
} from "./elements";
import {
  checkKeys,
  checkPlaceholders,
  isPlainObject,
  readAlign,
  readBool,
  readColumns,
  readSize,
  readString,
} from "./schema-common";
import type {
  ReportDocument,
  ReportTemplateV2,
  TemplateElement,
} from "./types";

export type ValidationResultV2 =
  | { ok: true; template: ReportTemplateV2 }
  | { ok: false; errors: string[] };

const MAX_TITLE = 200;
const MAX_LABEL = 200;

type Context = {
  errors: string[];
  spec: DocumentSpec;
  paper: number;
};

function elementKeys(type: string): string[] {
  const common = ["id", "type", "row", "col", "width", "visible"];
  if (type === "text") return [...common, "text", "align", "bold", "size", "hideWhenEmpty"];
  if (type === "field") return [...common, "fieldId", "align", "bold", "size", "hideWhenEmpty"];
  if (type === "logo") return [...common, "align", "maxWidth"];
  if (type === "qr") return [...common, "sizePx"];
  if (type === "separator") return [...common, "hideWhenEmptyOf"];
  if (type === "itemTable") return [...common, "title", "showHeader", "showNotes", "columns"];
  if (type === "section") return [...common, "sectionId", "title", "columns"];
  return [...common, "label"];
}

function readInt(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  min: number,
  max: number,
): number {
  const raw = value[key];
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max) {
    errors.push(`${path}.${key} غير صالح`);
    return min;
  }
  return raw;
}

function readElement(
  entry: unknown,
  index: number,
  ctx: Context,
): TemplateElement | null {
  const errors = ctx.errors;
  const at = `elements[${index}]`;
  if (!isPlainObject(entry)) {
    errors.push(`${at} غير صالح`);
    return null;
  }
  const type = entry.type;
  if (!isElementType(type)) {
    errors.push(`${at}.type غير معروف`);
    return null;
  }
  checkKeys(entry, elementKeys(type), at, errors);
  const id = readString(entry, "id", `${at}.id`, errors);
  if (id && !ELEMENT_ID_PATTERN.test(id)) errors.push(`${at}.id غير صالح`);
  const row = readInt(entry, "row", at, errors, 0, MAX_ROWS - 1);
  const col = readInt(entry, "col", at, errors, 0, ctx.paper - 1);
  const width = readInt(entry, "width", at, errors, 1, ctx.paper);
  if (col + width > ctx.paper) errors.push(`${at}: col + width يتجاوز العرض`);
  const visible = entry.visible === undefined
    ? true
    : readBool(entry, "visible", `${at}.visible`, errors, true);
  const base = { id, row, col, width, visible };

  if (type === "text") {
    const text = readString(entry, "text", `${at}.text`, errors, { required: false });
    checkPlaceholders(text, ctx.spec, `${at}.text`, errors, { fieldTokens: true });
    const element: TemplateElement = { ...base, type, text };
    const align = readAlign(entry, "align", `${at}.align`, errors);
    const size = readSize(entry, "size", `${at}.size`, errors);
    if (align) element.align = align;
    if (size) element.size = size;
    if (entry.bold !== undefined) element.bold = readBool(entry, "bold", `${at}.bold`, errors, false);
    if (entry.hideWhenEmpty !== undefined) element.hideWhenEmpty = readBool(entry, "hideWhenEmpty", `${at}.hideWhenEmpty`, errors, true);
    return element;
  }

  if (type === "field") {
    const fieldId = readString(entry, "fieldId", `${at}.fieldId`, errors);
    if (fieldId && !ctx.spec.fields.includes(fieldId)) errors.push(`${at}.fieldId غير معروف`);
    const element: TemplateElement = { ...base, type, fieldId };
    const align = readAlign(entry, "align", `${at}.align`, errors);
    const size = readSize(entry, "size", `${at}.size`, errors);
    if (align) element.align = align;
    if (size) element.size = size;
    if (entry.bold !== undefined) element.bold = readBool(entry, "bold", `${at}.bold`, errors, false);
    if (entry.hideWhenEmpty !== undefined) element.hideWhenEmpty = readBool(entry, "hideWhenEmpty", `${at}.hideWhenEmpty`, errors, true);
    return element;
  }

  if (type === "logo") {
    const element: TemplateElement = { ...base, type };
    const align = readAlign(entry, "align", `${at}.align`, errors);
    if (align) element.align = align;
    if (entry.maxWidth !== undefined) {
      const maxWidth = readInt(entry, "maxWidth", at, errors, MIN_LOGO_WIDTH, MAX_LOGO_WIDTH);
      element.maxWidth = maxWidth;
    } else {
      element.maxWidth = DEFAULT_LOGO_WIDTH;
    }
    return element;
  }

  if (type === "qr") {
    if (!ctx.spec.qr) errors.push(`${at}: QR غير مسموح لهذا التقرير`);
    const element: TemplateElement = { ...base, type, sizePx: DEFAULT_QR_SIZE };
    if (entry.sizePx !== undefined) {
      element.sizePx = readInt(entry, "sizePx", at, errors, MIN_QR_SIZE, MAX_QR_SIZE);
    }
    return element;
  }

  if (type === "separator") {
    if (col !== 0 || width !== ctx.paper) errors.push(`${at}: separator يجب أن يمتد على كامل العرض`);
    const element: TemplateElement = { ...base, type };
    if (entry.hideWhenEmptyOf !== undefined) {
      if (!Array.isArray(entry.hideWhenEmptyOf)) {
        errors.push(`${at}.hideWhenEmptyOf يجب أن يكون قائمة`);
      } else {
        if (entry.hideWhenEmptyOf.length > MAX_SEPARATOR_REFS) errors.push(`${at}.hideWhenEmptyOf يتجاوز ${MAX_SEPARATOR_REFS}`);
        element.hideWhenEmptyOf = entry.hideWhenEmptyOf.filter((ref): ref is string => {
          if (typeof ref !== "string") {
            errors.push(`${at}.hideWhenEmptyOf يحتوي قيمة غير صالحة`);
            return false;
          }
          return true;
        });
      }
    }
    return element;
  }

  if (type === "itemTable") {
    if (ctx.spec.itemColumns.length === 0) errors.push(`${at}: جدول الأصناف غير مسموح لهذا التقرير`);
    const title = readString(entry, "title", `${at}.title`, errors, { required: false, max: MAX_TITLE });
    const showHeader = entry.showHeader === undefined ? true : readBool(entry, "showHeader", `${at}.showHeader`, errors, true);
    const showNotes = entry.showNotes === undefined ? true : readBool(entry, "showNotes", `${at}.showNotes`, errors, true);
    const columns = readColumns(entry.columns, `${at}.columns`, ctx.spec.itemColumns, errors);
    if (columns.length === 0) errors.push(`${at}.columns مطلوب`);
    return { ...base, type, title, showHeader, showNotes, columns };
  }

  if (type === "section") {
    const sectionId = readString(entry, "sectionId", `${at}.sectionId`, errors);
    const sectionSpec = Object.hasOwn(ctx.spec.sections, sectionId) ? ctx.spec.sections[sectionId] : undefined;
    if (!sectionSpec) errors.push(`${at}.sectionId غير معروف لهذا التقرير`);
    const title = readString(entry, "title", `${at}.title`, errors, { required: false, max: MAX_TITLE });
    const element: TemplateElement = { ...base, type, sectionId, title };
    if (sectionSpec?.kind === "kv") {
      if (entry.columns !== undefined) errors.push(`${at}.columns غير مسموح لقسم نصي`);
    } else if (sectionSpec) {
      const columns = readColumns(entry.columns, `${at}.columns`, sectionSpec.columnKeys, errors);
      if (columns.length === 0) errors.push(`${at}.columns مطلوب`);
      element.columns = columns;
    }
    return element;
  }

  const label = readString(entry, "label", `${at}.label`, errors, { required: false, max: MAX_LABEL });
  if (!ctx.spec.summaryAllowed) errors.push(`${at}: summary غير مسموح لهذا التقرير`);
  return { ...base, type: "summary", label };
}

function validateLayout(elements: TemplateElement[], ctx: Context) {
  const rows = new Map<number, TemplateElement[]>();
  for (const element of elements) {
    const list = rows.get(element.row) ?? [];
    list.push(element);
    rows.set(element.row, list);
  }
  for (const [row, list] of rows) {
    const sorted = [...list].sort((a, b) => a.col - b.col);
    let end = 0;
    for (const element of sorted) {
      if (element.col < end) {
        ctx.errors.push(`elements: تداخل في الصف ${row}`);
        break;
      }
      end = element.col + element.width;
    }
    if (
      sorted.length > 1 &&
      sorted.some((element) => element.type !== "text" && element.type !== "field")
    ) {
      ctx.errors.push(`elements: عناصر البيانات والفاصل والصور يجب أن تكون وحدها في الصف ${row}`);
    }
  }

  const count = (type: string) => elements.filter((element) => element.type === type).length;
  for (const type of ["logo", "qr", "itemTable", "summary"] as const) {
    if (count(type) > 1) ctx.errors.push(`elements: ${type} مكرر`);
  }
  const seen = new Set<string>();
  for (const element of elements) {
    if (element.type === "section") {
      if (seen.has(`section:${element.sectionId}`)) ctx.errors.push(`elements: القسم ${element.sectionId} مكرر`);
      seen.add(`section:${element.sectionId}`);
    }
    if (element.type === "field") {
      if (seen.has(`field:${element.fieldId}`)) ctx.errors.push(`elements: الحقل ${element.fieldId} مكرر`);
      seen.add(`field:${element.fieldId}`);
    }
    if (element.type === "separator" && element.hideWhenEmptyOf) {
      const refs = new Set<string>();
      for (const ref of element.hideWhenEmptyOf) {
        if (refs.has(ref)) ctx.errors.push(`elements: ${element.id}.hideWhenEmptyOf مكرر`);
        refs.add(ref);
        const target = elements.find((candidate) => candidate.id === ref);
        if (!target) ctx.errors.push(`elements: ${element.id}.hideWhenEmptyOf: ${ref} غير معروف`);
        else if (target.type === "separator") ctx.errors.push(`elements: ${element.id}.hideWhenEmptyOf يشير إلى فاصل`);
      }
    }
  }
}

function validateLabels(
  labels: unknown,
  elements: TemplateElement[],
  ctx: Context,
): Record<string, string> {
  const errors = ctx.errors;
  if (!isPlainObject(labels)) {
    errors.push("labels يجب أن يكون كائناً");
    return {};
  }
  const allowed = new Set<string>([
    ...ctx.spec.fields,
    ...Object.values(ctx.spec.sections).flatMap((section) => section.rowIds),
  ]);
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(labels)) {
    if (!allowed.has(key)) {
      errors.push(`labels.${key} غير معروف`);
      continue;
    }
    if (typeof raw !== "string") {
      errors.push(`labels.${key} يجب أن يكون نصاً`);
      continue;
    }
    const text = raw.trim();
    if (text.length > MAX_LABEL) errors.push(`labels.${key} أطول من ${MAX_LABEL} حرفاً`);
    out[key] = text;
  }
  for (const element of elements) {
    if (element.type === "field" && !out[element.fieldId]) {
      errors.push(`labels.${element.fieldId} مطلوب`);
    }
    if (element.type === "section" && element.visible) {
      const sectionSpec = ctx.spec.sections[element.sectionId];
      if (sectionSpec?.kind === "kv" || sectionSpec?.kind === "groupedTable") {
        for (const rowId of sectionSpec.rowIds) {
          if (!out[rowId]) errors.push(`labels.${rowId} مطلوب`);
        }
      }
    }
  }
  return out;
}

export function validateReportTemplateV2(
  value: unknown,
  expectedDoc?: ReportDocument,
): ValidationResultV2 {
  const errors: string[] = [];
  if (!isPlainObject(value)) return { ok: false, errors: ["ملف التصميم يجب أن يكون كائناً JSON"] };
  checkKeys(value, ["format", "version", "document", "paper", "elements", "labels"], "root", errors);
  if (value.format !== "fastpos-report") errors.push("format غير صالح");
  if (value.version !== 2) errors.push("version غير مدعوم");
  if (typeof value.document !== "string" || !(value.document in DOCUMENT_SPECS)) {
    return { ok: false, errors: [...errors, "document غير معروف"] };
  }
  const doc = value.document as ReportDocument;
  if (expectedDoc && doc !== expectedDoc) errors.push(`document يجب أن يكون ${expectedDoc}`);
  if (!isPlainObject(value.paper)) {
    return { ok: false, errors: [...errors, "paper مطلوب"] };
  }
  checkKeys(value.paper, ["columns"], "paper", errors);
  const paper = value.paper.columns;
  if (paper !== 32 && paper !== 48) errors.push("paper.columns يجب أن يكون 32 أو 48");
  if (!Array.isArray(value.elements)) errors.push("elements يجب أن يكون قائمة");
  const elements: TemplateElement[] = [];
  if (Array.isArray(value.elements)) {
    if (value.elements.length > MAX_ELEMENTS) errors.push(`elements يتجاوز ${MAX_ELEMENTS} عنصراً`);
    const ctx: Context = { errors, spec: DOCUMENT_SPECS[doc], paper: paper === 48 ? 48 : 32 };
    value.elements.slice(0, MAX_ELEMENTS).forEach((entry, index) => {
      const element = readElement(entry, index, ctx);
      if (element) elements.push(element);
    });
  }
  if (paper === 32 || paper === 48) {
    validateLayout(elements, { errors, spec: DOCUMENT_SPECS[doc], paper });
  }
  const ids = new Set<string>();
  for (const element of elements) {
    if (ids.has(element.id)) errors.push(`elements: id مكرر (${element.id})`);
    ids.add(element.id);
  }
  const labels = validateLabels(value.labels, elements, {
    errors,
    spec: DOCUMENT_SPECS[doc],
    paper: paper === 48 ? 48 : 32,
  });
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    template: {
      format: "fastpos-report",
      version: 2,
      document: doc,
      paper: { columns: paper as 32 | 48 },
      elements,
      labels,
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/print/templates/schema-v2.test.ts lib/print/templates/schema.test.ts`
Expected: PASS for both (the v1 suite must stay green).

- [ ] **Step 6: Owner review/commit checkpoint**

Show the diff. Do not commit.

---

### Task 3: Extract shared layout core and freeze the v1 layout

**Files:**
- Create: `lib/print/templates/layout-core.ts`
- Create: `lib/print/templates/layout-v1.ts` (from today's `layout.ts`)
- Modify: `lib/print/templates/layout.ts` (re-export v1 as the live API)
- Test: existing `layout.test.ts`, `blocks.test.ts`, `data.test.ts` unchanged

**Interfaces:**
- Consumes: `TemplateColumn`, `DocumentData`, `LayoutLine`, `ReportTemplateV1`.
- Produces: `layoutTemplateV1(template, data)`; core helpers `textLine`, `columnsLine` type, `columnCells`, `expandPlaceholders`, `wrapWords`, `tableWidths`. `layout.ts` keeps exporting `layoutTemplate`, `expandPlaceholders`, `wrapWords`, `tableWidths` so current consumers compile.

- [ ] **Step 1: Confirm the current tests pass as the baseline**

Run: `npx vitest run lib/print/templates`
Expected: PASS (record the count in the task notes).

- [ ] **Step 2: Create `layout-core.ts`**

Move these from `layout.ts` verbatim and export them: `textLine`, `columnCells`, `expandPlaceholders`, `wrapWords`, `tableWidths`, plus the `TextOptions` type. Extend only `expandPlaceholders` with field tokens:

```ts
export function expandPlaceholders(text: string, data: DocumentData): string {
  const withGlobals = text
    .replace(/\{\{\s*title\s*\}\}/g, data.title)
    .replace(/\{\{\s*subtitle\s*\}\}/g, data.subtitle)
    .replace(/\{\{\s*venue\s*\}\}/g, data.venue)
    .replace(/\{\{\s*brand\.phone\s*\}\}/g, data.brandPhone)
    .replace(/\{\{\s*brand\.address\s*\}\}/g, data.brandAddress)
    .replace(/\{\{\s*footer\s*\}\}/g, data.footer)
    .replace(/\{\{\s*status\s*\}\}/g, data.status);
  return withGlobals
    .replace(/\{\{\s*field\.([A-Za-z][A-Za-z0-9]*)\s*\}\}/g, (_, fieldId: string) =>
      data.fields[fieldId]?.trim() ?? "",
    )
    .trim();
}
```

Import `templateLine`/`textLine` into v1 and v2 layout from this module.

- [ ] **Step 3: Create `layout-v1.ts`**

Copy the remainder of today's `layout.ts` (per-block renderers and `layoutTemplate`) into `layout-v1.ts`. Rename exported functions with a `V1` suffix: `layoutHeaderV1`, `layoutFieldsV1`, `layoutItemsV1`, `layoutSectionV1`, `layoutSummaryV1`, `layoutFooterV1`, `layoutTemplateV1`. Import the moved helpers from `layout-core.ts` and type the template as `ReportTemplateV1`. No logic changes.

- [ ] **Step 4: Replace `layout.ts` with re-exports**

```ts
export { layoutTemplateV1 as layoutTemplate } from "./layout-v1";
export {
  expandPlaceholders,
  tableWidths,
  wrapWords,
} from "./layout-core";
```

- [ ] **Step 5: Run the template tests**

Run: `npx vitest run lib/print/templates`
Expected: PASS with the same count as Step 1. `blocks.test.ts` still imports `tableWidths` from `./layout`.

- [ ] **Step 6: Owner review/commit checkpoint**

Show the diff. Do not commit.

---

### Task 4: Deterministic v1 → v2 migration

**Files:**
- Create: `lib/print/templates/defaults-v1.ts` (today's `defaults.ts`, frozen)
- Modify: `lib/print/templates/defaults.ts` (temporary re-export of the v1 defaults)
- Create: `lib/print/templates/migrate.ts`
- Test: `lib/print/templates/migrate.test.ts`

**Interfaces:**
- Consumes: `ReportTemplateV1`, `orderedBlockIds`, `DOCUMENT_SPECS`, `slugElementId`.
- Produces: `migrateReportTemplate(v1: ReportTemplateV1): ReportTemplateV2` and `DEFAULT_REPORT_TEMPLATES_V1`.

- [ ] **Step 1: Freeze the v1 defaults**

Copy `defaults.ts` to `defaults-v1.ts`, rename its type imports to `ReportTemplateV1`, every `const x: ReportTemplate` to `const x: ReportTemplateV1`, and the final export to `DEFAULT_REPORT_TEMPLATES_V1`. Replace `defaults.ts` with:

```ts
import type { ReportDocument, ReportTemplateV1 } from "./types";
import { DEFAULT_REPORT_TEMPLATES_V1 } from "./defaults-v1";

export const DEFAULT_REPORT_TEMPLATES: Record<ReportDocument, ReportTemplateV1> =
  DEFAULT_REPORT_TEMPLATES_V1;
```

Run: `npx vitest run lib/print/templates/schema.test.ts lib/print/templates/store.test.ts`
Expected: PASS (temporary alias keeps the app on v1).

- [ ] **Step 2: Write the failing migration test**

```ts
// lib/print/templates/migrate.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES_V1 } from "./defaults-v1";
import { migrateReportTemplate } from "./migrate";
import { validateReportTemplateV2 } from "./schema-v2";
import type { ReportTemplateV1, TemplateElement } from "./types";

function byId(elements: TemplateElement[], id: string) {
  return elements.find((element) => element.id === id);
}

describe("migrateReportTemplate", () => {
  it("migrates the receipt in print order with deterministic ids", () => {
    const migrated = migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.receipt);
    expect(validateReportTemplateV2(migrated, "receipt").ok).toBe(true);
    expect(migrated.elements.map((element) => element.id)).toEqual([
      "el_logo",
      "el_header_0",
      "el_header_1",
      "el_header_2",
      "el_header_3",
      "el_sep_header",
      "el_field_orderno",
      "el_field_invoiceid",
      "el_field_table",
      "el_field_waiter",
      "el_field_customer",
      "el_field_phone",
      "el_field_cashier",
      "el_field_payment",
      "el_field_time",
      "el_sep_fields",
      "el_items",
      "el_sep_items",
      "el_sep_summary",
      "el_summary",
      "el_footer_0",
    ]);
    expect(migrated.elements.map((element) => element.row)).toEqual(
      Array.from({ length: migrated.elements.length }, (_, index) => index),
    );
    expect(byId(migrated.elements, "el_sep_header")).toMatchObject({
      type: "separator",
      hideWhenEmptyOf: ["el_logo", "el_header_0", "el_header_1", "el_header_2", "el_header_3"],
    });
    expect(byId(migrated.elements, "el_sep_summary")).toMatchObject({
      hideWhenEmptyOf: ["el_summary"],
    });
    expect(byId(migrated.elements, "el_field_waiter")).toMatchObject({
      type: "field",
      fieldId: "waiter",
      visible: true,
    });
  });

  it("keeps hidden blocks as invisible elements and hides their separators", () => {
    const v1: ReportTemplateV1 = JSON.parse(
      JSON.stringify(DEFAULT_REPORT_TEMPLATES_V1.shift),
    ) as ReportTemplateV1;
    v1.header.show = false;
    v1.fields.visible = false;
    v1.sections = v1.sections.map((section) => ({ ...section, show: false }));
    v1.footer.show = false;
    const migrated = migrateReportTemplate(v1);
    expect(validateReportTemplateV2(migrated, "shift").ok).toBe(true);
    for (const element of migrated.elements) {
      if (
        element.id.startsWith("el_header") ||
        element.id.startsWith("el_field_") ||
        element.id.startsWith("el_section_") ||
        element.id.startsWith("el_sep_") ||
        element.id.startsWith("el_footer")
      ) {
        if (element.id === "el_field_") continue;
        expect(element.visible).toBe(false);
      }
    }
  });

  it("creates no item table or item separator for documents without item columns", () => {
    const migrated = migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.sales);
    expect(migrated.elements.some((element) => element.type === "itemTable")).toBe(false);
    expect(byId(migrated.elements, "el_sep_items")).toBeUndefined();
    expect(validateReportTemplateV2(migrated, "sales").ok).toBe(true);
  });

  it("places section separators before their section and summary separators before the summary", () => {
    const migrated = migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.shift);
    const ids = migrated.elements.map((element) => element.id);
    expect(ids.indexOf("el_sep_collection")).toBe(ids.indexOf("el_section_collection") - 1);
    expect(ids.indexOf("el_sep_summary")).toBe(ids.indexOf("el_summary") - 1);
    expect(ids.indexOf("el_sep_footer")).toBe(ids.indexOf("el_footer_0") - 1);
  });
});
```

Run: `npx vitest run lib/print/templates/migrate.test.ts`
Expected: FAIL — cannot resolve `./migrate`.

- [ ] **Step 3: Implement the migration**

```ts
// lib/print/templates/migrate.ts
import { orderedBlockIds } from "./blocks";
import { DOCUMENT_SPECS } from "./document-specs";
import { slugElementId } from "./elements";
import type {
  ReportTemplateV1,
  ReportTemplateV2,
  SeparatorElement,
  TemplateElement,
} from "./types";

export function migrateReportTemplate(v1: ReportTemplateV1): ReportTemplateV2 {
  const paper = v1.paper.columns;
  const spec = DOCUMENT_SPECS[v1.document];
  const elements: TemplateElement[] = [];
  let row = 0;
  const at = () => row++;

  const separator = (
    id: string,
    visible: boolean,
    references: string[],
  ): SeparatorElement => ({
    id,
    type: "separator",
    row: at(),
    col: 0,
    width: paper,
    visible,
    hideWhenEmptyOf: references,
  });

  const migrateHeader = () => {
    const visible = v1.header.show !== false;
    const refs: string[] = [];
    if (v1.header.logo.show) {
      elements.push({
        id: "el_logo",
        type: "logo",
        row: at(),
        col: 0,
        width: paper,
        visible,
        align: v1.header.logo.align,
        maxWidth: v1.header.logo.maxWidth,
      });
      refs.push("el_logo");
    }
    v1.header.lines.forEach((line, index) => {
      const id = `el_header_${index}`;
      elements.push({
        id,
        type: "text",
        row: at(),
        col: 0,
        width: paper,
        visible,
        text: line.text,
        align: line.align,
        bold: line.bold,
        size: line.size,
      });
      refs.push(id);
    });
    if (v1.header.separator !== false && refs.length > 0) {
      elements.push(separator("el_sep_header", visible, refs));
    }
  };

  const migrateFields = () => {
    const visible = v1.fields.visible !== false;
    const refs = v1.fields.show.map((fieldId) => {
      const id = slugElementId("field", fieldId);
      elements.push({
        id,
        type: "field",
        row: at(),
        col: 0,
        width: paper,
        visible,
        fieldId,
      });
      return id;
    });
    if (v1.fields.separator !== false && refs.length > 0) {
      elements.push(separator("el_sep_fields", visible, refs));
    }
  };

  const migrateItems = () => {
    if (spec.itemColumns.length === 0 || v1.items.columns.length === 0) return;
    elements.push({
      id: "el_items",
      type: "itemTable",
      row: at(),
      col: 0,
      width: paper,
      visible: v1.items.show,
      title: v1.items.title ?? "",
      showHeader: v1.items.header !== false,
      showNotes: v1.items.showNote !== false,
      columns: v1.items.columns,
    });
    if (v1.items.separator !== false) {
      elements.push(separator("el_sep_items", v1.items.show, ["el_items"]));
    }
  };

  const migrateSection = (index: number) => {
    const section = v1.sections[index]!;
    const sectionSpec = spec.sections[section.id];
    const id = slugElementId("section", section.id);
    if (section.separator !== false) {
      elements.push(separator(slugElementId("sep", section.id), section.show, [id]));
    }
    elements.push({
      id,
      type: "section",
      row: at(),
      col: 0,
      width: paper,
      visible: section.show,
      sectionId: section.id,
      title: section.title,
      ...(sectionSpec && sectionSpec.kind !== "kv" ? { columns: section.columns ?? [] } : {}),
    });
  };

  const migrateSummary = () => {
    // The v2 schema rejects a summary element for documents that do not allow
    // one, even when it is invisible, so the block is dropped entirely.
    if (!spec.summaryAllowed) return;
    if (v1.summary.separator !== false) {
      elements.push(separator("el_sep_summary", v1.summary.show, ["el_summary"]));
    }
    elements.push({
      id: "el_summary",
      type: "summary",
      row: at(),
      col: 0,
      width: paper,
      visible: v1.summary.show,
      label: v1.summary.label,
    });
  };

  const migrateFooter = () => {
    if (v1.footer.lines.length === 0) return;
    const visible = v1.footer.show !== false;
    // v1 prints the footer separator before the lines, so reserve its row
    // first and push the elements in row order.
    const separatorRow = v1.footer.separator !== false ? at() : null;
    const texts = v1.footer.lines.map((line, index) => {
      const id = `el_footer_${index}`;
      return {
        element: {
          id,
          type: "text" as const,
          row: at(),
          col: 0,
          width: paper,
          visible,
          text: line.text,
          align: line.align,
          bold: line.bold,
          size: line.size,
        },
        id,
      };
    });
    const refs = texts.map((entry) => entry.id);
    if (separatorRow !== null) {
      elements.push({
        id: "el_sep_footer",
        type: "separator",
        row: separatorRow,
        col: 0,
        width: paper,
        visible,
        hideWhenEmptyOf: refs,
      });
    }
    for (const entry of texts) elements.push(entry.element);
  };

  for (const blockId of orderedBlockIds(v1)) {
    if (blockId === "header") migrateHeader();
    else if (blockId === "fields") migrateFields();
    else if (blockId === "items") migrateItems();
    else if (blockId === "summary") migrateSummary();
    else if (blockId === "footer") migrateFooter();
    else {
      const index = v1.sections.findIndex((section) => `section:${section.id}` === blockId);
      if (index >= 0) migrateSection(index);
    }
  }

  return {
    format: "fastpos-report",
    version: 2,
    document: v1.document,
    paper: { columns: paper },
    elements,
    labels: { ...v1.labels },
  };
}
```

Note: the footer separator gets row `at()` after the footer texts; the splice keeps text rows above the separator in the array, but the row numbers still put the separator after the texts. Rows are what the renderer orders by, not array order. To keep rows correct, assign the separator's row *before* the text rows. Fix by reserving the separator row first:

```ts
const migrateFooter = () => {
  if (v1.footer.lines.length === 0) return;
  const visible = v1.footer.show !== false;
  const separatorRow = v1.footer.separator !== false ? at() : null;
  const refs = v1.footer.lines.map(... at() ...);
  if (separatorRow !== null) {
    elements.push({ id: "el_sep_footer", type: "separator", row: separatorRow, col: 0, width: paper, visible, hideWhenEmptyOf: refs });
  }
};
```

The plan code must use this corrected version; tests assert `el_sep_footer` index before `el_footer_0` in the array, but ordering by row is what matters. Element array order from `sortElements` will place separator row before. The test uses array order; with the corrected version, separator pushed after but row lower; `ids.indexOf` would fail. Make migration insert the separator at the position after previous elements but with the lower row; tests should sort by row. Simpler: compute rows first for footer texts (separatorRow + indices) then push separator then texts (array order = row order). Use:

```ts
const separatorRow = v1.footer.separator !== false ? at() : null;
const texts = v1.footer.lines.map((line, index) => ({ row: at(), ... }));
if (separatorRow !== null) elements.push(separator with row separatorRow);
elements.push(...texts);
```
But `separator()` helper calls at() itself. Construct manually or add a `separatorAt(row,...)` helper. Plan implementation: add optional row param:
```ts
const separatorAt = (rowIndex, id, visible, refs) => ({...});
```
Use `at()` for separator row, then map texts, then push separator + texts in order. Good.

Similarly section separator before section is naturally pushed before. Good.

- [ ] **Step 4: Run the migration test**

Run: `npx vitest run lib/print/templates/migrate.test.ts lib/print/templates/schema-v2.test.ts`
Expected: PASS.

- [ ] **Step 5: Owner review/commit checkpoint**

Show the diff. Do not commit.

---

### Task 5: QR payload, QR raster, and image offsets

**Files:**
- Modify: `lib/print/templates/types.ts` (`LayoutLine` logo/qr)
- Create: `lib/print/templates/qr-payload.ts`
- Create: `lib/print/templates/qr.ts`
- Create: `types/qrcode-generator.d.ts`
- Modify: `lib/print/templates/logo.ts` (`shiftRaster`)
- Modify: `lib/print/templates/render.ts`
- Modify: `package.json` (`qrcode-generator`)
- Test: `lib/print/templates/qr.test.ts`, add cases to `lib/print/templates/render.test.ts`

**Interfaces:**
- Consumes: `DocumentData`, `pngToEscPosRaster`.
- Produces: `receiptQrPayload(data): string | null`, `qrRaster(payload, sizePx): Uint8Array`, `qrCacheSize()`, `clearQrCache()`, `shiftRaster(raster, offsetPx, paperPx?)`, and `LayoutLine` kinds `logo` with optional `offsetPx` plus `qr`.

- [ ] **Step 1: Install the dependency and declare its types**

Run: `npm install qrcode-generator`
Create `types/qrcode-generator.d.ts`:

```ts
declare module "qrcode-generator" {
  type QrErrorCorrection = "L" | "M" | "Q" | "H";
  interface QrCode {
    addData(data: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
  }
  function qrcode(typeNumber: number, errorCorrectionLevel: QrErrorCorrection): QrCode;
  export = qrcode;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/print/templates/qr.test.ts
import { describe, expect, it } from "vitest";
import { receiptQrPayload } from "./qr-payload";
import { qrCacheSize, qrPng, qrRaster, clearQrCache } from "./qr";
import { shiftRaster } from "./logo";
import { buildSampleDocuments, sampleSettings } from "./sample";

const data = buildSampleDocuments(sampleSettings).receipt;

describe("receiptQrPayload", () => {
  it("builds the invoice payload from existing fields", () => {
    expect(receiptQrPayload(data)).toBe("INV-148|38.00 د.ل|2026-10-31 14:05");
  });

  it("returns null when the invoice, total, or time is missing", () => {
    expect(receiptQrPayload({ ...data, summary: null })).toBeNull();
    expect(receiptQrPayload({ ...data, fields: { ...data.fields, time: null } })).toBeNull();
    expect(receiptQrPayload({ ...data, fields: { ...data.fields, invoiceId: "—" } })).toBeNull();
  });
});

describe("qrRaster", () => {
  it("renders a square PNG and a GS v 0 raster", () => {
    const png = qrPng("hello", 192);
    expect(png.width).toBe(png.height);
    expect(png.width).toBeLessThanOrEqual(192);
    const raster = qrRaster("hello", 192);
    expect([...raster.slice(0, 4)]).toEqual([0x1d, 0x76, 0x30, 0x00]);
    expect(raster[4]! | (raster[5]! << 8)).toBe(48);
  });

  it("caches bounded by 64 entries", () => {
    clearQrCache();
    for (let index = 0; index < 70; index += 1) qrRaster(`payload-${index}`, 96);
    expect(qrCacheSize()).toBe(64);
  });
});

describe("shiftRaster", () => {
  it("shifts a 1-byte row right by a non-byte offset", () => {
    const raster = new Uint8Array([0x1d, 0x76, 0x30, 0x00, 1, 0, 1, 0, 0x80]);
    const shifted = shiftRaster(raster, 4);
    expect(shifted[4]! | (shifted[5]! << 8)).toBe(48);
    expect(shifted[8]).toBe(0x08);
  });
});
```

Add to `render.test.ts`:

```ts
it("renders a QR line as a raster at the requested position", () => {
  const bytes = renderLayout([
    { kind: "qr", payload: "INV-1|2.00|now", sizePx: 96, offsetPx: 30, columns: 32 },
  ]);
  expect(contains(bytes, [0x1d, 0x76, 0x30, 0x00])).toBe(true);
  expect(contains(bytes, [0x1d, 0x76, 0x30, 0x00, 0x30, 0x00])).toBe(true);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/print/templates/qr.test.ts lib/print/templates/render.test.ts`
Expected: FAIL — cannot resolve `./qr` / unknown `kind: "qr"`.

- [ ] **Step 4: Implement**

Create `qr-payload.ts`:

```ts
import type { DocumentData } from "./types";

export function receiptQrPayload(data: DocumentData): string | null {
  const invoice = data.fields.invoiceId?.trim() ?? "";
  const total = data.summary?.trim() ?? "";
  const time = data.fields.time?.trim() ?? "";
  if (!invoice || invoice === "—" || !total || !time) return null;
  return `INV-${invoice.replace(/^#/, "")}|${total}|${time}`;
}
```

Create `qr.ts`:

```ts
import qrcode from "qrcode-generator";
import { PNG } from "pngjs";
import { pngToEscPosRaster } from "../logo";

const QUIET_MODULES = 4;
const CACHE_LIMIT = 64;
const cache = new Map<string, Uint8Array>();

export function qrPng(payload: string, sizePx: number): PNG {
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();
  const count = qr.getModuleCount();
  const modules = count + QUIET_MODULES * 2;
  const scale = Math.max(1, Math.floor(sizePx / modules));
  const width = modules * scale;
  const png = new PNG({ width, height: width });
  png.data.fill(255);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const moduleX = Math.floor(x / scale) - QUIET_MODULES;
      const moduleY = Math.floor(y / scale) - QUIET_MODULES;
      if (moduleX < 0 || moduleY < 0 || moduleX >= count || moduleY >= count) continue;
      if (!qr.isDark(moduleY, moduleX)) continue;
      const index = (width * y + x) << 2;
      png.data[index] = 0;
      png.data[index + 1] = 0;
      png.data[index + 2] = 0;
    }
  }
  return png;
}

export function qrRaster(payload: string, sizePx: number): Uint8Array {
  const key = `${payload}|${sizePx}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const bytes = pngToEscPosRaster(qrPng(payload, sizePx), 384);
  cache.set(key, bytes);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return bytes;
}

export function qrCacheSize(): number {
  return cache.size;
}

export function clearQrCache(): void {
  cache.clear();
}
```

In `types.ts`, replace the existing `logo` variant of `LayoutLine` and add `qr`:

```ts
| { kind: "logo"; align: Align; maxWidth: number; offsetPx?: number }
| { kind: "qr"; payload: string; sizePx: number; offsetPx: number; columns: 32 | 48 }
```

Add `shiftRaster` to `logo.ts` (after `appendLogo`):

```ts
export function shiftRaster(
  raster: Uint8Array,
  offsetPx: number,
  paperPx = 384,
): Uint8Array {
  if (offsetPx <= 0) return raster;
  const bytesPerRow = raster[4]! | (raster[5]! << 8);
  const height = raster[6]! | (raster[7]! << 8);
  const rowBytes = Math.ceil(paperPx / 8);
  const out = new Uint8Array(8 + rowBytes * height);
  out[0] = 0x1d;
  out[1] = 0x76;
  out[2] = 0x30;
  out[3] = 0x00;
  out[4] = rowBytes & 0xff;
  out[5] = (rowBytes >> 8) & 0xff;
  out[6] = height & 0xff;
  out[7] = (height >> 8) & 0xff;
  const byteShift = offsetPx >> 3;
  const bitShift = offsetPx & 7;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < bytesPerRow; x += 1) {
      const value = raster[8 + y * bytesPerRow + x]!;
      if (value === 0) continue;
      const base = 8 + y * rowBytes + byteShift + x;
      if (base >= 8 + (y + 1) * rowBytes) continue;
      if (bitShift === 0) {
        out[base] = out[base]! | value;
      } else {
        out[base] = out[base]! | (value >> bitShift);
        const next = base + 1;
        if (next < 8 + (y + 1) * rowBytes) {
          out[next] = out[next]! | ((value << (8 - bitShift)) & 0xff);
        }
      }
    }
  }
  return out;
}
```

Update `render.ts` loop:

```ts
if (line.kind === "logo") {
  const logo = options.logo ?? null;
  const raster = logo && line.offsetPx ? shiftRaster(logo, line.offsetPx) : logo;
  appendLogo(parts, raster, line.offsetPx ? "left" : line.align);
  continue;
}
if (line.kind === "qr") {
  const raster = shiftRaster(qrRaster(line.payload, line.sizePx), line.offsetPx);
  appendLogo(parts, raster, "left");
  continue;
}
```

Import `qrRaster` from `./qr` and `shiftRaster` from `../logo`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run lib/print/templates/qr.test.ts lib/print/templates/render.test.ts lib/print/templates/layout.test.ts`
Expected: PASS. The v1 layout suite must stay green.

- [ ] **Step 6: Owner review/commit checkpoint**

Show the diff. Do not commit.

---

### Task 6: v2 grid layout

**Files:**
- Create: `lib/print/templates/layout-v2.ts`
- Test: `lib/print/templates/layout-v2.test.ts`

**Interfaces:**
- Consumes: `elementsByRow`, `maxElementRow`, `sortElements`, `layout-core` helpers, `receiptQrPayload`, `DOCUMENT_SPECS`, `DEFAULT_REPORT_TEMPLATES_V1`, `migrateReportTemplate`.
- Produces: `layoutTemplateV2(template: ReportTemplateV2, data: DocumentData): LayoutLine[]`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/print/templates/layout-v2.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES_V1 } from "./defaults-v1";
import { layoutTemplateV2 } from "./layout-v2";
import { migrateReportTemplate } from "./migrate";
import { buildSampleDocuments, sampleSettings } from "./sample";
import type { LayoutLine, ReportTemplateV2, TemplateElement } from "./types";

const samples = buildSampleDocuments(sampleSettings);
const receipt = migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.receipt);
const kitchen = migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.kitchen);

function base(elements: TemplateElement[]): ReportTemplateV2 {
  return {
    format: "fastpos-report",
    version: 2,
    document: "receipt",
    paper: { columns: 32 },
    elements,
    labels: { orderNo: "رقم الطلب", waiter: "السفرادجي" },
  };
}

function text(value: string): string[] {
  return value
    .filter((line): line is Extract<LayoutLine, { kind: "text" }> => line.kind === "text")
    .map((line) => line.text);
}

describe("layoutTemplateV2", () => {
  it("renders the migrated receipt with the same block order", () => {
    const values = text(layoutTemplateV2(receipt, samples.receipt));
    expect(values[0]).toBe("REST");
    expect(values).toContain("الصنف");
    expect(values.some((line) => line.startsWith("الإجمالي:"))).toBe(true);
  });

  it("composes two text elements side by side and collapses hidden ones", () => {
    const template = base([
      { id: "el_a", type: "text", row: 0, col: 0, width: 14, visible: true, text: "A" },
      { id: "el_b", type: "text", row: 0, col: 16, width: 16, visible: true, text: "B" },
      { id: "el_hidden", type: "text", row: 1, col: 0, width: 32, visible: false, text: "H" },
      { id: "el_c", type: "text", row: 3, col: 0, width: 32, visible: true, text: "C" },
    ]);
    const lines = layoutTemplateV2(template, samples.receipt);
    expect(lines[0]).toMatchObject({
      kind: "columns",
      widths: [14, 2, 16],
    });
    expect(lines[1]).toMatchObject({ kind: "text", text: "" });
    expect(lines[2]).toMatchObject({ kind: "text", text: "C" });
  });

  it("expands data blocks and pushes later rows down", () => {
    const template = base([
      { id: "el_items", type: "itemTable", row: 0, col: 0, width: 32, visible: true, columns: [
        { key: "name", label: "الصنف", width: 20 },
        { key: "qty", label: "الكمية", width: 6 },
      ] },
      { id: "el_after", type: "text", row: 1, col: 0, width: 32, visible: true, text: "AFTER" },
    ]);
    const lines = layoutTemplateV2(template, samples.receipt);
    const afterIndex = lines.findIndex((line) => line.kind === "text" && line.text === "AFTER");
    expect(afterIndex).toBeGreaterThan(5);
  });

  it("hides a separator when every referenced element is empty", () => {
    const template = base([
      { id: "el_missing", type: "field", row: 0, col: 0, width: 32, visible: true, fieldId: "waiter" },
      { id: "el_sep", type: "separator", row: 1, col: 0, width: 32, visible: true, hideWhenEmptyOf: ["el_missing"] },
      { id: "el_after", type: "text", row: 2, col: 0, width: 32, visible: true, text: "AFTER" },
    ]);
    const lines = layoutTemplateV2(template, { ...samples.receipt, fields: { ...samples.receipt.fields, waiter: null } });
    expect(lines.some((line) => line.kind === "separator")).toBe(false);
    expect(lines.some((line) => line.kind === "text" && line.text === "AFTER")).toBe(true);
  });

  it("renders an offset text element inside a columns line", () => {
    const template = base([
      { id: "el_a", type: "text", row: 0, col: 4, width: 12, visible: true, text: "A", align: "center" },
    ]);
    const lines = layoutTemplateV2(template, samples.receipt);
    expect(lines[0]).toMatchObject({ kind: "columns", widths: [4, 12, 16] });
  });

  it("renders the receipt QR only when the payload exists", () => {
    const withQr: ReportTemplateV2 = {
      ...receipt,
      elements: [
        ...receipt.elements,
        { id: "el_qr", type: "qr", row: 40, col: 12, width: 8, visible: true, sizePx: 192 },
      ],
    };
    expect(layoutTemplateV2(withQr, samples.receipt).some((line) => line.kind === "qr")).toBe(true);
    expect(
      layoutTemplateV2(withQr, { ...samples.receipt, summary: null }).some((line) => line.kind === "qr"),
    ).toBe(false);
  });

  it("keeps the kitchen waiter row when it is added later", () => {
    const withoutWaiter = {
      ...kitchen,
      elements: kitchen.elements.filter((element) => element.id !== "el_field_waiter"),
    };
    const withWaiter = {
      ...withoutWaiter,
      elements: [
        ...withoutWaiter.elements,
        { id: "el_waiter_line", type: "text", row: 20, col: 0, width: 32, visible: true, text: "السفرادجي: {{field.waiter}}" },
      ] as TemplateElement[],
    };
    expect(text(layoutTemplateV2(withWaiter, samples.kitchen)).some((line) => line === "السفرادجي: أحمد")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/print/templates/layout-v2.test.ts`
Expected: FAIL — cannot resolve `./layout-v2`.

- [ ] **Step 3: Implement `layout-v2.ts`**

```ts
import { elementsByRow, maxElementRow, sortElements } from "./elements";
import {
  columnCells,
  expandPlaceholders,
  tableWidths,
  textLine,
  wrapWords,
} from "./layout-core";
import { receiptQrPayload } from "./qr-payload";
import type {
  DocumentData,
  LayoutLine,
  ReportTemplateV2,
  TemplateElement,
} from "./types";

const BLANK: LayoutLine = {
  kind: "text",
  text: "",
  align: "right",
  bold: false,
  size: "normal",
};

function renderText(
  element: Extract<TemplateElement, { type: "text" }>,
  data: DocumentData,
): LayoutLine[] {
  const value = expandPlaceholders(element.text, data);
  if (!value && element.hideWhenEmpty !== false) return [];
  return [
    textLine(value, {
      align: element.align,
      bold: element.bold,
      size: element.size,
    }),
  ];
}

function renderField(
  element: Extract<TemplateElement, { type: "field" }>,
  template: ReportTemplateV2,
  data: DocumentData,
): LayoutLine[] {
  const value = data.fields[element.fieldId]?.trim() ?? "";
  if (!value && element.hideWhenEmpty !== false) return [];
  const label = template.labels[element.fieldId] ?? element.fieldId;
  return [
    textLine(value ? `${label}: ${value}` : `${label}:`, {
      align: element.align,
      bold: element.bold,
      size: element.size,
    }),
  ];
}

function renderItems(
  element: Extract<TemplateElement, { type: "itemTable" }>,
  data: DocumentData,
): LayoutLine[] {
  if (data.items.length === 0 || element.columns.length === 0) return [];
  const out: LayoutLine[] = [];
  const title = (element.title ?? "").trim();
  if (title) out.push(textLine(expandPlaceholders(title, data), { bold: true }));
  const widths = tableWidths(element.columns, element.width);
  if (element.showHeader !== false) {
    out.push({
      ...columnCells(
        element.columns,
        Object.fromEntries(element.columns.map((column) => [column.key, column.label])),
        true,
      ),
      widths,
    });
  }
  const nameIndex = element.columns.findIndex((column) => column.key === "name");
  data.items.forEach((item, index) => {
    out.push({ ...columnCells(element.columns, item), widths });
    if (nameIndex >= 0) {
      const column = element.columns[nameIndex]!;
      const limit = Math.max(4, widths[nameIndex]! - 1);
      for (const continuation of wrapWords(item.name ?? "", limit).slice(1)) {
        out.push(
          textLine(continuation, {
            align: column.align,
            bold: column.bold,
            size: column.size,
          }),
        );
      }
    }
    const note = data.itemNotes[index]?.trim();
    if (element.showNotes !== false && note) {
      out.push(textLine(`• ${note}`, { size: "small" }));
    }
  });
  return out;
}

function renderSection(
  element: Extract<TemplateElement, { type: "section" }>,
  template: ReportTemplateV2,
  data: DocumentData,
): LayoutLine[] {
  const sectionData = Object.hasOwn(data.sections, element.sectionId)
    ? data.sections[element.sectionId]
    : undefined;
  if (!sectionData) return [];
  const out: LayoutLine[] = [];
  const title = (element.title ?? "").trim();
  if (title) out.push(textLine(title, { bold: true }));
  if (sectionData.kind === "kv") {
    for (const row of sectionData.rows) {
      const label = row.label ?? template.labels[row.labelId ?? ""] ?? row.labelId ?? "";
      out.push(textLine(row.value ? `${label}: ${row.value}` : label, { bold: row.bold }));
    }
    if (sectionData.rows.length === 0) {
      if (!sectionData.emptyText) return [];
      out.push(textLine(sectionData.emptyText, { align: "center" }));
    }
  } else if (sectionData.kind === "table") {
    const columns = element.columns ?? [];
    const widths = tableWidths(columns, element.width);
    out.push({
      ...columnCells(
        columns,
        Object.fromEntries(columns.map((column) => [column.key, column.label])),
        true,
      ),
      widths,
    });
    for (const row of sectionData.table ?? []) {
      out.push({ ...columnCells(columns, row), widths });
    }
    if ((sectionData.table ?? []).length === 0) {
      if (!sectionData.emptyText) return [];
      out.length = title ? 1 : 0;
      out.push(textLine(sectionData.emptyText, { align: "center" }));
    }
  } else {
    const columns = element.columns ?? [];
    const widths = tableWidths(columns, element.width);
    const groups = sectionData.groups ?? [];
    if (groups.length === 0) {
      if (!sectionData.emptyText) return [];
      out.push(textLine(sectionData.emptyText, { align: "center" }));
    } else {
      groups.forEach((group, index) => {
        if (index > 0) out.push({ kind: "separator" });
        out.push(textLine(`— ${group.label} —`, { align: "center", bold: true, size: "large" }));
        for (const row of group.rows) {
          out.push({ ...columnCells(columns, row), widths });
        }
        out.push(textLine(`${template.labels.groupTotal ?? "الإجمالي"}: ${group.total}`));
      });
    }
  }
  return out;
}

function renderSummary(
  element: Extract<TemplateElement, { type: "summary" }>,
  data: DocumentData,
): LayoutLine[] {
  if (!data.summary) return [];
  const label = element.label.trim();
  return [
    textLine(label ? `${label}: ${data.summary}` : data.summary, {
      bold: true,
      size: "xlarge",
    }),
  ];
}

function renderQr(
  element: Extract<TemplateElement, { type: "qr" }>,
  template: ReportTemplateV2,
  data: DocumentData,
): LayoutLine[] {
  const payload = receiptQrPayload(data);
  if (!payload) return [];
  const paperPx = 384;
  const regionLeft = Math.round((element.col * paperPx) / template.paper.columns);
  const regionWidth = Math.round((element.width * paperPx) / template.paper.columns);
  const offsetPx = regionLeft + Math.max(0, Math.floor((regionWidth - element.sizePx) / 2));
  return [{ kind: "qr", payload, sizePx: element.sizePx, offsetPx, columns: template.paper.columns }];
}

function renderElement(
  element: TemplateElement,
  template: ReportTemplateV2,
  data: DocumentData,
): LayoutLine[] {
  if (!element.visible) return [];
  if (element.type === "text") return renderText(element, data);
  if (element.type === "field") return renderField(element, template, data);
  if (element.type === "logo") {
    if (!data.logoAvailable) return [];
    const fullWidth = element.col === 0 && element.width === template.paper.columns;
    const offsetPx = fullWidth
      ? undefined
      : Math.round((element.col * 384) / template.paper.columns);
    return [{
      kind: "logo",
      align: element.align ?? "center",
      maxWidth: element.maxWidth ?? 256,
      offsetPx,
    }];
  }
  if (element.type === "itemTable") return renderItems(element, data);
  if (element.type === "section") return renderSection(element, template, data);
  if (element.type === "summary") return renderSummary(element, data);
  if (element.type === "qr") return renderQr(element, template, data);
  return [];
}

function composeTextRow(
  elements: TemplateElement[],
  rendered: Map<string, LayoutLine[]>,
  paper: number,
): LayoutLine[] {
  if (elements.length === 1) {
    const element = elements[0]!;
    const lines = rendered.get(element.id) ?? [];
    if (lines.length === 0) return [];
    if (element.col === 0 && element.width === paper) return lines;
    const line = lines[0]!;
    if (line.kind !== "text") return lines;
    const widths: number[] = [];
    const cells: Extract<LayoutLine, { kind: "columns" }>["cells"] = [];
    if (element.col > 0) {
      widths.push(element.col);
      cells.push({ text: "", align: "right", bold: false, size: "normal" });
    }
    widths.push(element.width);
    cells.push({ text: line.text, align: line.align, bold: line.bold, size: line.size });
    if (element.col + element.width < paper) {
      widths.push(paper - element.col - element.width);
      cells.push({ text: "", align: "right", bold: false, size: "normal" });
    }
    return [{ kind: "columns", widths, cells }];
  }

  const widths: number[] = [];
  const cells: Extract<LayoutLine, { kind: "columns" }>["cells"] = [];
  let cursor = 0;
  let hasContent = false;
  for (const element of elements) {
    if (element.col > cursor) {
      widths.push(element.col - cursor);
      cells.push({ text: "", align: "right", bold: false, size: "normal" });
    }
    const line = rendered.get(element.id)?.[0];
    if (line?.kind === "text" && line.text) hasContent = true;
    widths.push(element.width);
    cells.push(
      line?.kind === "text"
        ? { text: line.text, align: line.align, bold: line.bold, size: line.size }
        : { text: "", align: "right", bold: false, size: "normal" },
    );
    cursor = element.col + element.width;
  }
  if (cursor < paper) {
    widths.push(paper - cursor);
    cells.push({ text: "", align: "right", bold: false, size: "normal" });
  }
  return hasContent ? [{ kind: "columns", widths, cells }] : [];
}

export function layoutTemplateV2(
  template: ReportTemplateV2,
  data: DocumentData,
): LayoutLine[] {
  const rendered = new Map<string, LayoutLine[]>();
  for (const element of template.elements) {
    if (element.type === "separator") continue;
    rendered.set(element.id, renderElement(element, template, data));
  }
  for (const element of template.elements) {
    if (element.type !== "separator" || !element.visible) continue;
    const refs = element.hideWhenEmptyOf ?? [];
    const visible =
      refs.length === 0 ||
      refs.some((id) => (rendered.get(id)?.length ?? 0) > 0);
    rendered.set(element.id, visible ? [{ kind: "separator" }] : []);
  }

  const rows = elementsByRow(template.elements);
  const lastRow = maxElementRow(template.elements);
  const out: LayoutLine[] = [];
  for (let row = 0; row <= lastRow; row += 1) {
    const rowElements = rows.get(row) ?? [];
    if (rowElements.length === 0) {
      out.push(BLANK);
      continue;
    }
    const visible = sortElements(rowElements.filter((element) => element.visible));
    if (visible.length === 0) continue;
    const textOnly = visible.every(
      (element) => element.type === "text" || element.type === "field",
    );
    if (textOnly) {
      out.push(...composeTextRow(visible, rendered, template.paper.columns));
      continue;
    }
    const blocks = visible
      .map((element) => rendered.get(element.id) ?? [])
      .filter((lines) => lines.length > 0);
    if (blocks.length === 0) continue;
    out.push(...blocks[0]!);
  }
  return out;
}
```

- [ ] **Step 4: Run the layout tests**

Run: `npx vitest run lib/print/templates/layout-v2.test.ts`
Expected: PASS.

- [ ] **Step 5: Owner review/commit checkpoint**

Show the diff. Do not commit.

---

### Task 7: v2 defaults and byte-parity suite

**Files:**
- Create: `lib/print/templates/defaults-v2.ts`
- Test: `lib/print/templates/parity.test.ts`
- Test: `lib/print/templates/defaults-v2.test.ts`

**Interfaces:**
- Consumes: `migrateReportTemplate`, `DEFAULT_REPORT_TEMPLATES_V1`, `layoutTemplateV1`, `layoutTemplateV2`, `renderLayout`, `buildSampleDocuments`.
- Produces: `DEFAULT_REPORT_TEMPLATES_V2: Record<ReportDocument, ReportTemplateV2>`.

- [ ] **Step 1: Write the failing parity test**

```ts
// lib/print/templates/parity.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES_V1 } from "./defaults-v1";
import { DEFAULT_REPORT_TEMPLATES_V2 } from "./defaults-v2";
import { layoutTemplateV1 } from "./layout-v1";
import { layoutTemplateV2 } from "./layout-v2";
import { renderLayout } from "./render";
import { buildSampleDocuments, sampleSettings } from "./sample";
import { REPORT_DOCUMENTS, type ReportDocument } from "./types";

const samples = buildSampleDocuments(sampleSettings);
const logo = new Uint8Array([0x1d, 0x76, 0x30, 0x00, 1, 0, 1, 0, 0x80]);

describe("v2 default parity", () => {
  it.each(REPORT_DOCUMENTS)("matches the v1 bytes for %s", (document: ReportDocument) => {
    const v1 = DEFAULT_REPORT_TEMPLATES_V1[document];
    const v2 = DEFAULT_REPORT_TEMPLATES_V2[document];
    const v1Bytes = renderLayout(layoutTemplateV1(v1, samples[document]), { logo });
    const v2Bytes = renderLayout(layoutTemplateV2(v2, samples[document]), { logo });
    expect(Buffer.from(v2Bytes).equals(Buffer.from(v1Bytes))).toBe(true);
  });
});
```

```ts
// lib/print/templates/defaults-v2.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES_V2 } from "./defaults-v2";
import { validateReportTemplateV2 } from "./schema-v2";
import { REPORT_DOCUMENTS } from "./types";

describe("DEFAULT_REPORT_TEMPLATES_V2", () => {
  it.each(REPORT_DOCUMENTS)("is a valid v2 template for %s", (document) => {
    expect(validateReportTemplateV2(DEFAULT_REPORT_TEMPLATES_V2[document], document).ok).toBe(true);
  });

  it("keeps the v1 labels and adds no extra elements", () => {
    expect(DEFAULT_REPORT_TEMPLATES_V2.kitchen.labels.waiter).toBe("السفرادجي");
    expect(DEFAULT_REPORT_TEMPLATES_V2.receipt.elements.some((element) => element.id === "el_qr")).toBe(false);
    expect(DEFAULT_REPORT_TEMPLATES_V2.sales.elements.some((element) => element.type === "itemTable")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/print/templates/parity.test.ts lib/print/templates/defaults-v2.test.ts`
Expected: FAIL — cannot resolve `./defaults-v2`.

- [ ] **Step 3: Implement `defaults-v2.ts`**

```ts
import { DEFAULT_REPORT_TEMPLATES_V1 } from "./defaults-v1";
import { migrateReportTemplate } from "./migrate";
import type { ReportDocument, ReportTemplateV2 } from "./types";

// The defaults are the deterministic migration of the frozen v1 defaults, so
// a fresh install and an upgraded install produce exactly the same paper.
export const DEFAULT_REPORT_TEMPLATES_V2: Record<ReportDocument, ReportTemplateV2> = {
  receipt: migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.receipt),
  kitchen: migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.kitchen),
  shift: migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.shift),
  items: migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.items),
  sales: migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.sales),
};
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/print/templates/parity.test.ts lib/print/templates/defaults-v2.test.ts`
Expected: PASS. If parity fails, fix migration/renderer rather than weakening the test.

- [ ] **Step 5: Owner review/commit checkpoint**

Show the diff. Do not commit.

---

### Task 8: Pure element operations for the editor

**Files:**
- Create: `lib/print/templates/element-ops.ts`
- Test: `lib/print/templates/element-ops.test.ts`

**Interfaces:**
- Consumes: `elements.ts`, `schema-v2.ts`, `document-specs.ts`.
- Produces: `TemplateCommit`, `ElementPatch`, `blankSample`, `isBlockType`, `canPlace`, `findFreeSlot`, `createElement`, `updateElement`, `removeElement`, `moveElement`, `nudgeElement`, `setElementVisible`, `updateLabel`, `changeField`, `setSeparatorRefs`, `duplicateElement`, `canAddUnique`, `unusedFieldIds`, `unusedSectionIds`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/print/templates/element-ops.test.ts
import { describe, expect, it } from "vitest";
import {
  changeField,
  createElement,
  duplicateElement,
  findFreeSlot,
  nudgeElement,
  removeElement,
  setSeparatorRefs,
  updateElement,
  updateLabel,
  unusedFieldIds,
} from "./element-ops";
import type { ReportTemplateV2, TemplateElement } from "./types";

function text(
  id: string,
  row: number,
  col: number,
  width: number,
  value = id,
): TemplateElement {
  return { id, type: "text", row, col, width, visible: true, text: value };
}

function template(
  elements: TemplateElement[],
  labels: Record<string, string> = {},
): ReportTemplateV2 {
  return {
    format: "fastpos-report",
    version: 2,
    document: "receipt",
    paper: { columns: 32 },
    elements,
    labels,
  };
}

describe("element operations", () => {
  it("finds the first free interval and never puts text beside a block", () => {
    const value = template([
      text("el_a", 0, 0, 10),
      text("el_b", 0, 12, 10),
    ]);
    expect(findFreeSlot(value, 6)).toEqual({ row: 0, col: 22 });
    expect(findFreeSlot(value, 12)).toEqual({ row: 1, col: 0 });
    expect(findFreeSlot(value, 32, { block: true })).toEqual({ row: 1, col: 0 });

    const withBlock = template([text("el_a", 0, 0, 32)]);
    expect(findFreeSlot(withBlock, 8)).toEqual({ row: 1, col: 0 });
  });

  it("adds a field with its label and honors unique limits", () => {
    const empty = template([]);
    const added = createElement(
      empty,
      {
        id: "el_field_orderno",
        type: "field",
        row: 0,
        col: 0,
        width: 32,
        visible: true,
        fieldId: "orderNo",
      },
      { labelDefaults: { orderNo: "رقم الطلب" } },
    );
    expect(added?.labels.orderNo).toBe("رقم الطلب");
    expect(added?.elements).toHaveLength(1);

    expect(
      createElement(added!, {
        id: "el_field_orderno_2",
        type: "field",
        row: 1,
        col: 0,
        width: 32,
        visible: true,
        fieldId: "orderNo",
      }),
    ).toBeNull();

    const logo = template([
      { id: "el_logo", type: "logo", row: 0, col: 0, width: 32, visible: true },
    ]);
    expect(
      createElement(logo, {
        id: "el_logo_2",
        type: "logo",
        row: 1,
        col: 0,
        width: 32,
        visible: true,
      }),
    ).toBeNull();
  });

  it("rejects overlapping updates and accepts valid style edits", () => {
    const value = template([text("el_a", 0, 0, 16), text("el_b", 0, 16, 16)]);
    expect(updateElement(value, "el_a", { width: 20 })).toBe(value);
    expect(updateElement(value, "el_a", { text: "مرحباً" })).toMatchObject({
      elements: [{ id: "el_a", text: "مرحباً" }],
    });
  });

  it("removes an element and cleans separator references", () => {
    const separator: TemplateElement = {
      id: "el_sep",
      type: "separator",
      row: 1,
      col: 0,
      width: 32,
      visible: true,
      hideWhenEmptyOf: ["el_a", "el_b"],
    };
    const value = template([text("el_a", 0, 0, 16), text("el_b", 0, 16, 16), separator]);
    const next = removeElement(value, "el_a");
    expect(next.elements.map((element) => element.id)).toEqual(["el_b", "el_sep"]);
    expect(next.elements[1]).toMatchObject({ hideWhenEmptyOf: ["el_b"] });
  });

  it("treats blocked nudges as no-ops and allows moving into free rows", () => {
    const value = template([text("el_a", 0, 0, 16), text("el_b", 0, 16, 16)]);
    expect(nudgeElement(value, "el_a", 0, 1)).toBe(value);
    const moved = nudgeElement(value, "el_a", 1, 0);
    expect(moved.elements[0]).toMatchObject({ row: 1, col: 0 });
  });

  it("keeps labels non-empty and switches fields safely", () => {
    const value = template(
      [
        {
          id: "el_field_orderno",
          type: "field",
          row: 0,
          col: 0,
          width: 32,
          visible: true,
          fieldId: "orderNo",
        },
      ],
      { orderNo: "رقم الطلب" },
    );
    expect(updateLabel(value, "orderNo", "   ")).toBe(value);
    expect(updateLabel(value, "orderNo", "طلب").labels.orderNo).toBe("طلب");
    expect(changeField(value, "el_field_orderno", "waiter", { waiter: "السفرادجي" }).labels.waiter).toBe("السفرادجي");
  });

  it("dedupes separator references and drops self/separator ids", () => {
    const value = template([
      text("el_a", 0, 0, 32),
      {
        id: "el_sep",
        type: "separator",
        row: 1,
        col: 0,
        width: 32,
        visible: true,
      },
    ]);
    const next = setSeparatorRefs(value, "el_sep", ["el_a", "el_a", "el_sep"]);
    expect(next.elements[1]).toMatchObject({ hideWhenEmptyOf: ["el_a"] });
  });

  it("duplicates text only and lists unused fields", () => {
    const value = template([
      text("el_a", 0, 0, 32),
      {
        id: "el_field_orderno",
        type: "field",
        row: 1,
        col: 0,
        width: 32,
        visible: true,
        fieldId: "orderNo",
      },
    ], { orderNo: "رقم الطلب" });
    const copy = duplicateElement(value, "el_a");
    expect(copy?.elements).toHaveLength(3);
    expect(new Set(copy?.elements.map((element) => element.id)).size).toBe(3);
    expect(duplicateElement(value, "el_field_orderno")).toBeNull();
    expect(unusedFieldIds(value)).not.toContain("orderNo");
    expect(unusedFieldIds(value)).toContain("waiter");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/print/templates/element-ops.test.ts`
Expected: FAIL — cannot resolve `./element-ops`.

- [ ] **Step 3: Implement `element-ops.ts`**

```ts
import { DOCUMENT_SPECS } from "./document-specs";
import {
  MAX_ELEMENTS,
  MAX_ROWS,
  MAX_SEPARATOR_REFS,
  newElementId,
} from "./elements";
import { validateReportTemplateV2 } from "./schema-v2";
import type {
  DocumentData,
  ElementType,
  ReportTemplateV2,
  TemplateElement,
} from "./types";

export type TemplateCommit = (
  next: ReportTemplateV2,
  options?: { coalesceKey?: string },
) => void;

export type ElementPatch = {
  [T in ElementType]: Partial<
    Omit<Extract<TemplateElement, { type: T }>, "type">
  >;
}[ElementType];

export function isBlockType(type: ElementType): boolean {
  return type !== "text" && type !== "field";
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

function commit(
  template: ReportTemplateV2,
  elements: TemplateElement[],
): ReportTemplateV2 | null {
  const next = { ...template, elements };
  return validateReportTemplateV2(next, template.document).ok ? next : null;
}

export function canPlace(
  template: ReportTemplateV2,
  candidate: Pick<TemplateElement, "id" | "type" | "row" | "col" | "width">,
): boolean {
  if (candidate.row < 0 || candidate.row >= MAX_ROWS) return false;
  if (
    candidate.col < 0 ||
    candidate.width < 1 ||
    candidate.col + candidate.width > template.paper.columns
  ) {
    return false;
  }
  const sameRow = template.elements.filter(
    (element) => element.id !== candidate.id && element.row === candidate.row,
  );
  if (
    sameRow.length > 0 &&
    (isBlockType(candidate.type) ||
      sameRow.some((element) => isBlockType(element.type)))
  ) {
    return false;
  }
  const end = candidate.col + candidate.width;
  return sameRow.every(
    (element) => element.col + element.width <= candidate.col || element.col >= end,
  );
}

export function findFreeSlot(
  template: ReportTemplateV2,
  width: number,
  options: { block?: boolean; rowStart?: number; ignoreId?: string } = {},
): { row: number; col: number } | null {
  const paper = template.paper.columns;
  const block = options.block ?? false;
  if (width < 1 || width > paper) return null;
  for (let row = options.rowStart ?? 0; row < MAX_ROWS; row += 1) {
    const occupied = template.elements
      .filter(
        (element) => element.row === row && element.id !== options.ignoreId,
      )
      .sort((a, b) => a.col - b.col);
    if (block) {
      if (occupied.length === 0) return { row, col: 0 };
      continue;
    }
    if (occupied.some((element) => isBlockType(element.type))) continue;
    let col = 0;
    for (const element of occupied) {
      if (col + width <= element.col) return { row, col };
      col = Math.max(col, element.col + element.width);
    }
    if (col + width <= paper) return { row, col };
  }
  return null;
}

export function createElement(
  template: ReportTemplateV2,
  draft: TemplateElement,
  options: { labelDefaults?: Record<string, string> } = {},
): ReportTemplateV2 | null {
  if (template.elements.length >= MAX_ELEMENTS) return null;
  const block = isBlockType(draft.type);
  const slot = findFreeSlot(template, draft.width, { block });
  if (!slot) return null;

  let labels = template.labels;
  const defaults = options.labelDefaults;
  if (defaults && (draft.type === "field" || draft.type === "section")) {
    const ids =
      draft.type === "field"
        ? [draft.fieldId]
        : (DOCUMENT_SPECS[template.document].sections[draft.sectionId]?.rowIds ?? []);
    for (const id of ids) {
      if (!labels[id] && defaults[id]) {
        labels = { ...labels, [id]: defaults[id] };
      }
    }
  }

  const col = block
    ? Math.max(0, Math.min(draft.col, template.paper.columns - draft.width))
    : slot.col;
  return commit({ ...template, labels }, [
    ...template.elements,
    { ...draft, row: slot.row, col } as TemplateElement,
  ]);
}

export function updateElement(
  template: ReportTemplateV2,
  id: string,
  patch: ElementPatch,
): ReportTemplateV2 {
  const target = template.elements.find((element) => element.id === id);
  if (!target) return template;
  const merged = {
    ...target,
    ...patch,
    id: target.id,
    type: target.type,
  } as TemplateElement;
  if (!canPlace(template, merged)) return template;
  return (
    commit(
      template,
      template.elements.map((element) => (element.id === id ? merged : element)),
    ) ?? template
  );
}

export function removeElement(
  template: ReportTemplateV2,
  id: string,
): ReportTemplateV2 {
  if (!template.elements.some((element) => element.id === id)) return template;
  const elements = template.elements
    .filter((element) => element.id !== id)
    .map((element) => {
      if (element.type !== "separator" || !element.hideWhenEmptyOf?.includes(id)) {
        return element;
      }
      const refs = element.hideWhenEmptyOf.filter((ref) => ref !== id);
      return {
        ...element,
        hideWhenEmptyOf: refs.length > 0 ? refs : undefined,
      };
    });
  return commit(template, elements) ?? template;
}

export function moveElement(
  template: ReportTemplateV2,
  id: string,
  row: number,
  col: number,
): ReportTemplateV2 {
  const target = template.elements.find((element) => element.id === id);
  if (!target) return template;
  return updateElement(template, id, { row, col });
}

export function nudgeElement(
  template: ReportTemplateV2,
  id: string,
  dRow: number,
  dCol: number,
): ReportTemplateV2 {
  const target = template.elements.find((element) => element.id === id);
  if (!target) return template;
  return moveElement(template, id, target.row + dRow, target.col + dCol);
}

export function setElementVisible(
  template: ReportTemplateV2,
  id: string,
  visible: boolean,
): ReportTemplateV2 {
  return updateElement(template, id, { visible });
}

export function updateLabel(
  template: ReportTemplateV2,
  fieldId: string,
  label: string,
): ReportTemplateV2 {
  const text = label.trim();
  if (!text || template.labels[fieldId] === text) return template;
  return (
    commit({ ...template, labels: { ...template.labels, [fieldId]: text } }, template.elements) ??
    template
  );
}

export function changeField(
  template: ReportTemplateV2,
  id: string,
  fieldId: string,
  labelDefaults: Record<string, string> = {},
): ReportTemplateV2 {
  const target = template.elements.find((element) => element.id === id);
  if (!target || target.type !== "field" || target.fieldId === fieldId) {
    return template;
  }
  let labels = template.labels;
  if (!labels[fieldId] && labelDefaults[fieldId]) {
    labels = { ...labels, [fieldId]: labelDefaults[fieldId] };
  }
  return updateElement({ ...template, labels }, id, { fieldId });
}

export function setSeparatorRefs(
  template: ReportTemplateV2,
  id: string,
  refs: string[],
): ReportTemplateV2 {
  const target = template.elements.find((element) => element.id === id);
  if (!target || target.type !== "separator") return template;
  const allowed = [...new Set(refs)]
    .filter(
      (ref) =>
        ref !== id &&
        template.elements.some(
          (element) => element.id === ref && element.type !== "separator",
        ),
    )
    .slice(0, MAX_SEPARATOR_REFS);
  return updateElement(template, id, {
    hideWhenEmptyOf: allowed.length > 0 ? allowed : undefined,
  });
}

export function duplicateElement(
  template: ReportTemplateV2,
  id: string,
): ReportTemplateV2 | null {
  const source = template.elements.find((element) => element.id === id);
  if (!source || (source.type !== "text" && source.type !== "separator")) {
    return null;
  }
  if (template.elements.length >= MAX_ELEMENTS) return null;
  const draft = {
    ...(JSON.parse(JSON.stringify(source)) as TemplateElement),
    id: newElementId(),
  } as TemplateElement;
  const block = draft.type === "separator";
  const slot = findFreeSlot(template, draft.width, {
    block,
    rowStart: source.row,
  });
  if (!slot) return null;
  return commit(template, [
    ...template.elements,
    { ...draft, row: slot.row, col: block ? 0 : slot.col } as TemplateElement,
  ]);
}

export function canAddUnique(
  template: ReportTemplateV2,
  type: "logo" | "qr" | "itemTable" | "summary",
): boolean {
  const spec = DOCUMENT_SPECS[template.document];
  if (template.elements.length >= MAX_ELEMENTS) return false;
  if (type === "qr" && !spec.qr) return false;
  if (type === "itemTable" && spec.itemColumns.length === 0) return false;
  if (type === "summary" && !spec.summaryAllowed) return false;
  return !template.elements.some((element) => element.type === type);
}

export function unusedFieldIds(template: ReportTemplateV2): string[] {
  const used = new Set(
    template.elements.flatMap((element) =>
      element.type === "field" ? [element.fieldId] : [],
    ),
  );
  return DOCUMENT_SPECS[template.document].fields.filter((id) => !used.has(id));
}

export function unusedSectionIds(template: ReportTemplateV2): string[] {
  const used = new Set(
    template.elements.flatMap((element) =>
      element.type === "section" ? [element.sectionId] : [],
    ),
  );
  return Object.keys(DOCUMENT_SPECS[template.document].sections).filter(
    (id) => !used.has(id),
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/print/templates/element-ops.test.ts`
Expected: PASS.

- [ ] **Step 5: Owner review/commit checkpoint**

Show the diff. Do not commit.

---

### Task 9: Grid canvas, palette, and inspector components

**Files:**
- Create: `components/admin/report-design/QrBox.tsx`
- Create: `components/admin/report-design/ElementCard.tsx`
- Create: `components/admin/report-design/GridCanvas.tsx`
- Create: `components/admin/report-design/ElementPalette.tsx`
- Create: `components/admin/report-design/ElementInspector.tsx`
- Test: `components/admin/report-design/GridCanvas.test.tsx`
- Test: `components/admin/report-design/ElementPalette.test.tsx`
- Test: `components/admin/report-design/ElementInspector.test.tsx`

**Interfaces:**
- Consumes: `layoutTemplateV2`, `element-ops`, `DOCUMENT_SPECS`, `DEFAULT_REPORT_TEMPLATES_V2`, `DocumentData`, `ReportTemplateV2`.
- Produces: `GridCanvas({template,data,selectedId,onSelect,onCommit,onBlocked})`, `ElementPalette({template,defaults,onCommit})`, `ElementInspector({template,defaults,selectedId,onCommit,onSelect})`, `elementLabel(element)`.

- [ ] **Step 1: Write the failing tests**

```tsx
// components/admin/report-design/GridCanvas.test.tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES_V2 } from "@/lib/print/templates/defaults-v2";
import { buildSampleDocuments, sampleSettings } from "@/lib/print/templates/sample";
import type { ReportTemplateV2, TemplateElement } from "@/lib/print/templates/types";
import { GridCanvas } from "./GridCanvas";

const receipt = DEFAULT_REPORT_TEMPLATES_V2.receipt;
const sample = buildSampleDocuments(sampleSettings).receipt;

function template(elements: TemplateElement[]): ReportTemplateV2 {
  return { ...receipt, elements, labels: {} };
}

function text(id: string, row: number, col: number, width: number): TemplateElement {
  return { id, type: "text", row, col, width, visible: true, text: id };
}

function renderCanvas(value: ReportTemplateV2, selectedId: string | null, handlers = {}) {
  const onCommit = vi.fn();
  const onBlocked = vi.fn();
  const onSelect = vi.fn();
  render(
    <GridCanvas
      template={value}
      data={sample}
      selectedId={selectedId}
      onSelect={onSelect}
      onCommit={onCommit}
      onBlocked={onBlocked}
      {...handlers}
    />,
  );
  return { onCommit, onBlocked, onSelect };
}

describe("GridCanvas", () => {
  it("shows the real print preview and selects a card", () => {
    const value: ReportTemplateV2 = { ...receipt, labels: {} };
    const { onSelect } = renderCanvas(value, null);
    expect(screen.getByTestId("print-preview").textContent).toContain("الصنف");
    const firstId = receipt.elements[0]!.id;
    fireEvent.click(document.querySelector(`[data-element-id="${firstId}"]`)!);
    expect(onSelect).toHaveBeenCalledWith(firstId);
  });

  it("toggles the cell grid", () => {
    renderCanvas(template([text("el_a", 0, 0, 32)]), null);
    const hide = screen.getByRole("button", { name: "إخفاء الشبكة" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(hide);
    expect(screen.getByRole("button", { name: "إظهار الشبكة" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("nudges with the keyboard and deletes while cleaning separator refs", () => {
    const value = template([
      text("el_a", 0, 0, 32),
      {
        id: "el_sep",
        type: "separator",
        row: 2,
        col: 0,
        width: 32,
        visible: true,
        hideWhenEmptyOf: ["el_a"],
      },
    ]);
    const { onCommit } = renderCanvas(value, "el_a");
    fireEvent.keyDown(screen.getByTestId("grid-canvas"), { key: "ArrowDown" });
    expect(onCommit.mock.calls.at(-1)![0].elements[0]).toMatchObject({ row: 1 });

    fireEvent.keyDown(screen.getByTestId("grid-canvas"), { key: "Delete" });
    const next = onCommit.mock.calls.at(-1)![0] as ReportTemplateV2;
    expect(next.elements.some((element) => element.id === "el_a")).toBe(false);
    const separator = next.elements.find((element) => element.id === "el_sep");
    expect(separator?.type === "separator" && separator.hideWhenEmptyOf).toBeUndefined();
  });

  it("rejects an overlapping drop with an Arabic hint", () => {
    const value = template([text("el_a", 0, 0, 16), text("el_b", 0, 16, 16)]);
    const { onBlocked } = renderCanvas(value, "el_a");
    const card = document.querySelector('[data-element-id="el_a"]') as HTMLElement;
    const grip = within(card).getByRole("button", { name: /اسحب/ });
    fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientX: 12, clientY: 0 });
    expect(onBlocked).toHaveBeenCalledWith("لا يمكن وضع العنصر هنا");
  });
});
```

```tsx
// components/admin/report-design/ElementPalette.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES_V2 } from "@/lib/print/templates/defaults-v2";
import type { ReportTemplateV2 } from "@/lib/print/templates/types";
import { ElementPalette } from "./ElementPalette";

const defaults = DEFAULT_REPORT_TEMPLATES_V2.receipt;

function template(elements: ReportTemplateV2["elements"]): ReportTemplateV2 {
  return { ...defaults, elements, labels: {} };
}

describe("ElementPalette", () => {
  it("disables unique entries that are already used", () => {
    render(<ElementPalette template={defaults} defaults={defaults} onCommit={vi.fn()} />);
    expect(
      (screen.getByRole("button", { name: "شعار" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "الإجمالي" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("adds text into the first free slot", () => {
    const onCommit = vi.fn();
    const value = template([
      { id: "el_a", type: "text", row: 0, col: 0, width: 32, visible: true, text: "A" },
    ]);
    render(<ElementPalette template={value} defaults={defaults} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "نص" }));
    const next = onCommit.mock.calls[0]![0] as ReportTemplateV2;
    expect(next.elements).toHaveLength(2);
    expect(next.elements[1]).toMatchObject({ type: "text", row: 1, col: 0 });
  });

  it("adds a field with the default Arabic label", () => {
    const onCommit = vi.fn();
    render(
      <ElementPalette template={template([])} defaults={defaults} onCommit={onCommit} />,
    );
    fireEvent.change(screen.getByLabelText("اختر حقلاً"), {
      target: { value: "orderNo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "إضافة حقل" }));
    const next = onCommit.mock.calls[0]![0] as ReportTemplateV2;
    expect(next.labels.orderNo).toBe("رقم الطلب");
    expect(next.elements[0]).toMatchObject({ type: "field", fieldId: "orderNo" });
  });
});
```

```tsx
// components/admin/report-design/ElementInspector.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES_V2 } from "@/lib/print/templates/defaults-v2";
import type { ReportTemplateV2 } from "@/lib/print/templates/types";
import { ElementInspector } from "./ElementInspector";

const defaults = DEFAULT_REPORT_TEMPLATES_V2.receipt;

function template(elements: ReportTemplateV2["elements"], labels = {}): ReportTemplateV2 {
  return { ...defaults, elements, labels };
}

describe("ElementInspector", () => {
  it("edits text and styles", () => {
    const onCommit = vi.fn();
    const value = template([
      { id: "el_a", type: "text", row: 0, col: 0, width: 32, visible: true, text: "قديم" },
    ]);
    render(
      <ElementInspector
        template={value}
        defaults={defaults}
        selectedId="el_a"
        onCommit={onCommit}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("النص"), { target: { value: "جديد" } });
    expect(onCommit.mock.calls.at(-1)![0].elements[0]).toMatchObject({ text: "جديد" });
  });

  it("writes a field label into the shared labels map", () => {
    const onCommit = vi.fn();
    const value = template(
      [
        {
          id: "el_field_orderno",
          type: "field",
          row: 0,
          col: 0,
          width: 32,
          visible: true,
          fieldId: "orderNo",
        },
      ],
      { orderNo: "رقم الطلب" },
    );
    render(
      <ElementInspector
        template={value}
        defaults={defaults}
        selectedId="el_field_orderno"
        onCommit={onCommit}
        onSelect={vi.fn()}
      />,
    );
    const label = screen.getByLabelText("التسمية");
    fireEvent.change(label, { target: { value: "طلب" } });
    fireEvent.blur(label);
    expect(onCommit.mock.calls.at(-1)![0].labels.orderNo).toBe("طلب");
  });

  it("wires separator references to other elements", () => {
    const onCommit = vi.fn();
    const value = template([
      { id: "el_a", type: "text", row: 0, col: 0, width: 32, visible: true, text: "A" },
      { id: "el_sep", type: "separator", row: 1, col: 0, width: 32, visible: true },
    ]);
    render(
      <ElementInspector
        template={value}
        defaults={defaults}
        selectedId="el_sep"
        onCommit={onCommit}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("إخفاء عندما يكون A فارغاً"));
    expect(onCommit.mock.calls.at(-1)![0].elements[1]).toMatchObject({
      hideWhenEmptyOf: ["el_a"],
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/admin/report-design/GridCanvas.test.tsx components/admin/report-design/ElementPalette.test.tsx components/admin/report-design/ElementInspector.test.tsx`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement `QrBox.tsx` and `ElementCard.tsx`**

```tsx
// components/admin/report-design/QrBox.tsx
"use client";

const MODULES = Array.from({ length: 81 }, (_, index) => {
  const row = Math.floor(index / 9);
  const col = index % 9;
  return (row * 3 + col * 5 + ((row * col) % 4)) % 7 < 3;
});

export function QrBox({ size = 56 }: { size?: number }) {
  return (
    <svg
      role="img"
      aria-label="رمز QR"
      width={size}
      height={size}
      viewBox="0 0 9 9"
      className="mx-auto bg-white p-1"
    >
      {MODULES.map((dark, index) =>
        dark ? (
          <rect
            key={index}
            x={index % 9}
            y={Math.floor(index / 9)}
            width={1}
            height={1}
            fill="black"
          />
        ) : null,
      )}
    </svg>
  );
}
```

```tsx
// components/admin/report-design/ElementCard.tsx
"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  Trash2,
} from "lucide-react";
import type { TemplateElement } from "@/lib/print/templates/types";
import { QrBox } from "./QrBox";

export type NudgeDirection = "up" | "down" | "left" | "right";

export function elementLabel(element: TemplateElement): string {
  if (element.type === "text") return element.text.trim() || "نص";
  if (element.type === "field") return element.fieldId;
  if (element.type === "logo") return "شعار";
  if (element.type === "qr") return "رمز QR";
  if (element.type === "separator") return "فاصل";
  if (element.type === "itemTable") return element.title?.trim() || "جدول الأصناف";
  if (element.type === "section") return element.title?.trim() || element.sectionId;
  return element.label.trim() || "الإجمالي";
}

type ElementCardProps = {
  element: TemplateElement;
  preview: string[];
  selected: boolean;
  dragging: boolean;
  style: CSSProperties;
  onSelect: () => void;
  onToggleVisible: () => void;
  onNudge: (direction: NudgeDirection) => void;
  onDelete: () => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onDragEnd: (event: ReactPointerEvent<HTMLElement>) => void;
};

export function ElementCard({
  element,
  preview,
  selected,
  dragging,
  style,
  onSelect,
  onToggleVisible,
  onNudge,
  onDelete,
  onDragStart,
  onDragEnd,
}: ElementCardProps) {
  const label = elementLabel(element);
  return (
    <article
      data-element-id={element.id}
      role="group"
      tabIndex={0}
      aria-label={label}
      aria-selected={selected}
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={`min-w-0 rounded-lg border-2 bg-white p-1 text-black ${
        selected ? "border-primary" : "border-neutral-200"
      } ${dragging ? "opacity-60" : ""} ${element.visible ? "" : "opacity-45"}`}
    >
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={`اسحب ${label}`}
          className="btn btn-ghost size-10 cursor-grab touch-none select-none p-0"
          onPointerDown={onDragStart}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          onLostPointerCapture={onDragEnd}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold">
          {label}
        </span>
        <button
          type="button"
          aria-label={element.visible ? `إخفاء ${label}` : `إظهار ${label}`}
          className="btn btn-sm btn-ghost"
          onClick={(event) => {
            event.stopPropagation();
            onToggleVisible();
          }}
        >
          {element.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
      </div>

      {selected && (
        <div className="flex items-center justify-center gap-0.5">
          <button type="button" aria-label="يسار" className="btn btn-ghost size-10 p-0" onClick={(event) => { event.stopPropagation(); onNudge("left"); }}>
            <ArrowLeft className="size-4" />
          </button>
          <button type="button" aria-label="أعلى" className="btn btn-ghost size-10 p-0" onClick={(event) => { event.stopPropagation(); onNudge("up"); }}>
            <ArrowUp className="size-4" />
          </button>
          <button type="button" aria-label="أسفل" className="btn btn-ghost size-10 p-0" onClick={(event) => { event.stopPropagation(); onNudge("down"); }}>
            <ArrowDown className="size-4" />
          </button>
          <button type="button" aria-label="يمين" className="btn btn-ghost size-10 p-0" onClick={(event) => { event.stopPropagation(); onNudge("right"); }}>
            <ArrowRight className="size-4" />
          </button>
          <button type="button" aria-label="حذف العنصر" className="btn btn-ghost size-10 p-0 text-error" onClick={(event) => { event.stopPropagation(); onDelete(); }}>
            <Trash2 className="size-4" />
          </button>
        </div>
      )}

      <div className="mt-1 space-y-0.5 text-[11px]">
        {element.type === "qr" ? (
          <QrBox />
        ) : element.type === "logo" ? (
          <p className="text-center text-neutral-400">[شعار]</p>
        ) : preview.length > 0 ? (
          preview.slice(0, 3).map((line, index) => (
            <p key={index} className="truncate">{line}</p>
          ))
        ) : (
          <p className="rounded border border-dashed border-neutral-300 p-1 text-center text-neutral-400">
            لا يظهر في العينة
          </p>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Implement `GridCanvas.tsx`**

```tsx
// components/admin/report-design/GridCanvas.tsx
"use client";

import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  elementsByRow,
  maxElementRow,
} from "@/lib/print/templates/elements";
import {
  moveElement,
  nudgeElement,
  removeElement,
  setElementVisible,
  type TemplateCommit,
} from "@/lib/print/templates/element-ops";
import { layoutTemplateV2 } from "@/lib/print/templates/layout-v2";
import type {
  DocumentData,
  LayoutLine,
  ReportTemplateV2,
  TemplateElement,
  TextSize,
} from "@/lib/print/templates/types";
import { ElementCard, type NudgeDirection } from "./ElementCard";

export const PAPER_WIDTH = 360;
export const ROW_HEIGHT = 56;

const TEXT_SIZE: Record<TextSize, number> = {
  small: 10,
  normal: 11,
  large: 13,
  xlarge: 15,
};

type GridCanvasProps = {
  template: ReportTemplateV2;
  data: DocumentData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCommit: TemplateCommit;
  onBlocked: (message: string) => void;
};

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return true;
  return target.isContentEditable || target.closest("[contenteditable]") !== null;
}

function PreviewLine({ line }: { line: LayoutLine }) {
  if (line.kind === "separator") {
    return <hr className="my-1 border-dashed border-neutral-400" />;
  }
  if (line.kind === "logo") {
    return <p className="text-center text-[10px] text-neutral-400">[شعار]</p>;
  }
  if (line.kind === "qr") {
    return <p className="text-center text-[10px] text-neutral-400">[رمز QR]</p>;
  }
  if (line.kind === "columns") {
    return (
      <div className="flex gap-1">
        {line.cells.map((cell, index) => (
          <span
            key={index}
            className="truncate"
            style={{
              flex: line.widths[index] ?? 1,
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
      style={{
        textAlign: line.align,
        fontWeight: line.bold ? 800 : 400,
        fontSize: TEXT_SIZE[line.size],
      }}
    >
      {line.text}
    </p>
  );
}

function previewFor(
  template: ReportTemplateV2,
  element: TemplateElement,
  data: DocumentData,
): string[] {
  if (element.type === "separator") return ["—".repeat(Math.min(30, element.width))];
  if (element.type === "logo") return ["[شعار]"];
  if (element.type === "qr") return ["[رمز QR]"];
  return layoutTemplateV2({ ...template, elements: [element] }, data)
    .map((line) => {
      if (line.kind === "text") return line.text;
      if (line.kind === "columns") return line.cells.map((cell) => cell.text).join("  ");
      return "";
    })
    .filter(Boolean);
}

export function GridCanvas({
  template,
  data,
  selectedId,
  onSelect,
  onCommit,
  onBlocked,
}: GridCanvasProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    row: number;
    col: number;
  } | null>(null);

  const paper = template.paper.columns;
  const rows = Math.max(16, maxElementRow(template.elements) + 3);
  const grouped = elementsByRow(template.elements);
  const preview = layoutTemplateV2(template, data);
  const cellWidth = PAPER_WIDTH / paper;

  function startDrag(event: ReactPointerEvent<HTMLElement>, element: TemplateElement) {
    if (event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* jsdom has no pointer capture */
    }
    dragRef.current = {
      id: element.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      row: element.row,
      col: element.col,
    };
    setDraggingId(element.id);
    onSelect(element.id);
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDraggingId(null);
    if (event.type !== "pointerup") return;
    const col = drag.col + Math.round((event.clientX - drag.startX) / cellWidth);
    const row = drag.row + Math.round((event.clientY - drag.startY) / ROW_HEIGHT);
    const next = moveElement(template, drag.id, row, col);
    if (next === template) {
      onBlocked("لا يمكن وضع العنصر هنا");
      return;
    }
    onCommit(next);
  }

  function nudge(id: string, direction: NudgeDirection) {
    const delta =
      direction === "up"
        ? [-1, 0]
        : direction === "down"
          ? [1, 0]
          : direction === "left"
            ? [0, -1]
            : [0, 1];
    onCommit(nudgeElement(template, id, delta[0]!, delta[1]!));
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!selectedId || isTextEntryTarget(event.target)) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onCommit(removeElement(template, selectedId));
      onSelect(null);
      return;
    }
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    onCommit(nudgeElement(template, selectedId, delta[0], delta[1]));
  }

  return (
    <div
      data-testid="grid-canvas"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={() => onSelect(null)}
      className="rounded-xl bg-white p-2 text-black outline-none"
    >
      <div
        className="mb-1 flex items-center justify-between gap-2"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="text-[11px] text-neutral-500">
          شبكة {paper} عموداً — {rows} صفاً
        </span>
        <button
          type="button"
          aria-label={showGrid ? "إخفاء الشبكة" : "إظهار الشبكة"}
          aria-pressed={showGrid}
          className="btn btn-sm btn-ghost"
          onClick={() => setShowGrid(!showGrid)}
        >
          {showGrid ? "إخفاء الشبكة" : "إظهار الشبكة"}
        </button>
      </div>
      <div data-testid="print-preview" className="mb-3 space-y-0.5 border-b pb-2" dir="rtl">
        {preview.map((line, index) => (
          <PreviewLine key={index} line={line} />
        ))}
      </div>
      <div className="space-y-0.5" dir="rtl">
        {Array.from({ length: rows }, (_, row) => (
          <div
            key={row}
            data-row={row}
            className={`min-h-8 py-0.5 ${
              showGrid ? "border-b border-dashed border-neutral-200" : ""
            }`}
          >
            <div
              className="grid gap-0.5"
              style={{
                gridTemplateColumns: `repeat(${paper}, minmax(0, 1fr))`,
                backgroundImage: showGrid
                  ? `repeating-linear-gradient(to right, transparent 0 ${
                      cellWidth - 1
                    }px, #f1f5f9 ${cellWidth - 1}px ${cellWidth}px)`
                  : undefined,
              }}
            >
              {(grouped.get(row) ?? []).map((element) => (
                <ElementCard
                  key={element.id}
                  element={element}
                  preview={previewFor(template, element, data)}
                  selected={element.id === selectedId}
                  dragging={element.id === draggingId}
                  style={{ gridColumn: `${element.col + 1} / span ${element.width}` }}
                  onSelect={() => onSelect(element.id)}
                  onToggleVisible={() =>
                    onCommit(setElementVisible(template, element.id, !element.visible))
                  }
                  onNudge={(direction) => nudge(element.id, direction)}
                  onDelete={() => {
                    onCommit(removeElement(template, element.id));
                    onSelect(null);
                  }}
                  onDragStart={(event) => startDrag(event, element)}
                  onDragEnd={endDrag}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement `ElementPalette.tsx`**

```tsx
// components/admin/report-design/ElementPalette.tsx
"use client";

import { useState } from "react";
import { DOCUMENT_SPECS } from "@/lib/print/templates/document-specs";
import {
  DEFAULT_LOGO_WIDTH,
  DEFAULT_QR_SIZE,
  DEFAULT_QR_WIDTH,
  newElementId,
} from "@/lib/print/templates/elements";
import {
  canAddUnique,
  createElement,
  unusedFieldIds,
  unusedSectionIds,
} from "@/lib/print/templates/element-ops";
import type {
  ReportTemplateV2,
  TemplateElement,
} from "@/lib/print/templates/types";

type ElementPaletteProps = {
  template: ReportTemplateV2;
  defaults: ReportTemplateV2;
  onCommit: (next: ReportTemplateV2) => void;
};

export function ElementPalette({ template, defaults, onCommit }: ElementPaletteProps) {
  const spec = DOCUMENT_SPECS[template.document];
  const paper = template.paper.columns;
  const [fieldChoice, setFieldChoice] = useState("");
  const fields = unusedFieldIds(template);
  const fieldId = fields.includes(fieldChoice) ? fieldChoice : (fields[0] ?? "");
  const sections = unusedSectionIds(template);

  function add(draft: TemplateElement) {
    const next = createElement(template, draft, { labelDefaults: defaults.labels });
    if (next) onCommit(next);
  }

  const table = defaults.elements.find((element) => element.type === "itemTable");
  const fallbackColumns = spec.itemColumns.map((key) => ({
    key,
    label: defaults.labels[key] ?? key,
    width: 8,
  }));

  const summary = defaults.elements.find((element) => element.type === "summary");

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-base-300 p-3">
      <button type="button" className="btn btn-sm" onClick={() => add({ id: newElementId(), type: "text", row: 0, col: 0, width: paper, visible: true, text: "نص جديد" })}>
        نص
      </button>

      <select
        aria-label="اختر حقلاً"
        className="select select-bordered select-sm"
        value={fieldId}
        onChange={(event) => setFieldChoice(event.target.value)}
      >
        {fields.length === 0 && <option value="">لا حقول متاحة</option>}
        {fields.map((id) => (
          <option key={id} value={id}>
            {defaults.labels[id] ?? id}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-sm"
        disabled={!fieldId}
        onClick={() =>
          fieldId &&
          add({
            id: newElementId(),
            type: "field",
            row: 0,
            col: 0,
            width: paper,
            visible: true,
            fieldId,
          })
        }
      >
        إضافة حقل
      </button>

      <button
        type="button"
        className="btn btn-sm"
        disabled={!canAddUnique(template, "logo")}
        onClick={() =>
          add({
            id: newElementId(),
            type: "logo",
            row: 0,
            col: 0,
            width: paper,
            visible: true,
            align: "center",
            maxWidth: DEFAULT_LOGO_WIDTH,
          })
        }
      >
        شعار
      </button>

      {spec.qr && (
        <button
          type="button"
          className="btn btn-sm"
          disabled={!canAddUnique(template, "qr")}
          onClick={() =>
            add({
              id: newElementId(),
              type: "qr",
              row: 0,
              col: Math.floor((paper - DEFAULT_QR_WIDTH) / 2),
              width: DEFAULT_QR_WIDTH,
              visible: true,
              sizePx: DEFAULT_QR_SIZE,
            })
          }
        >
          رمز QR
        </button>
      )}

      {spec.itemColumns.length > 0 && (
        <button
          type="button"
          className="btn btn-sm"
          disabled={!canAddUnique(template, "itemTable")}
          onClick={() =>
            add({
              id: newElementId(),
              type: "itemTable",
              row: 0,
              col: 0,
              width: paper,
              visible: true,
              title: "الأصناف",
              showHeader: true,
              showNotes: true,
              columns:
                table?.type === "itemTable" ? table.columns : fallbackColumns,
            })
          }
        >
          جدول الأصناف
        </button>
      )}

      {sections.map((sectionId) => {
        const source = defaults.elements.find(
          (element) => element.type === "section" && element.sectionId === sectionId,
        );
        const draft: TemplateElement = {
          id: newElementId(),
          type: "section",
          row: 0,
          col: 0,
          width: paper,
          visible: true,
          sectionId,
          title: source?.type === "section" ? (source.title ?? "") : "",
          ...(source?.type === "section" && source.columns
            ? { columns: source.columns }
            : {}),
        };
        return (
          <button
            key={sectionId}
            type="button"
            className="btn btn-sm"
            onClick={() => add(draft)}
          >
            {source?.type === "section" ? source.title || sectionId : sectionId}
          </button>
        );
      })}

      {spec.summaryAllowed && (
        <button
          type="button"
          className="btn btn-sm"
          disabled={!canAddUnique(template, "summary")}
          onClick={() =>
            add({
              id: newElementId(),
              type: "summary",
              row: 0,
              col: 0,
              width: paper,
              visible: true,
              label: summary?.type === "summary" ? summary.label : "",
            })
          }
        >
          الإجمالي
        </button>
      )}

      <button
        type="button"
        className="btn btn-sm"
        onClick={() =>
          add({ id: newElementId(), type: "separator", row: 0, col: 0, width: paper, visible: true })
        }
      >
        فاصل
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Implement `ElementInspector.tsx`**

```tsx
// components/admin/report-design/ElementInspector.tsx
"use client";

import { useRef, useState, type ReactNode } from "react";
import { DOCUMENT_SPECS } from "@/lib/print/templates/document-specs";
import {
  changeField,
  duplicateElement,
  removeElement,
  setSeparatorRefs,
  updateElement,
  updateLabel,
  type ElementPatch,
  type TemplateCommit,
} from "@/lib/print/templates/element-ops";
import type {
  Align,
  ReportTemplateV2,
  TemplateColumn,
  TemplateElement,
  TextSize,
} from "@/lib/print/templates/types";
import { elementLabel } from "./ElementCard";

type ElementInspectorProps = {
  template: ReportTemplateV2;
  defaults: ReportTemplateV2;
  selectedId: string | null;
  onCommit: TemplateCommit;
  onSelect: (id: string | null) => void;
};

function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-base-content/60">{label}</span>
      <input
        type="number"
        aria-label={label}
        key={value}
        defaultValue={value}
        min={min}
        max={max}
        className="input input-bordered input-sm w-full"
        onBlur={(event) => {
          const parsed = Number(event.target.value);
          const next = Number.isFinite(parsed)
            ? Math.max(min, Math.min(max, Math.round(parsed)))
            : value;
          event.target.value = String(next);
          if (next !== value) onCommit(next);
        }}
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-base-content/60">{label}</span>
      <select
        aria-label={label}
        className="select select-bordered select-sm w-full"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        aria-label={label}
        className="checkbox checkbox-sm"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

const ALIGN_OPTIONS: Array<{ value: Align; label: string }> = [
  { value: "right", label: "يمين" },
  { value: "center", label: "وسط" },
  { value: "left", label: "يسار" },
];

const SIZE_OPTIONS: Array<{ value: TextSize; label: string }> = [
  { value: "small", label: "صغير" },
  { value: "normal", label: "عادي" },
  { value: "large", label: "كبير" },
  { value: "xlarge", label: "كبير جداً" },
];

export function ElementInspector({
  template,
  defaults,
  selectedId,
  onCommit,
  onSelect,
}: ElementInspectorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [insertToken, setInsertToken] = useState("");
  const element = template.elements.find((entry) => entry.id === selectedId);

  if (!element) {
    return (
      <aside className="rounded-xl border border-base-300 p-4 text-sm text-base-content/60">
        اختر عنصراً من الورقة لتعديل خصائصه.
      </aside>
    );
  }

  const spec = DOCUMENT_SPECS[template.document];
  const patch = (value: ElementPatch) =>
    onCommit(updateElement(template, element.id, value));

  function insertAtCaret(token: string) {
    const text = element.type === "text" ? element.text : "";
    const start = textareaRef.current?.selectionStart ?? text.length;
    const end = textareaRef.current?.selectionEnd ?? start;
    patch({ text: text.slice(0, start) + token + text.slice(end) });
  }

  const position = (
    <div className="grid grid-cols-3 gap-2">
      <NumberField
        label="الصف"
        value={element.row}
        min={0}
        max={59}
        onCommit={(row) => patch({ row })}
      />
      {element.type !== "separator" && (
        <>
          <NumberField
            label="العمود"
            value={element.col}
            min={0}
            max={template.paper.columns - 1}
            onCommit={(col) => patch({ col })}
          />
          <NumberField
            label="العرض"
            value={element.width}
            min={1}
            max={template.paper.columns}
            onCommit={(width) => patch({ width })}
          />
        </>
      )}
    </div>
  );

  function columnsEditor(columns: TemplateColumn[], onChange: (columns: TemplateColumn[]) => void) {
    return (
      <div className="space-y-1">
        {columns.map((column, index) => (
          <NumberField
            key={column.key}
            label={`عرض ${column.label}`}
            value={column.width}
            min={1}
            max={64}
            onCommit={(width) =>
              onChange(
                columns.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, width } : entry,
                ),
              )
            }
          />
        ))}
      </div>
    );
  }

  let body: ReactNode = null;

  if (element.type === "text") {
    const tokens = [
      ...spec.placeholders.map((token) => `{{${token}}}`),
      ...spec.fields.map((field) => `{{field.${field}}}`),
    ];
    body = (
      <>
        <label className="block">
          <span className="text-[11px] text-base-content/60">النص</span>
          <textarea
            ref={textareaRef}
            aria-label="النص"
            className="textarea textarea-bordered w-full font-mono text-sm"
            value={element.text}
            onChange={(event) =>
              patch({ text: event.target.value })
            }
          />
        </label>
        <select
          aria-label="إدراج بيانات"
          className="select select-bordered select-sm w-full"
          value={insertToken}
          onChange={(event) => {
            const token = event.target.value;
            setInsertToken("");
            if (token) insertAtCaret(token);
          }}
        >
          <option value="">إدراج بيانات…</option>
          {tokens.map((token) => (
            <option key={token} value={token}>{token}</option>
          ))}
        </select>
        <SelectField
          label="المحاذاة"
          value={element.align ?? "right"}
          options={ALIGN_OPTIONS}
          onChange={(align) => patch({ align })}
        />
        <SelectField
          label="الحجم"
          value={element.size ?? "normal"}
          options={SIZE_OPTIONS}
          onChange={(size) => patch({ size })}
        />
        <Check
          label="عريض"
          checked={element.bold ?? false}
          onChange={(bold) => patch({ bold })}
        />
        <Check
          label="إخفاء عند الفراغ"
          checked={element.hideWhenEmpty !== false}
          onChange={(hideWhenEmpty) =>
            patch({ hideWhenEmpty })
          }
        />
        {position}
      </>
    );
  } else if (element.type === "field") {
    const used = new Set(
      template.elements.flatMap((entry) =>
        entry.type === "field" && entry.id !== element.id ? [entry.fieldId] : [],
      ),
    );
    body = (
      <>
        <SelectField
          label="الحقل"
          value={element.fieldId}
          options={spec.fields
            .filter((field) => field === element.fieldId || !used.has(field))
            .map((field) => ({ value: field, label: defaults.labels[field] ?? field }))}
          onChange={(fieldId) =>
            onCommit(changeField(template, element.id, fieldId, defaults.labels))
          }
        />
        <label className="block">
          <span className="text-[11px] text-base-content/60">التسمية</span>
          <input
            aria-label="التسمية"
            key={element.fieldId}
            defaultValue={template.labels[element.fieldId] ?? ""}
            className="input input-bordered input-sm w-full"
            onBlur={(event) => {
              const next = updateLabel(template, element.fieldId, event.target.value);
              if (next === template) {
                event.target.value = template.labels[element.fieldId] ?? "";
                return;
              }
              onCommit(next);
            }}
          />
        </label>
        <SelectField
          label="المحاذاة"
          value={element.align ?? "right"}
          options={ALIGN_OPTIONS}
          onChange={(align) => patch({ align })}
        />
        <SelectField
          label="الحجم"
          value={element.size ?? "normal"}
          options={SIZE_OPTIONS}
          onChange={(size) => patch({ size })}
        />
        <Check
          label="عريض"
          checked={element.bold ?? false}
          onChange={(bold) => patch({ bold })}
        />
        <Check
          label="إخفاء عند الفراغ"
          checked={element.hideWhenEmpty !== false}
          onChange={(hideWhenEmpty) =>
            patch({ hideWhenEmpty })
          }
        />
        {position}
      </>
    );
  } else if (element.type === "logo") {
    body = (
      <>
        <SelectField
          label="المحاذاة"
          value={element.align ?? "center"}
          options={ALIGN_OPTIONS}
          onChange={(align) => patch({ align })}
        />
        <NumberField
          label="أقصى عرض"
          value={element.maxWidth ?? 256}
          min={64}
          max={384}
          onCommit={(maxWidth) => patch({ maxWidth })}
        />
        {position}
      </>
    );
  } else if (element.type === "qr") {
    body = (
      <>
        <NumberField
          label="حجم الرمز"
          value={element.sizePx}
          min={96}
          max={384}
          onCommit={(sizePx) => patch({ sizePx })}
        />
        {position}
      </>
    );
  } else if (element.type === "separator") {
    const candidates = template.elements.filter(
      (entry) => entry.type !== "separator" && entry.id !== element.id,
    );
    const refs = element.hideWhenEmptyOf ?? [];
    body = (
      <>
        <p className="text-[11px] text-base-content/60">
          يختفي الفاصل عندما تكون كل العناصر المختارة فارغة. اتركه بلا اختيار ليبقى ظاهراً.
        </p>
        {candidates.map((candidate) => (
          <Check
            key={candidate.id}
            label={`إخفاء عندما يكون ${elementLabel(candidate)} فارغاً`}
            checked={refs.includes(candidate.id)}
            onChange={(checked) =>
              onCommit(
                setSeparatorRefs(
                  template,
                  element.id,
                  checked
                    ? [...refs, candidate.id]
                    : refs.filter((ref) => ref !== candidate.id),
                ),
              )
            }
          />
        ))}
        {position}
      </>
    );
  } else if (element.type === "itemTable") {
    body = (
      <>
        <label className="block">
          <span className="text-[11px] text-base-content/60">العنوان</span>
          <input
            aria-label="عنوان الجدول"
            key={element.title ?? ""}
            defaultValue={element.title ?? ""}
            className="input input-bordered input-sm w-full"
            onBlur={(event) =>
              patch({ title: event.target.value })
            }
          />
        </label>
        <Check
          label="رأس الجدول"
          checked={element.showHeader ?? true}
          onChange={(showHeader) => patch({ showHeader })}
        />
        <Check
          label="ملاحظات الأصناف"
          checked={element.showNotes ?? true}
          onChange={(showNotes) => patch({ showNotes })}
        />
        {columnsEditor(element.columns, (columns) =>
          patch({ columns }),
        )}
        {position}
      </>
    );
  } else if (element.type === "section") {
    body = (
      <>
        <label className="block">
          <span className="text-[11px] text-base-content/60">العنوان</span>
          <input
            aria-label="عنوان القسم"
            key={element.title ?? ""}
            defaultValue={element.title ?? ""}
            className="input input-bordered input-sm w-full"
            onBlur={(event) =>
              patch({ title: event.target.value })
            }
          />
        </label>
        {element.columns &&
          columnsEditor(element.columns, (columns) =>
            patch({ columns }),
          )}
        {position}
      </>
    );
  } else {
    body = (
      <>
        <label className="block">
          <span className="text-[11px] text-base-content/60">التسمية</span>
          <input
            aria-label="تسمية الإجمالي"
            key={element.label}
            defaultValue={element.label}
            className="input input-bordered input-sm w-full"
            onBlur={(event) =>
              patch({ label: event.target.value })
            }
          />
        </label>
        {position}
      </>
    );
  }

  const canDuplicate = element.type === "text" || element.type === "separator";

  return (
    <aside className="space-y-3 rounded-xl border border-base-300 p-4">
      <h3 className="text-sm font-bold">خصائص — {elementLabel(element)}</h3>
      {body}
      <div className="flex gap-2 border-t pt-3">
        {canDuplicate && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const next = duplicateElement(template, element.id);
              if (!next) return;
              onCommit(next);
              const added = next.elements.find(
                (entry) => !template.elements.some((old) => old.id === entry.id),
              );
              if (added) onSelect(added.id);
            }}
          >
            تكرار
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-error"
          onClick={() => {
            onCommit(removeElement(template, element.id));
            onSelect(null);
          }}
        >
          حذف
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 7: Run the component tests**

Run: `npx vitest run components/admin/report-design/GridCanvas.test.tsx components/admin/report-design/ElementPalette.test.tsx components/admin/report-design/ElementInspector.test.tsx`
Expected: PASS. The full app still uses v1 here; these components are not mounted until Task 10.

- [ ] **Step 8: Owner review/commit checkpoint**

Show the diff. Do not commit.

---

### Task 10: Cut over the app to v2

**Files:**
- Modify: `lib/print/templates/types.ts` (flip the public alias)
- Modify: `lib/print/templates/schema.ts` (v1 rename + version dispatch)
- Modify: `lib/print/templates/schema-common.ts` (move `canonicalBlockIds` here)
- Modify: `lib/print/templates/migrate.ts` (local `orderedBlockIds`, drop `./blocks`)
- Modify: `lib/print/templates/layout.ts` (v2 re-export)
- Modify: `lib/print/templates/defaults.ts` (v2 re-export)
- Modify: `lib/print/templates/build.ts` (`logoElement`)
- Modify: `components/admin/report-design/ReportDesignAdmin.tsx`
- Modify: `components/admin/report-design/useTemplateEditor.test.tsx`
- Modify: `components/admin/report-design/ReportDesignAdmin.test.tsx`
- Modify: `lib/print/templates/defaults.test.ts`, `lib/print/templates/store.test.ts`, `lib/print/templates/schema.test.ts`
- Move: `lib/print/templates/layout.test.ts` → `lib/print/templates/layout-v1.test.ts`
- Delete: `lib/print/templates/blocks.ts`, `blocks.test.ts`, `components/admin/report-design/CanvasBlock.tsx`, `CanvasLines.tsx`, `ReportCanvas.tsx`, `BlockInspector.tsx`, `ReportCanvas.test.tsx`, `BlockInspector.test.tsx`
- Test: full suite

**Interfaces:**
- Consumes: every v2 module from Tasks 1–9.
- Produces: `ReportTemplate = ReportTemplateV2`; `parseReportTemplateJson` returning v2 for both versions; `layoutTemplate` rendering v2; `DEFAULT_REPORT_TEMPLATES` v2; the mounted grid designer.

- [ ] **Step 1: Flip the public type and layout/defaults exports**

In `types.ts`, replace the temporary alias with:

```ts
export type ReportTemplate = ReportTemplateV2;
```

In `layout.ts`, replace the whole file with:

```ts
export { layoutTemplateV2 as layoutTemplate } from "./layout-v2";
export {
  expandPlaceholders,
  tableWidths,
  wrapWords,
} from "./layout-core";
```

In `defaults.ts`, replace the whole file with:

```ts
export {
  DEFAULT_REPORT_TEMPLATES_V2 as DEFAULT_REPORT_TEMPLATES,
} from "./defaults-v2";
```

- [ ] **Step 2: Make `schema.ts` dispatch by version**

Rename `validateReportTemplate` to `validateReportTemplateV1` and rename its
result type to `ValidationResultV1`:

```ts
export type ValidationResultV1 =
  | { ok: true; template: ReportTemplateV1 }
  | { ok: false; errors: string[] };
```

Use a local import alias so the 200-line v1 body needs no other edits:

```ts
import type { ReportTemplateV1, ReportTemplateV1 as ReportTemplate } from "./types";
```

Add `canonicalBlockIds` to `schema-common.ts` (copy it verbatim from
`blocks.ts`, exported) and change its import in `schema.ts`. Replace
`parseReportTemplateJson` with:

```ts
export type ValidationResult = ValidationResultV2;

export function parseReportTemplateJson(
  json: string,
  expectedDoc?: ReportDocument,
): ValidationResult {
  if (new TextEncoder().encode(json).length > MAX_JSON_BYTES) {
    return { ok: false, errors: ["ملف التصميم أكبر من 100 كيلوبايت"] };
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, errors: ["ملف التصميم ليس JSON صالحاً"] };
  }
  const version =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>).version
      : undefined;
  try {
    if (version === 1) {
      const v1 = validateReportTemplateV1(value, expectedDoc);
      if (!v1.ok) return { ok: false, errors: v1.errors };
      return validateReportTemplateV2(
        migrateReportTemplate(v1.template),
        expectedDoc,
      );
    }
    if (version === 2) return validateReportTemplateV2(value, expectedDoc);
    return { ok: false, errors: ["version غير مدعوم"] };
  } catch {
    return { ok: false, errors: ["ملف التصميم غير صالح"] };
  }
}
```

Import `migrateReportTemplate` from `./migrate` and
`validateReportTemplateV2`, `type ValidationResultV2` from `./schema-v2`.
`templatesEqual` stays unchanged.

- [ ] **Step 3: Drop the `blocks.ts` dependency from migration**

In `migrate.ts`, remove `import { orderedBlockIds } from "./blocks";` and add:

```ts
function orderedBlockIds(v1: ReportTemplateV1): string[] {
  const canonical = [
    "header",
    "fields",
    "items",
    ...v1.sections.map((section) => `section:${section.id}`),
    "summary",
    "footer",
  ];
  if (!v1.order) return canonical;
  const known = new Set(canonical);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of v1.order) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  for (const id of canonical) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}
```

- [ ] **Step 4: Use the logo element in `build.ts`**

Replace both `template.header.logo...` lookups in `renderDocument` and
`buildSampleEscPos` with:

```ts
const logo = logoElement(template);
if (overrides.logo !== undefined) {
  logoBytes = overrides.logo;
} else if (logo?.visible && data.logoAvailable) {
  logoBytes = await getReceiptLogoEscPos(logo.maxWidth ?? DEFAULT_LOGO_WIDTH);
}
```

Import `{ logoElement, DEFAULT_LOGO_WIDTH }` from `./elements` and keep the
local byte variable distinct from the element (name it `logoBytes` in both
functions, including `buildSampleEscPos`, which reads `options.logo`).

- [ ] **Step 5: Mount the v2 editor in `ReportDesignAdmin.tsx`**

Replace the imports from `blocks` with `blankSample, type TemplateCommit` from
`@/lib/print/templates/element-ops` and import the three new components.
Change `selected` state to:

```tsx
const [selected, setSelected] = useState<string | null>(
  props.template.elements[0]?.id ?? null,
);
```

Add a JSON version helper above the component:

```tsx
function jsonVersion(json: string): number | null {
  try {
    const value = JSON.parse(json) as { version?: unknown };
    return typeof value.version === "number" ? value.version : null;
  } catch {
    return null;
  }
}
```

In `applyJson` and `importFile`, capture `const wasV1 = jsonVersion(...) === 1;`
before parsing and use these messages:

```tsx
setMessage(
  wasV1
    ? "تم ترحيل تصميم الإصدار الأول وتطبيقه"
    : "تم تطبيق التصميم من JSON",
);
```

For import, keep `تم استيراد ${file.name}` and append ` — تم ترحيل v1` when
`wasV1`. In the canvas grid replace `ReportCanvas`/`BlockInspector` with:

```tsx
<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
  <div className="space-y-3">
    <ElementPalette
      template={template}
      defaults={DEFAULT_REPORT_TEMPLATES[props.document]}
      onCommit={commit}
    />
    <GridCanvas
      template={template}
      data={data}
      selectedId={selected}
      onSelect={setSelected}
      onCommit={commit}
      onBlocked={(message) => {
        setError(message);
        setMessage(null);
      }}
    />
  </div>
  <ElementInspector
    template={template}
    defaults={DEFAULT_REPORT_TEMPLATES[props.document]}
    selectedId={selected}
    onCommit={commit}
    onSelect={setSelected}
  />
</div>
```

`commit` remains `(next, options) => { editor.commit(next, options); setError(null); setMessage(null); }`.
`ElementPalette.onCommit` accepts the two-argument `TemplateCommit` because
it ignores the second parameter.

- [ ] **Step 6: Update the v1-only tests**

Move `layout.test.ts` to `layout-v1.test.ts`, then change its two imports:

```ts
import { DEFAULT_REPORT_TEMPLATES_V1 } from "./defaults-v1";
import { layoutTemplateV1 as layoutTemplate } from "./layout-v1";
```

Replace every other `DEFAULT_REPORT_TEMPLATES` reference in that file with
`DEFAULT_REPORT_TEMPLATES_V1`.

Rewrite `defaults.test.ts` for v2:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import { validateReportTemplateV2 } from "./schema-v2";
import { templatesEqual } from "./schema";
import { REPORT_DOCUMENTS } from "./types";

describe("default templates — v2", () => {
  it("validates and round-trips every document", () => {
    for (const doc of REPORT_DOCUMENTS) {
      const template = DEFAULT_REPORT_TEMPLATES[doc];
      expect(template.version, doc).toBe(2);
      expect(validateReportTemplateV2(template, doc).ok, doc).toBe(true);
      const roundTrip = validateReportTemplateV2(
        JSON.parse(JSON.stringify(template)),
        doc,
      );
      expect(roundTrip.ok && templatesEqual(roundTrip.template, template), doc).toBe(true);
    }
  });

  it("keeps unique elements unique and uses the four-column receipt table", () => {
    const receipt = DEFAULT_REPORT_TEMPLATES.receipt;
    for (const type of ["logo", "itemTable", "summary"] as const) {
      expect(receipt.elements.filter((element) => element.type === type), type).toHaveLength(1);
    }
    const table = receipt.elements.find((element) => element.type === "itemTable");
    expect(table?.type === "itemTable" && table.columns.map((column) => column.key)).toEqual([
      "name",
      "qty",
      "unitPrice",
      "lineTotal",
    ]);
  });
});
```

Update `schema.test.ts` so it keeps testing the v1 validator:

```ts
import { DEFAULT_REPORT_TEMPLATES_V1 } from "./defaults-v1";
import {
  parseReportTemplateJson,
  templatesEqual,
  validateReportTemplateV1 as validateReportTemplate,
} from "./schema";
```

Replace the two `DEFAULT_REPORT_TEMPLATES.shift` references in the
prototype-id test with `DEFAULT_REPORT_TEMPLATES_V1.shift`. Leave every other
assertion untouched — `validReceipt` is a v1 fixture and still validates.

In `useTemplateEditor.test.tsx`, replace the v1 footer mutation with these
helpers and use them everywhere the old test touched `footer.lines[0]`:

```ts
function withFooterText(template: ReportTemplate, text: string): ReportTemplate {
  return {
    ...template,
    elements: template.elements.map((element) =>
      element.type === "text" && element.id === "el_footer_0"
        ? { ...element, text }
        : element,
    ),
  };
}

function footerText(template: ReportTemplate): string {
  const element = template.elements.find((entry) => entry.id === "el_footer_0");
  return element?.type === "text" ? element.text : "";
}
```

- `template.footer.lines = [{ text }]` → `template = withFooterText(template, text)`
- `next.footer.lines[0]!.text = "..."` → `next = withFooterText(next, "...")`
- every `result.current.template.footer.lines[0]!.text` assertion → `footerText(result.current.template)`
- the external-prop cases mutate a clone with `withFooterText` before passing it to `renderHook`

Add the v1 migration case to `store.test.ts`:

```ts
it("migrates a stored v1 template to v2", () => {
  state.values.set(
    "report_template.receipt",
    JSON.stringify(DEFAULT_REPORT_TEMPLATES_V1.receipt),
  );
  const loaded = loadReportTemplate("receipt");
  expect(loaded.version).toBe(2);
  expect(templatesEqual(loaded, DEFAULT_REPORT_TEMPLATES.receipt)).toBe(true);
});
```

Import `DEFAULT_REPORT_TEMPLATES_V1` from `./defaults-v1` and
`templatesEqual` from `./schema` in that test file.

- [ ] **Step 7: Rewrite the admin integration test**

```tsx
// components/admin/report-design/ReportDesignAdmin.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";
import { DEFAULT_REPORT_TEMPLATES_V1 } from "@/lib/print/templates/defaults-v1";
import { buildSampleDocuments, sampleSettings } from "@/lib/print/templates/sample";
import type { ReportTemplateV2 } from "@/lib/print/templates/types";
import { ReportDesignAdmin } from "./ReportDesignAdmin";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

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
const headerId = receiptDefault.elements.find((element) => element.type === "text")!.id;
const headerDefault =
  receiptDefault.elements.find((element) => element.id === headerId)?.type === "text"
    ? (receiptDefault.elements.find((element) => element.id === headerId) as { text: string }).text
    : "";
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
      template={receiptDefault}
      templateJson={JSON.stringify(receiptDefault, null, 2)}
      isDefault
      sample={sample}
      printers={printerList}
    />,
  );
}

function selectHeader() {
  fireEvent.click(document.querySelector(`[data-element-id="${headerId}"]`)!);
}

function editHeaderText(text: string) {
  selectHeader();
  fireEvent.change(screen.getByLabelText("النص"), { target: { value: text } });
}

function savedTemplate(callIndex = 0): ReportTemplateV2 {
  const [, json] = actions.saveReportTemplate.mock.calls[callIndex]!;
  return JSON.parse(json as string) as ReportTemplateV2;
}

function savedHeaderText(): string {
  const element = savedTemplate().elements.find((entry) => entry.id === headerId);
  return element?.type === "text" ? element.text : "";
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReportDesignAdmin", () => {
  it("renders the grid, palette, inspector, and toolbar", () => {
    renderAdmin();
    expect(screen.getByTestId("grid-canvas")).toBeTruthy();
    expect(screen.getByText(/خصائص/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "حفظ التصميم" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "بيانات تجريبية" })).toBeTruthy();
  });

  it("edits a text element and saves the v2 template", async () => {
    renderAdmin();
    editHeaderText("مرحباً");
    fireEvent.click(screen.getByRole("button", { name: "حفظ التصميم" }));

    expect(actions.saveReportTemplate).toHaveBeenCalledTimes(1);
    expect(actions.saveReportTemplate.mock.calls[0]![0]).toBe("receipt");
    expect(savedTemplate().version).toBe(2);
    expect(savedHeaderText()).toBe("مرحباً");
    expect(await screen.findByText("تم حفظ التصميم")).toBeTruthy();
  });

  it("undoes and redoes an edit", () => {
    renderAdmin();
    editHeaderText("مرحباً");
    fireEvent.click(screen.getByRole("button", { name: "تراجع" }));
    expect(screen.getByLabelText("النص")).toHaveValue(headerDefault);
    fireEvent.click(screen.getByRole("button", { name: "إعادة" }));
    expect(screen.getByLabelText("النص")).toHaveValue("مرحباً");
  });

  it("switches between sample and blank data", () => {
    renderAdmin();
    expect(screen.getByTestId("print-preview").textContent).toContain("كابتشينو");
    fireEvent.click(screen.getByRole("button", { name: "بيانات فارغة" }));
    expect(screen.getByTestId("print-preview").textContent).not.toContain("كابتشينو");
  });

  it("rejects invalid raw JSON without applying it", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    fireEvent.change(screen.getByLabelText("محرر JSON"), { target: { value: "{" } });
    fireEvent.click(screen.getByRole("button", { name: "تطبيق JSON" }));
    expect(screen.getByText("ملف التصميم ليس JSON صالحاً")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "حفظ التصميم" }));
    expect(savedHeaderText()).toBe(headerDefault);
  });

  it("migrates pasted v1 JSON and reports it", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    fireEvent.change(screen.getByLabelText("محرر JSON"), {
      target: { value: JSON.stringify(DEFAULT_REPORT_TEMPLATES_V1.receipt) },
    });
    fireEvent.click(screen.getByRole("button", { name: "تطبيق JSON" }));
    expect(screen.getByText("تم ترحيل تصميم الإصدار الأول وتطبيقه")).toBeTruthy();
    expect(
      (screen.getByLabelText("محرر JSON") as HTMLTextAreaElement).value,
    ).toContain('"version": 2');
  });

  it("imports a .fprep file into the editor", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    const file = new File(
      [
        JSON.stringify({
          ...receiptDefault,
          labels: { ...receiptDefault.labels, orderNo: "طلب" },
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
    const file = new File(["{", ""], "broken.fprep", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("استيراد ملف .fprep"), {
      target: { files: [file] },
    });
    expect(await screen.findByText("ملف التصميم ليس JSON صالحاً")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "حفظ التصميم" }));
    expect(savedHeaderText()).toBe(headerDefault);
  });

  it("confirms before resetting and restores the default", async () => {
    renderAdmin();
    editHeaderText("مرحباً");
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    fireEvent.click(screen.getByRole("button", { name: "استعادة الافتراضي" }));
    expect(screen.getByText("استعادة التصميم الافتراضي؟")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الاستعادة" }));
    expect(actions.resetReportTemplate).toHaveBeenCalledWith("receipt");
    await waitFor(() =>
      expect(screen.getByLabelText("النص")).toHaveValue(headerDefault),
    );
  });

  it("sends the current design and printer to the test print action", async () => {
    renderAdmin();
    editHeaderText("مرحباً");
    fireEvent.change(screen.getByLabelText("طابعة الاختبار"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "طباعة تجريبية" }));

    const [doc, json, printerId] = actions.testPrintReportTemplate.mock.calls[0]!;
    expect(doc).toBe("receipt");
    expect(printerId).toBe(5);
    const sent = JSON.parse(json as string) as ReportTemplateV2;
    expect(sent.version).toBe(2);
    expect(
      sent.elements.find((element) => element.id === headerId),
    ).toMatchObject({ type: "text", text: "مرحباً" });
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
    editHeaderText("مرحباً");
    fireEvent.click(screen.getByRole("tab", { name: "تذكرة المطبخ" }));
    expect(screen.getByRole("heading", { name: "تغييرات غير محفوظة" })).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "تبديل" }));
    expect(router.push).toHaveBeenCalledWith("/admin/reports/design?doc=kitchen");
  });
});

describe("ReportDesignAdmin guards", () => {
  it("warns before leaving with unsaved changes", () => {
    renderAdmin();
    editHeaderText("مرحباً");
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

  it("does not save twice while a save is in flight", async () => {
    actions.saveReportTemplate.mockClear();
    renderAdmin();
    editHeaderText("مرحباً");
    const button = screen.getByRole("button", { name: "حفظ التصميم" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByText("تم حفظ التصميم")).toBeTruthy();
    expect(actions.saveReportTemplate).toHaveBeenCalledTimes(1);
  });

  it("does not test print twice while a print is in flight", async () => {
    actions.testPrintReportTemplate.mockClear();
    renderAdmin();
    const button = screen.getByRole("button", { name: "طباعة تجريبية" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByText("تم الإرسال")).toBeTruthy();
    expect(actions.testPrintReportTemplate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 8: Delete the v1 editor and obsolete modules**

Delete `blocks.ts`, `blocks.test.ts`, `CanvasBlock.tsx`, `CanvasLines.tsx`,
`ReportCanvas.tsx`, `BlockInspector.tsx`, `ReportCanvas.test.tsx`, and
`BlockInspector.test.tsx`. Confirm no imports remain:

Run: `grep -rn "templates/blocks\|./blocks\|CanvasBlock\|ReportCanvas\|BlockInspector" lib components app`
Expected: no matches.

- [ ] **Step 9: Run the full verification**

Run: `npx vitest run`
Expected: PASS — all suites, including migration, parity, element ops, editor, and data tests.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx eslint lib/print/templates components/admin/report-design app/actions/report-templates.ts "app/admin/(panel)/reports/design/page.tsx"`
Expected: no new errors.

Run: `npm run build`
Expected: build completes and writes `.next/BUILD_ID`.

- [ ] **Step 10: Owner review/commit checkpoint**

Show the full diff and the verification output. Do not commit.

---

### Task 11: Documentation, installer, and owner acceptance

**Files:**
- Modify: `README.md` (report designer section)
- Modify: `PROJECT_INDEX.md` (templates and designer lines)
- Create: `docs/worklog/2026-11-01-grid-report-designer.md`

**Interfaces:**
- Consumes: the completed v2 implementation.
- Produces: user-facing documentation, a worklog, and a tested installer.

- [ ] **Step 1: Update the README designer section**

Replace the existing «تصميم التقارير» bullets with:

```markdown
- يعرض المحرر ورقة الحساب الحقيقية كشبكة من العناصر: اسحب أي عنصر (نص، حقل، شعار، QR، فاصل، جدول أصناف، قسم، إجمالي) إلى الموضع المطلوب، أو استخدم الأسهم لتحريكه خلية واحدة.
- النص يمكن أن يحتوي `{{title}}` و`{{field.waiter}}` وغيرهما؛ قائمة **إدراج بيانات** تضيف الرموز المتاحة. يمكن أن يتشارك النص والحقول الصف الواحد، بينما تحجز العناصر الأخرى صفاً كاملاً.
- الفواصل اختيارية، ويمكن ربطها بعناصر معينة لتختفي عندما تكون كلها فارغة.
- عنصر **رمز QR** متاح في إيصال الدفع فقط ويحتوي رقم الفاتورة والإجمالي والوقت، مع الشعار كصورة وحيدة.
- التصاميم القديمة (الإصدار الأول) تُرحَّل تلقائياً عند الفتح أو الاستيراد وتُحفظ بصيغة الإصدار الثاني.
- أيقونة العين تُخفي العنصر من الطباعة دون حذفه، و**تكرار** و**حذف** متاحان للنصوص والفواصل.
- **تراجع/إعادة** واختصارات Ctrl+Z / Ctrl+Y متاحة، مع التبديل بين بيانات تجريبية وفارغة.
- اللوحة **متقدم** تحتوي JSON الكامل واستيراد/تصدير `.fprep` و**استعادة الافتراضي**.
- التصميم يُحفظ في قاعدة البيانات (`report_template.<document>`) ولا يتأثر بتحديث التطبيق.
- **طباعة تجريبية** ترسل معاينة إلى الطابعة المختارة.
```

- [ ] **Step 2: Update `PROJECT_INDEX.md`**

Replace the `print/templates/` line with:

```markdown
- **`print/templates/`**: `types.ts` + `schema.ts` (`.fprep` v1/v2 dispatch; v1 stored/imported designs migrate to v2), `schema-common.ts` + `schema-v2.ts` (strict grid validation: overlap, block-alone rows, duplicate limits, separator references), `elements.ts` (element types/limits/id helpers), `migrate.ts` (deterministic v1→v2 mapping), `defaults-v1.ts` + `defaults-v2.ts` (parity oracle and live defaults), `layout-core.ts` + `layout-v1.ts` + `layout-v2.ts` (shared text/column math, v1 oracle, grid row-flow renderer), `qr-payload.ts` + `qr.ts` (receipt QR payload/raster with bounded cache), `element-ops.ts` (pure add/move/delete/update editor operations), `columns.ts`, `data.ts`/`sample.ts`, `build.ts`/`render.ts` (ESC/POS bytes, Arabic raster, logo/QR), `store.ts` (load/persist/reset under `report_template.<document>` with default fallback).
```

Replace the designer line with:

```markdown
- **`app/admin/(panel)/reports/design/` + `components/admin/report-design/`**: v2 grid report designer (paper-shaped grid with drag/nudge, palette gated by document specs, per-element inspector, QR/logo media, explicit separators with `hideWhenEmptyOf`, undo/redo, sample/blank switch, advanced JSON with v1 migration on paste/import, `.fprep` import/export, reset, test print).
```

- [ ] **Step 3: Write the worklog**

Create `docs/worklog/2026-11-01-grid-report-designer.md` with these sections
and facts (no placeholders):

```markdown
# Grid report designer (v2) — 2026-11-01

## What changed

- `.fprep` v2 replaces fixed blocks with `elements[]` on a 32/48-column grid:
  text, field, logo, QR (receipt only), separator, itemTable, section, summary.
- Text/field share rows; every other element is alone in its row; blocks expand
  and push later rows down at print time.
- Deterministic v1→v2 migration (`el_logo`, `el_header_<i>`, `el_field_<id>`,
  `el_items`, `el_section_<id>`, `el_summary`, `el_footer_<i>`, `el_sep_*`).
  Stored v1 designs and imported v1 `.fprep` files migrate on load.
- Receipt QR encodes `INV-<invoiceId>|<summary>|<time>` via `qrcode-generator`,
  pngjs, and the existing ESC/POS raster path; cache capped at 64 payloads.
- Logo and QR offsets use a padded raster (`shiftRaster`) so images can sit at
  any column; the full-width path is byte-identical to v1.
- Editor: GridCanvas with real `layoutTemplateV2` preview, drag with snap and
  Arabic rejection hint, arrow/Delete keys, palette, per-type inspector,
  explicit separator references, duplicate (text/separator), undo/redo.
- Schema dispatch accepts v1 (validate → migrate → validate) and v2; exported
  `.fprep` is always v2.

## Locked decisions

- One element per field, logo, QR, item table, summary, and section id.
- QR payload uses existing data only (invoice id, total, time).
- Logo only for images; no arbitrary image upload.
- Line-based ESC/POS stays; only logo and QR are raster blocks.
- Migrated defaults must be byte-identical to v1 with the same logo/sample.

## Verification

- Parity suite compares `renderLayout(layoutTemplateV1(...))` with
  `layoutTemplateV2(...)` for all five defaults with and without logo.
- `npx vitest run`, `npx tsc --noEmit`, scoped `npx eslint`, `npm run build`.
- Installer rebuilt with `scripts/build-installer.ps1 -SkipNpm`.
- Owner checks: install, print all five documents on receipt and kitchen
  printers, Arabic + QR scan, restart, and confirm a previously saved v1 design
  still prints the same and saves as v2.
```

- [ ] **Step 4: Run the final verification again**

Run: `npx vitest run`
Expected: PASS.

Run: `npx tsc --noEmit && npm run build`
Expected: clean type check and successful build.

- [ ] **Step 5: Build the installer**

Run in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -SkipNpm
```

Expected: `release/installer/Fast-POS-Setup-<version>.exe` is written. Use
`-SkipNpm` because `npm ci` in the script needs MSVC on this machine (see the
installer-build note in project memory).

- [ ] **Step 6: Owner acceptance (agent does not log in or approve UAC)**

Hand the installer to the owner and ask them to:

1. Install over the current build without deleting data.
2. Open الإدارة ← تصميم التقارير and confirm each of the five tabs opens.
3. Print a receipt with logo and QR; scan the QR and verify it contains the
   invoice id, total, and time.
4. Print a kitchen ticket after adding `السفرادجي: {{field.waiter}}` to a text
   element; verify Arabic and kitchen column widths.
5. Print shift, items, and sales reports; confirm totals and separators.
6. Restart the app and repeat one test print.
7. Confirm a design saved before the upgrade printed unchanged, then save it
   and confirm it reopened as v2.

- [ ] **Step 7: Owner review/commit checkpoint**

Show the docs diff and installer path. The owner commits.

---

## Execution Notes

- Execute tasks in order. Tasks 1–9 must leave the app on v1 and the whole suite
  green; Task 10 is the only cutover.
- After each task, stop for owner review. The owner performs every git write.
- If parity fails in Task 7 or Task 10, fix the migration or renderer; never
  relax the byte comparison.
- If a component test fails only because pointer capture is missing in jsdom,
  keep the `try/catch` around `setPointerCapture` rather than mocking the DOM.


