# Report designs (`.fprep`) and the four-column receipt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive all five printed documents from editable `.fprep` JSON templates stored in `app_settings`, render the customer receipt items as a four-column table, and add an admin designer with live preview, test print, import/export, raw JSON editing, and reset.

**Architecture:** A pure isomorphic template layer (`types` → `schema` → `defaults` → `columns` → `layout` → `data`/`sample`) produces a `LayoutLine[]`; a server-only renderer turns those lines into ESC/POS bytes; async builders load the stored template, adapt the document data, fetch the logo, and render. The admin page runs the same `layout` code in the browser for previews and calls admin-only server actions to persist.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Drizzle + better-sqlite3, vitest + Testing Library, `@napi-rs/canvas`, `pngjs`, `iconv-lite`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-report-designs-design.md`

## Global Constraints

- **Do not create git commits.** The owner commits. Never run `git add`, `git commit`, `git push`, `git reset`, or `git stash` for this work.
- **Do not revert the `package.json` edit** — `installer:build` must keep calling `scripts/build-installer.ps1` without `-SkipNpm`. For direct rebuilds use `npm run build` then `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -SkipNpm`.
- No new npm dependencies. Use the existing canvas/pngjs/iconv stack.
- Node-only modules (`@napi-rs/canvas`, `fs`, `better-sqlite3`, `lib/print/logo`, `lib/print/primitives`, `lib/print/text-raster`, template `store`/`render`/`build`) must never be imported by a `"use client"` module. Client-safe modules are `types`, `schema`, `defaults` only if needed, `columns`, `layout`, `data`, `sample`.
- Every user-visible string is Arabic. Validation messages include the JSON path and stay short.
- Printing never fails because of a bad template: `loadReportTemplate` falls back to the built-in default and logs one warning per document per process.
- Tests must not touch the live `data/pos.db`. Mock `@/lib/settings` and/or pass template overrides. Never run backup restore against the live database.
- Existing print tests are ported to the new builders — none may be deleted to make the suite pass.
- Formatting: follow existing project style (2-space indent, double quotes, semicolons, named exports).
- Verification commands: `npx vitest run <paths>`, `npx tsc --noEmit`, `npm run build`, `npm run lint`.

---

## File map

| Path | Responsibility |
| --- | --- |
| `lib/print/templates/types.ts` | Template/document/line/data types + `REPORT_DOCUMENTS` |
| `lib/print/templates/schema.ts` | Whitelists (`DOCUMENT_SPECS`), strict validation, JSON parsing, control-char stripping |
| `lib/print/templates/defaults.ts` | Built-in `.fprep` defaults for all five documents |
| `lib/print/templates/columns.ts` | Weight → character/pixel width distribution, RTL bounds |
| `lib/print/templates/layout.ts` | Pure `(template, DocumentData) → LayoutLine[]` |
| `lib/print/templates/data.ts` | Print-data → `DocumentData` adapters |
| `lib/print/templates/sample.ts` | Fixed sample data for every document |
| `lib/print/primitives.ts` | ESC/POS byte helpers moved out of `escpos.ts` |
| `lib/print/text-raster.ts` | Existing text raster + new left align + `columnsToEscPos` / `columnsToText` |
| `lib/print/logo.ts` | `getReceiptLogoEscPos(maxWidth?)` with width-aware cache |
| `lib/print/templates/render.ts` | `LayoutLine[]` → ESC/POS bytes |
| `lib/print/templates/store.ts` | Load/save/delete stored templates, default fallback, warning once |
| `lib/print/templates/build.ts` | Async document builders + sample-text builder |
| `lib/settings.ts` | Export `getSettingValue` / `setSettingValue` / `deleteSettingValue` |
| `lib/print/checkout-bytes.ts` | Delegates to `buildReceiptEscPos` |
| `app/actions/orders.ts`, `shifts.ts`, `reports.ts` | Await the new builders |
| `app/actions/report-templates.ts` | Save/reset/test-print server actions with audits |
| `app/admin/(panel)/reports/design/page.tsx` | Server page: templates, samples, printers |
| `components/admin/report-design/ReportDesignAdmin.tsx` | Designer shell, state, toolbar, save/reset/import/export |
| `components/admin/report-design/TemplateTree.tsx` | Element tree |
| `components/admin/report-design/TemplateProperties.tsx` | Properties pane |
| `components/admin/report-design/ReportPreview.tsx` | 384 px preview |
| `components/AdminNav.tsx` | Nav entry تصميم التقارير |
| `lib/print/escpos.ts` | Keeps only the printer diagnostic + kitchen chunk helpers |

---

### Task 1: Template types and schema validation

**Files:**
- Create: `lib/print/templates/types.ts`
- Create: `lib/print/templates/schema.ts`
- Test: `lib/print/templates/schema.test.ts`

**Interfaces:**
- Produces: `REPORT_DOCUMENTS`, `ReportDocument`, `isReportDocument`, `ReportTemplate`, `DocumentData`, `LayoutLine`, `TemplateLine`, `TemplateColumn`, `Align`, `TextSize`, `DOCUMENT_SPECS`, `validateReportTemplate`, `parseReportTemplateJson`, `ValidationResult`.
- `parseReportTemplateJson(json: string, expectedDoc?: ReportDocument): ValidationResult` where `ValidationResult = { ok: true; template: ReportTemplate } | { ok: false; errors: string[] }`.

- [ ] **Step 1: Write the failing schema test**

Create `lib/print/templates/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseReportTemplateJson, validateReportTemplate } from "./schema";
import type { ReportTemplate } from "./types";

export const validReceipt: ReportTemplate = {
  format: "fastpos-report",
  version: 1,
  document: "receipt",
  paper: { columns: 32 },
  header: {
    logo: { show: true, align: "center", maxWidth: 256 },
    lines: [
      { text: "{{title}}", align: "center", bold: true, size: "xlarge" },
      { text: "{{subtitle}}", align: "center" },
    ],
  },
  fields: { show: ["orderNo", "invoiceId", "table"], separator: true },
  items: {
    show: true,
    title: "الأصناف",
    header: true,
    showNote: true,
    separator: true,
    columns: [
      { key: "name", label: "الصنف", width: 11 },
      { key: "qty", label: "الكمية", width: 4, align: "center" },
      { key: "unitPrice", label: "السعر", width: 7, align: "center" },
      { key: "lineTotal", label: "الإجمالي", width: 8, align: "center" },
    ],
  },
  sections: [],
  summary: { show: true, label: "الإجمالي", separator: true },
  labels: { orderNo: "رقم الطلب", invoiceId: "فاتورة", table: "الطاولة" },
  footer: { separator: false, lines: [{ text: "{{footer}}", align: "center" }] },
};

function clone(value: ReportTemplate): ReportTemplate {
  return JSON.parse(JSON.stringify(value)) as ReportTemplate;
}

describe("validateReportTemplate", () => {
  it("accepts a valid receipt", () => {
    const result = validateReportTemplate(validReceipt, "receipt");
    expect(result.ok).toBe(true);
  });

  it("rejects a document mismatch and an unknown document", () => {
    expect(validateReportTemplate(validReceipt, "sales")).toMatchObject({
      ok: false,
    });
    expect(
      validateReportTemplate({ ...validReceipt, document: "invoice" }),
    ).toMatchObject({ ok: false });
  });

  it("rejects unknown keys, placeholders, and ids", () => {
    const unknownKey = clone(validReceipt) as ReportTemplate & {
      surprise?: boolean;
    };
    unknownKey.surprise = true;
    expect(validateReportTemplate(unknownKey).ok).toBe(false);

    const badPlaceholder = clone(validReceipt);
    badPlaceholder.header.lines[0]!.text = "{{nope}}";
    expect(validateReportTemplate(badPlaceholder)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([expect.stringContaining("{{nope}}")]),
    });

    const badField = clone(validReceipt);
    badField.fields.show = ["orderNo", "nickname"] as never;
    expect(validateReportTemplate(badField).ok).toBe(false);

    const badColumn = clone(validReceipt);
    badColumn.items.columns[0]!.key = "cost";
    expect(validateReportTemplate(badColumn).ok).toBe(false);

    const badHeaderSeparator = clone(validReceipt) as ReportTemplate & {
      header: { separator?: unknown };
    };
    badHeaderSeparator.header.separator = "yes";
    expect(validateReportTemplate(badHeaderSeparator)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        "header.separator يجب أن يكون true أو false",
      ]),
    });

    const duplicateField = clone(validReceipt);
    duplicateField.fields.show = ["orderNo", "orderNo"] as never;
    expect(validateReportTemplate(duplicateField)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.stringContaining("orderNo مكرر"),
      ]),
    });
  });

  it("rejects bad widths, too many lines, and a kitchen summary", () => {
    const badWidth = clone(validReceipt);
    badWidth.items.columns[0]!.width = 0;
    expect(validateReportTemplate(badWidth)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.stringContaining("items.columns[0].width"),
      ]),
    });

    const tooMany = clone(validReceipt);
    tooMany.header.lines = Array.from({ length: 7 }, () => ({ text: "x" }));
    expect(validateReportTemplate(tooMany).ok).toBe(false);

    const kitchen = clone(validReceipt);
    kitchen.document = "kitchen";
    kitchen.sections = [];
    kitchen.items.columns = [
      { key: "name", label: "الصنف", width: 26 },
      { key: "qty", label: "الكمية", width: 6 },
    ];
    kitchen.summary = { show: true, label: "الإجمالي" };
    kitchen.labels = { orderNo: "الطلب" };
    kitchen.fields.show = ["orderNo"];
    expect(validateReportTemplate(kitchen, "kitchen")).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["summary.show غير مسموح لهذا التقرير"]),
    });
  });

  it("strips control characters before returning the template", () => {
    const dirty = clone(validReceipt);
    dirty.header.lines[1]!.text = "إيصال\u001b[31m الدفع";
    const result = validateReportTemplate(dirty);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template.header.lines[1]!.text).toBe("إيصال[31m الدفع");
    }
  });

  it("rejects JSON larger than 100 KB", () => {
    const huge = JSON.stringify({
      ...validReceipt,
      header: {
        ...validReceipt.header,
        lines: [{ text: "x".repeat(101 * 1024) }],
      },
    });
    expect(parseReportTemplateJson(huge)).toMatchObject({
      ok: false,
      errors: ["ملف التصميم أكبر من 100 كيلوبايت"],
    });
  });

  it("rejects broken JSON with an Arabic message", () => {
    const result = parseReportTemplateJson("{");
    expect(result).toMatchObject({
      ok: false,
      errors: ["ملف التصميم ليس JSON صالحاً"],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/print/templates/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Create `lib/print/templates/types.ts`**

```ts
export const REPORT_DOCUMENTS = [
  "receipt",
  "kitchen",
  "shift",
  "items",
  "sales",
] as const;

export type ReportDocument = (typeof REPORT_DOCUMENTS)[number];

export function isReportDocument(value: unknown): value is ReportDocument {
  return (
    typeof value === "string" &&
    (REPORT_DOCUMENTS as readonly string[]).includes(value)
  );
}

export type Align = "right" | "center" | "left";
export type TextSize = "small" | "normal" | "large" | "xlarge";

export type TemplateLine = {
  text: string;
  align?: Align;
  bold?: boolean;
  size?: TextSize;
};

export type TemplateColumn = {
  key: string;
  label: string;
  width: number;
  align?: Align;
  bold?: boolean;
  size?: TextSize;
};

export type TemplateSection = {
  id: string;
  title: string;
  show: boolean;
  separator?: boolean;
  columns?: TemplateColumn[];
};

export type ReportTemplate = {
  format: "fastpos-report";
  version: 1;
  document: ReportDocument;
  paper: { columns: 32 | 48 };
  header: {
    logo: { show: boolean; align?: Align; maxWidth?: number };
    lines: TemplateLine[];
    separator?: boolean;
  };
  fields: { show: string[]; separator?: boolean };
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
  footer: { separator?: boolean; lines: TemplateLine[] };
};

export type SectionKind = "kv" | "table" | "groupedTable";

export type DocumentSectionData = {
  kind: SectionKind;
  rows: Array<{ labelId?: string; label?: string; value: string; bold?: boolean }>;
  table?: Array<Record<string, string>>;
  groups?: Array<{
    label: string;
    rows: Array<Record<string, string>>;
    total: string;
  }>;
  emptyText?: string;
};

export type DocumentData = {
  title: string;
  subtitle: string;
  venue: string;
  brandPhone: string;
  brandAddress: string;
  footer: string;
  status: string;
  logoAvailable: boolean;
  fields: Record<string, string | null>;
  items: Array<Record<string, string>>;
  itemNotes: Array<string | null>;
  sections: Record<string, DocumentSectionData>;
  summary: string | null;
};

export type LayoutLine =
  | { kind: "text"; text: string; align: Align; bold: boolean; size: TextSize }
  | { kind: "separator" }
  | { kind: "logo"; align: Align; maxWidth: number }
  | {
      kind: "columns";
      widths: number[];
      cells: Array<{ text: string; align: Align; bold: boolean; size: TextSize }>;
    };
```

- [ ] **Step 4: Create `lib/print/templates/schema.ts`**

```ts
import {
  isReportDocument,
  type Align,
  type ReportDocument,
  type ReportTemplate,
  type SectionKind,
  type TemplateColumn,
  type TemplateLine,
  type TextSize,
} from "./types";

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

const BASE_PLACEHOLDERS = ["title", "venue"] as const;

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
    placeholders: [...BASE_PLACEHOLDERS, "subtitle", "brand.phone", "brand.address", "footer"],
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

export type ValidationResult =
  | { ok: true; template: ReportTemplate }
  | { ok: false; errors: string[] };

const MAX_JSON_BYTES = 100 * 1024;
const MAX_LINES = 6;
const MAX_COLUMNS = 6;
const MAX_TEXT = 200;
const MAX_TOTAL_LINES = 40;
const ALIGNS: readonly Align[] = ["right", "center", "left"];
const SIZES: readonly TextSize[] = ["small", "normal", "large", "xlarge"];
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clean(value: string): string {
  return value.replace(CONTROL_CHARS, "").trim();
}

function checkKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${path}.${key} غير معروف`);
  }
}

function readString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  options: { required?: boolean; max?: number } = {},
): string {
  const required = options.required ?? true;
  const max = options.max ?? MAX_TEXT;
  const raw = value[key];
  if (raw === undefined || raw === null) {
    if (required) errors.push(`${path} مطلوب`);
    return "";
  }
  if (typeof raw !== "string") {
    errors.push(`${path} يجب أن يكون نصاً`);
    return "";
  }
  const text = clean(raw);
  if (required && !text) errors.push(`${path} مطلوب`);
  if (text.length > max) errors.push(`${path} أطول من ${max} حرفاً`);
  return text;
}

function readBool(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  fallback: boolean,
): boolean {
  const raw = value[key];
  if (raw === undefined) return fallback;
  if (typeof raw !== "boolean") {
    errors.push(`${path} يجب أن يكون true أو false`);
    return fallback;
  }
  return raw;
}

function readAlign(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): Align | undefined {
  const raw = value[key];
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !ALIGNS.includes(raw as Align)) {
    errors.push(`${path} غير صالح`);
    return undefined;
  }
  return raw as Align;
}

function readSize(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): TextSize | undefined {
  const raw = value[key];
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !SIZES.includes(raw as TextSize)) {
    errors.push(`${path} غير صالح`);
    return undefined;
  }
  return raw as TextSize;
}

function checkPlaceholders(
  text: string,
  spec: DocumentSpec,
  path: string,
  errors: string[],
) {
  for (const match of text.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)) {
    const token = match[1]!;
    if (!spec.placeholders.includes(token)) {
      errors.push(`${path}: {{${token}}} غير مدعوم في هذا التقرير`);
    }
  }
  const leftovers = text.replace(/\{\{\s*[^}\s]+\s*\}\}/g, "");
  if (/[{}]/.test(leftovers)) errors.push(`${path}: أقواس غير صالحة`);
}

function readLines(
  value: unknown,
  path: string,
  spec: DocumentSpec,
  errors: string[],
): TemplateLine[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(`${path} يجب أن يكون قائمة`);
    return [];
  }
  if (value.length > MAX_LINES) errors.push(`${path} يتجاوز ${MAX_LINES} أسطر`);
  return value.slice(0, MAX_LINES).map((entry, index) => {
    const at = `${path}[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${at} غير صالح`);
      return { text: "" };
    }
    checkKeys(entry, ["text", "align", "bold", "size"], at, errors);
    const text = readString(entry, "text", `${at}.text`, errors, {
      required: false,
    });
    checkPlaceholders(text, spec, `${at}.text`, errors);
    const line: TemplateLine = { text };
    const align = readAlign(entry, "align", `${at}.align`, errors);
    if (align) line.align = align;
    if (entry.bold !== undefined) {
      line.bold = readBool(entry, "bold", `${at}.bold`, errors, false);
    }
    const size = readSize(entry, "size", `${at}.size`, errors);
    if (size) line.size = size;
    return line;
  });
}

function readWidth(
  value: Record<string, unknown>,
  path: string,
  errors: string[],
): number {
  const raw = value.width;
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > 64
  ) {
    errors.push(`${path}.width غير صالح`);
    return 1;
  }
  return raw;
}

function readColumns(
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
  errors: string[],
): TemplateColumn[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} مطلوب`);
    return [];
  }
  if (value.length > MAX_COLUMNS) {
    errors.push(`${path} يتجاوز ${MAX_COLUMNS} أعمدة`);
  }
  const seen = new Set<string>();
  return value.slice(0, MAX_COLUMNS).map((entry, index) => {
    const at = `${path}[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${at} غير صالح`);
      return { key: "", label: "", width: 1 };
    }
    checkKeys(entry, ["key", "label", "width", "align", "bold", "size"], at, errors);
    const key = readString(entry, "key", `${at}.key`, errors);
    if (key && !allowedKeys.includes(key)) {
      errors.push(`${at}.key غير معروف`);
    }
    if (key && seen.has(key)) errors.push(`${at}.key مكرر`);
    seen.add(key);
    const label = readString(entry, "label", `${at}.label`, errors);
    const width = readWidth(entry, at, errors);
    const column: TemplateColumn = { key, label, width };
    const align = readAlign(entry, "align", `${at}.align`, errors);
    if (align) column.align = align;
    if (entry.bold !== undefined) {
      column.bold = readBool(entry, "bold", `${at}.bold`, errors, false);
    }
    const size = readSize(entry, "size", `${at}.size`, errors);
    if (size) column.size = size;
    return column;
  });
}

function readSections(
  value: unknown,
  path: string,
  doc: ReportDocument,
  spec: DocumentSpec,
  errors: string[],
): ReportTemplate["sections"] {
  if (!Array.isArray(value)) {
    errors.push(`${path} يجب أن يكون قائمة`);
    return [];
  }
  const seen = new Set<string>();
  const sections: ReportTemplate["sections"] = [];
  value.forEach((entry, index) => {
    const at = `${path}[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${at} غير صالح`);
      return;
    }
    checkKeys(entry, ["id", "title", "show", "separator", "columns"], at, errors);
    const id = readString(entry, "id", `${at}.id`, errors);
    const sectionSpec = spec.sections[id];
    if (!sectionSpec) {
      errors.push(`${at}.id غير معروف لهذا التقرير`);
      return;
    }
    if (seen.has(id)) errors.push(`${at}.id مكرر`);
    seen.add(id);
    const title = readString(entry, "title", `${at}.title`, errors, {
      required: false,
    });
    const show = readBool(entry, "show", `${at}.show`, errors, false);
    const section: ReportTemplate["sections"][number] = { id, title, show };
    section.separator = readBool(
      entry,
      "separator",
      `${at}.separator`,
      errors,
      true,
    );
    if (sectionSpec.kind === "kv") {
      if (entry.columns !== undefined) {
        errors.push(`${at}.columns غير مسموح لقسم نصي`);
      }
    } else {
      const columns = readColumns(
        entry.columns,
        `${at}.columns`,
        sectionSpec.columnKeys,
        errors,
      );
      if (columns.length === 0) errors.push(`${at}.columns مطلوب`);
      section.columns = columns;
    }
    sections.push(section);
  });
  if ((doc === "receipt" || doc === "kitchen") && sections.length > 0) {
    errors.push(`${path} يجب أن تكون فارغة لهذا التقرير`);
  }
  return sections;
}

function readLabels(
  value: unknown,
  path: string,
  fields: string[],
  sections: ReportTemplate["sections"],
  spec: DocumentSpec,
  errors: string[],
): Record<string, string> {
  if (!isPlainObject(value)) {
    errors.push(`${path} يجب أن يكون كائناً`);
    return {};
  }
  const allowed = new Set<string>([
    ...spec.fields,
    ...Object.values(spec.sections).flatMap((section) => section.rowIds),
  ]);
  const labels: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!allowed.has(key)) {
      errors.push(`${path}.${key} غير معروف`);
      continue;
    }
    if (typeof raw !== "string") {
      errors.push(`${path}.${key} يجب أن يكون نصاً`);
      continue;
    }
    const text = clean(raw);
    if (text.length > MAX_TEXT) {
      errors.push(`${path}.${key} أطول من ${MAX_TEXT} حرفاً`);
    }
    labels[key] = text;
  }
  for (const id of fields) {
    if (!labels[id]) errors.push(`${path}.${id} مطلوب`);
  }
  for (const section of sections) {
    if (!section.show) continue;
    const sectionSpec = spec.sections[section.id];
    if (
      sectionSpec?.kind !== "kv" &&
      sectionSpec?.kind !== "groupedTable"
    ) {
      continue;
    }
    for (const rowId of sectionSpec.rowIds) {
      if (!labels[rowId]) errors.push(`${path}.${rowId} مطلوب`);
    }
  }
  return labels;
}

function readSeparator(
  value: Record<string, unknown>,
  path: string,
  errors: string[],
  fallback = true,
): boolean {
  return readBool(value, "separator", `${path}.separator`, errors, fallback);
}

export function validateReportTemplate(
  value: unknown,
  expectedDoc?: ReportDocument,
): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    return { ok: false, errors: ["ملف التصميم يجب أن يكون كائناً JSON"] };
  }
  checkKeys(
    value,
    [
      "format",
      "version",
      "document",
      "paper",
      "header",
      "fields",
      "items",
      "sections",
      "summary",
      "labels",
      "footer",
    ],
    "root",
    errors,
  );
  if (value.format !== "fastpos-report") errors.push("format غير صالح");
  if (value.version !== 1) errors.push("version غير مدعوم");
  if (!isReportDocument(value.document)) {
    return { ok: false, errors: [...errors, "document غير معروف"] };
  }
  const doc = value.document;
  if (expectedDoc && doc !== expectedDoc) {
    errors.push(`document يجب أن يكون ${expectedDoc}`);
  }
  const spec = DOCUMENT_SPECS[doc];

  if (!isPlainObject(value.paper)) {
    errors.push("paper مطلوب");
    return { ok: false, errors };
  }
  checkKeys(value.paper, ["columns"], "paper", errors);
  const columns = value.paper.columns;
  if (columns !== 32 && columns !== 48) errors.push("paper.columns يجب أن يكون 32 أو 48");

  const header = isPlainObject(value.header) ? value.header : null;
  if (!header) errors.push("header مطلوب");
  let logo: ReportTemplate["header"]["logo"] = { show: false };
  let headerLines: TemplateLine[] = [];
  let headerSeparator = true;
  if (header) {
    checkKeys(header, ["logo", "lines", "separator"], "header", errors);
    if (isPlainObject(header.logo)) {
      checkKeys(header.logo, ["show", "align", "maxWidth"], "header.logo", errors);
      const show = readBool(header.logo, "show", "header.logo.show", errors, false);
      logo = { show };
      const align = readAlign(header.logo, "align", "header.logo.align", errors);
      if (align) logo.align = align;
      if (header.logo.maxWidth !== undefined) {
        const maxWidth = header.logo.maxWidth;
        if (
          typeof maxWidth !== "number" ||
          !Number.isInteger(maxWidth) ||
          maxWidth < 64 ||
          maxWidth > 384
        ) {
          errors.push("header.logo.maxWidth غير صالح");
        } else {
          logo.maxWidth = maxWidth;
        }
      }
    } else {
      errors.push("header.logo مطلوب");
    }
    headerLines = readLines(header.lines, "header.lines", spec, errors);
    headerSeparator = readSeparator(header, "header", errors);
  }

  const fields = isPlainObject(value.fields) ? value.fields : null;
  if (!fields) errors.push("fields مطلوب");
  let fieldIds: string[] = [];
  let fieldsSeparator = true;
  if (fields) {
    checkKeys(fields, ["show", "separator"], "fields", errors);
    if (!Array.isArray(fields.show)) {
      errors.push("fields.show يجب أن يكون قائمة");
    } else {
      const seen = new Set<string>();
      fieldIds = fields.show
        .filter((id): id is string => {
          if (typeof id !== "string") {
            errors.push("fields.show يحتوي قيمة غير صالحة");
            return false;
          }
          if (!spec.fields.includes(id)) {
            errors.push(`fields.show: ${id} غير معروف`);
            return false;
          }
          if (seen.has(id)) {
            errors.push(`fields.show: ${id} مكرر`);
            return false;
          }
          seen.add(id);
          return true;
        });
    }
    fieldsSeparator = readSeparator(fields, "fields", errors);
  }

  const items = isPlainObject(value.items) ? value.items : null;
  if (!items) errors.push("items مطلوب");
  let itemColumns: TemplateColumn[] = [];
  let itemsShow = false;
  let itemsTitle = "";
  let itemsHeader = true;
  let itemsShowNote = true;
  let itemsSeparator = true;
  if (items) {
    checkKeys(
      items,
      ["show", "title", "header", "showNote", "columns", "separator"],
      "items",
      errors,
    );
    itemsShow = readBool(items, "show", "items.show", errors, false);
    itemsTitle = readString(items, "title", "items.title", errors, {
      required: false,
    });
    itemsHeader = readBool(items, "header", "items.header", errors, true);
    itemsShowNote = readBool(items, "showNote", "items.showNote", errors, true);
    itemsSeparator = readSeparator(items, "items", errors);
    itemColumns = readColumns(
      items.columns,
      "items.columns",
      spec.itemColumns,
      errors,
    );
    if (spec.itemColumns.length === 0) {
      if (itemsShow) errors.push("items.show يجب أن يكون false لهذا التقرير");
      if (itemColumns.length > 0) errors.push("items.columns يجب أن تكون فارغة");
    } else if (itemsShow && itemColumns.length === 0) {
      errors.push("items.columns مطلوب");
    }
  }

  const sections = readSections(value.sections, "sections", doc, spec, errors);

  const summary = isPlainObject(value.summary) ? value.summary : null;
  if (!summary) errors.push("summary مطلوب");
  let summaryShow = false;
  let summaryLabel = "";
  let summarySeparator = true;
  if (summary) {
    checkKeys(summary, ["show", "label", "separator"], "summary", errors);
    summaryShow = readBool(summary, "show", "summary.show", errors, false);
    summaryLabel = readString(summary, "label", "summary.label", errors, {
      required: summaryShow,
    });
    summarySeparator = readSeparator(summary, "summary", errors);
    if (summaryShow && !spec.summaryAllowed) {
      errors.push("summary.show غير مسموح لهذا التقرير");
    }
  }

  const labels = readLabels(value.labels, "labels", fieldIds, sections, spec, errors);

  const footer = isPlainObject(value.footer) ? value.footer : null;
  if (!footer) errors.push("footer مطلوب");
  let footerLines: TemplateLine[] = [];
  let footerSeparator = true;
  if (footer) {
    checkKeys(footer, ["separator", "lines"], "footer", errors);
    footerLines = readLines(footer.lines, "footer.lines", spec, errors);
    footerSeparator = readSeparator(footer, "footer", errors);
  }

  const totalLines =
    headerLines.length +
    footerLines.length +
    (itemsTitle ? 1 : 0) +
    sections.filter((section) => section.show).length;
  if (totalLines > MAX_TOTAL_LINES) {
    errors.push(`التصميم يتجاوز ${MAX_TOTAL_LINES} سطراً`);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    template: {
      format: "fastpos-report",
      version: 1,
      document: doc,
      paper: { columns: columns as 32 | 48 },
      header: { logo, lines: headerLines, separator: headerSeparator },
      fields: { show: fieldIds, separator: fieldsSeparator },
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
      footer: { separator: footerSeparator, lines: footerLines },
    },
  };
}

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
  return validateReportTemplate(value, expectedDoc);
}
```

- [ ] **Step 5: Run the test and fix failures**

Run: `npx vitest run lib/print/templates/schema.test.ts`
Expected: PASS (7 tests). If the control-char test fails because the ESC strip leaves `[31m`, verify `CONTROL_CHARS` covers `\u001b` and that `clean` runs before the length check.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from the new files.

---

### Task 2: Built-in default templates

**Files:**
- Create: `lib/print/templates/defaults.ts`
- Test: `lib/print/templates/defaults.test.ts`

**Interfaces:**
- Produces: `DEFAULT_REPORT_TEMPLATES: Record<ReportDocument, ReportTemplate>`.
- Consumes: `ReportTemplate` from Task 1.

- [ ] **Step 1: Write the failing defaults test**

Create `lib/print/templates/defaults.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import { validateReportTemplate } from "./schema";
import { REPORT_DOCUMENTS, type LayoutLine } from "./types";

describe("default report templates", () => {
  it("every default validates for its own document", () => {
    for (const doc of REPORT_DOCUMENTS) {
      const result = validateReportTemplate(DEFAULT_REPORT_TEMPLATES[doc], doc);
      expect(result.ok, `${doc}: ${result.ok ? "" : result.errors.join(" · ")}`).toBe(true);
    }
  });

  it("the receipt defaults to the four-column table in the right order", () => {
    const receipt = DEFAULT_REPORT_TEMPLATES.receipt;
    expect(receipt.items.columns.map((column) => column.key)).toEqual([
      "name",
      "qty",
      "unitPrice",
      "lineTotal",
    ]);
    expect(receipt.items.columns.map((column) => column.label)).toEqual([
      "الصنف",
      "الكمية",
      "السعر",
      "الإجمالي",
    ]);
    expect(receipt.items.columns.map((column) => column.width)).toEqual([
      11, 4, 7, 8,
    ]);
    expect(receipt.items.header).toBe(true);
    expect(receipt.items.showNote).toBe(true);
    expect(receipt.header.lines.map((line) => line.text)).toContain(
      "{{subtitle}}",
    );
  });

  it("kitchen and shift keep the summary off", () => {
    expect(DEFAULT_REPORT_TEMPLATES.kitchen.summary.show).toBe(false);
    expect(DEFAULT_REPORT_TEMPLATES.shift.summary.show).toBe(false);
    expect(DEFAULT_REPORT_TEMPLATES.shift.sections.map((section) => section.id)).toEqual([
      "collection",
      "expenses",
      "reconciliation",
    ]);
  });

  it("items keeps category grouping and sales keeps both report tables", () => {
    const groups = DEFAULT_REPORT_TEMPLATES.items.sections.find(
      (section) => section.id === "groups",
    );
    expect(groups?.columns?.map((column) => column.key)).toEqual(["name", "qty"]);
    expect(groups?.columns?.map((column) => column.width)).toEqual([26, 6]);

    const sales = DEFAULT_REPORT_TEMPLATES.sales;
    expect(sales.sections.map((section) => section.id)).toEqual([
      "totals",
      "categories",
      "itemsList",
    ]);
    expect(
      sales.sections
        .find((section) => section.id === "categories")
        ?.columns?.map((column) => [column.key, column.width]),
    ).toEqual([
      ["index", 3],
      ["name", 17],
      ["qty", 5],
      ["revenue", 9],
    ]);
    expect(
      sales.sections
        .find((section) => section.id === "itemsList")
        ?.columns?.map((column) => [column.key, column.width]),
    ).toEqual([
      ["index", 3],
      ["name", 17],
      ["qty", 5],
      ["revenue", 9],
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/print/templates/defaults.test.ts`
Expected: FAIL — `Cannot find module './defaults'`.

- [ ] **Step 3: Create `lib/print/templates/defaults.ts`**

```ts
import type { ReportDocument, ReportTemplate } from "./types";

const receipt: ReportTemplate = {
  format: "fastpos-report",
  version: 1,
  document: "receipt",
  paper: { columns: 32 },
  header: {
    logo: { show: true, align: "center", maxWidth: 256 },
    separator: true,
    lines: [
      { text: "{{title}}", align: "center", bold: true, size: "xlarge" },
      { text: "{{subtitle}}", align: "center" },
      { text: "{{brand.phone}}", align: "center", size: "small" },
      { text: "{{brand.address}}", align: "center", size: "small" },
    ],
  },
  fields: {
    show: [
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
    separator: true,
  },
  items: {
    show: true,
    title: "الأصناف",
    header: true,
    showNote: true,
    separator: true,
    columns: [
      { key: "name", label: "الصنف", width: 11 },
      { key: "qty", label: "الكمية", width: 4, align: "center" },
      { key: "unitPrice", label: "السعر", width: 7, align: "center" },
      { key: "lineTotal", label: "الإجمالي", width: 8, align: "center" },
    ],
  },
  sections: [],
  summary: { show: true, label: "الإجمالي", separator: true },
  labels: {
    orderNo: "رقم الطلب",
    invoiceId: "فاتورة",
    table: "الطاولة",
    waiter: "السفرادجي",
    customer: "العميل",
    phone: "الهاتف",
    cashier: "الكاشير",
    payment: "الدفع",
    time: "الوقت",
  },
  footer: {
    separator: false,
    lines: [{ text: "{{footer}}", align: "center" }],
  },
};

const kitchen: ReportTemplate = {
  format: "fastpos-report",
  version: 1,
  document: "kitchen",
  paper: { columns: 32 },
  header: {
    logo: { show: false },
    separator: false,
    lines: [{ text: "{{title}}", align: "center", bold: true, size: "xlarge" }],
  },
  fields: {
    show: ["orderNo", "table", "waiter", "time", "ticketPart"],
    separator: true,
  },
  items: {
    show: true,
    title: "",
    header: false,
    showNote: true,
    separator: true,
    columns: [
      { key: "name", label: "الصنف", width: 26, bold: true, size: "large" },
      { key: "qty", label: "الكمية", width: 6, align: "center", bold: true, size: "large" },
    ],
  },
  sections: [],
  summary: { show: false, label: "" },
  labels: {
    orderNo: "الطلب",
    table: "الطاولة",
    waiter: "السفرادجي",
    time: "الوقت",
    ticketPart: "الجزء",
  },
  footer: { separator: false, lines: [] },
};

const shift: ReportTemplate = {
  format: "fastpos-report",
  version: 1,
  document: "shift",
  paper: { columns: 32 },
  header: {
    logo: { show: false },
    separator: true,
    lines: [
      { text: "{{title}}", align: "center", bold: true, size: "xlarge" },
      { text: "{{venue}}", align: "center" },
    ],
  },
  fields: {
    show: [
      "workDate",
      "openedAt",
      "closedAt",
      "printedAt",
      "printedByName",
      "openedByName",
      "closedByName",
    ],
    separator: true,
  },
  items: { show: false, title: "", columns: [], header: false, showNote: false },
  sections: [
    {
      id: "collection",
      title: "التحصيل",
      show: true,
      separator: true,
    },
    {
      id: "expenses",
      title: "العهدة والمصروفات",
      show: true,
      separator: true,
    },
    {
      id: "reconciliation",
      title: "مطابقة النقد",
      show: true,
      separator: true,
    },
  ],
  summary: { show: false, label: "" },
  labels: {
    workDate: "اليوم",
    openedAt: "الفتح",
    closedAt: "الإغلاق",
    printedAt: "طباعة",
    printedByName: "بواسطة",
    openedByName: "فتحها",
    closedByName: "أغلقها",
    invoiceCount: "الفواتير",
    total: "الإجمالي",
    noPayments: "لا مدفوعات",
    totalItems: "قطع مباعة",
    tableQuick: "طاولات / سريع",
    openingFloat: "العهدة الافتتاحية",
    expenseTotal: "إجمالي المصروفات",
    expectedCash: "النقد المتوقع",
    countedCash: "النقد المعدود",
    difference: "الفرق",
  },
  footer: {
    separator: true,
    lines: [{ text: "{{status}}", align: "center", bold: true }],
  },
};

const items: ReportTemplate = {
  format: "fastpos-report",
  version: 1,
  document: "items",
  paper: { columns: 32 },
  header: {
    logo: { show: false },
    separator: true,
    lines: [
      { text: "{{title}}", align: "center", bold: true, size: "xlarge" },
      { text: "{{venue}}", align: "center" },
    ],
  },
  fields: {
    show: ["workDate", "printedAt", "printedByName"],
    separator: true,
  },
  items: { show: false, title: "", columns: [], header: false, showNote: false },
  sections: [
    { id: "overview", title: "", show: true, separator: true },
    {
      id: "groups",
      title: "",
      show: true,
      separator: true,
      columns: [
        { key: "name", label: "الصنف", width: 26 },
        { key: "qty", label: "الكمية", width: 6, align: "center" },
      ],
    },
  ],
  summary: { show: true, label: "الإجمالي العام", separator: true },
  labels: {
    workDate: "اليوم",
    printedAt: "طباعة",
    printedByName: "بواسطة",
    categoryCount: "المجموعات",
    itemCount: "الأصناف",
    totalItems: "إجمالي القطع",
    groupTotal: "إجمالي المجموعة",
  },
  footer: {
    separator: true,
    lines: [{ text: "— نهاية التقرير —", align: "center" }],
  },
};

const sales: ReportTemplate = {
  format: "fastpos-report",
  version: 1,
  document: "sales",
  paper: { columns: 32 },
  header: {
    logo: { show: false },
    separator: true,
    lines: [
      { text: "{{title}}", align: "center", bold: true, size: "xlarge" },
      { text: "{{venue}}", align: "center" },
    ],
  },
  fields: {
    show: ["from", "to", "printedAt"],
    separator: true,
  },
  items: { show: false, title: "", columns: [], header: false, showNote: false },
  sections: [
    { id: "totals", title: "", show: true, separator: true },
    {
      id: "categories",
      title: "المجموعات",
      show: true,
      separator: true,
      columns: [
        { key: "index", label: "م", width: 3, align: "center" },
        { key: "name", label: "المجموعة", width: 17 },
        { key: "qty", label: "الكمية", width: 5, align: "center" },
        { key: "revenue", label: "الإيراد", width: 9, align: "center" },
      ],
    },
    {
      id: "itemsList",
      title: "الأصناف",
      show: true,
      separator: true,
      columns: [
        { key: "index", label: "م", width: 3, align: "center" },
        { key: "name", label: "الصنف", width: 17 },
        { key: "qty", label: "الكمية", width: 5, align: "center" },
        { key: "revenue", label: "الإيراد", width: 9, align: "center" },
      ],
    },
  ],
  summary: { show: true, label: "الإجمالي النهائي", separator: true },
  labels: {
    from: "من",
    to: "إلى",
    printedAt: "طباعة",
    total: "الإجمالي",
    invoiceCount: "الفواتير",
    totalItems: "قطع مباعة",
    tableQuick: "طاولات / سريع",
    noPayments: "لا مدفوعات",
  },
  footer: {
    separator: true,
    lines: [{ text: "— نهاية التقرير —", align: "center" }],
  },
};

export const DEFAULT_REPORT_TEMPLATES: Record<ReportDocument, ReportTemplate> = {
  receipt,
  kitchen,
  shift,
  items,
  sales,
};
```

- [ ] **Step 4: Run the defaults test**

Run: `npx vitest run lib/print/templates/defaults.test.ts`
Expected: PASS (4 tests). Validation requires every label used by enabled `kv` sections; the shift defaults list them all.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 3: Column width math

**Files:**
- Create: `lib/print/templates/columns.ts`
- Test: `lib/print/templates/columns.test.ts`

**Interfaces:**
- Produces: `distribute(weights: number[], total: number): number[]`, `charWidths(weights, columns)`, `pixelWidths(weights, total = 384)`, `pixelBounds(weights, total = 384): Array<{ left: number; right: number; width: number }>`.
- `distribute` always returns integers summing exactly to `total` when `weights.length > 0`.

- [ ] **Step 1: Write the failing columns test**

Create `lib/print/templates/columns.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { charWidths, pixelBounds, pixelWidths } from "./columns";

describe("column width distribution", () => {
  it("sums to the paper width for 32 and 48 columns", () => {
    const weights = [11, 4, 7, 8];
    expect(charWidths(weights, 32).reduce((a, b) => a + b, 0)).toBe(32);
    expect(charWidths(weights, 48).reduce((a, b) => a + b, 0)).toBe(48);
  });

  it("sums to 384 pixels and preserves the weight order", () => {
    const widths = pixelWidths([11, 4, 7, 8]);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(384);
    expect(widths[0]).toBeGreaterThan(widths[1]!);
    expect(widths[3]).toBeGreaterThan(widths[2]!);
  });

  it("places the first column at the right edge (RTL)", () => {
    const bounds = pixelBounds([11, 4, 7, 8]);
    expect(bounds[0]).toMatchObject({ right: 384 });
    expect(bounds[1]!.right).toBe(384 - bounds[0]!.width);
    expect(bounds[bounds.length - 1]!.left).toBe(0);
  });

  it("tolerates empty and invalid weights", () => {
    expect(charWidths([], 32)).toEqual([]);
    expect(charWidths([0, 0], 32).reduce((a, b) => a + b, 0)).toBe(32);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/print/templates/columns.test.ts`
Expected: FAIL — `Cannot find module './columns'`.

- [ ] **Step 3: Create `lib/print/templates/columns.ts`**

```ts
export function distribute(weights: number[], total: number): number[] {
  if (weights.length === 0) return [];
  const safe = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 1,
  );
  const sum = safe.reduce((accumulator, weight) => accumulator + weight, 0);
  const exact = safe.map((weight) => (weight / sum) * total);
  const widths = exact.map((value) => Math.floor(value));
  let remainder = total - widths.reduce((accumulator, width) => accumulator + width, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    widths[order[cursor % order.length]!.index] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return widths;
}

export function charWidths(weights: number[], columns: number): number[] {
  return distribute(weights, columns);
}

export function pixelWidths(weights: number[], total = 384): number[] {
  return distribute(weights, total);
}

export function pixelBounds(
  weights: number[],
  total = 384,
): Array<{ left: number; right: number; width: number }> {
  const widths = pixelWidths(weights, total);
  let offset = 0;
  return widths.map((width) => {
    const right = total - offset;
    const left = right - width;
    offset += width;
    return { left, right, width };
  });
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/print/templates/columns.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 4: Layout engine

**Files:**
- Create: `lib/print/templates/layout.ts`
- Test: `lib/print/templates/layout.test.ts`

**Interfaces:**
- Consumes: `charWidths` (Task 3), `DEFAULT_REPORT_TEMPLATES` (Task 2), `ReportTemplate`/`DocumentData`/`LayoutLine` (Task 1).
- Produces: `layoutTemplate(template: ReportTemplate, data: DocumentData): LayoutLine[]`, `wrapWords(text: string, limit: number): string[]`.

- [ ] **Step 1: Write the failing layout test**

Create `lib/print/templates/layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import { layoutTemplate } from "./layout";
import type { DocumentData, LayoutLine } from "./types";

const receiptData: DocumentData = {
  title: "Acme Corner",
  subtitle: "Fast Cafe · إيصال الدفع",
  venue: "Fast Cafe",
  brandPhone: "0911234567",
  brandAddress: "",
  footer: "شكراً لزيارتكم",
  status: "",
  logoAvailable: true,
  fields: {
    orderNo: "7",
    invoiceId: "#12",
    table: "4",
    waiter: null,
    customer: null,
    phone: null,
    cashier: "سارة",
    payment: "نقدي",
    time: "2026-10-31 14:05",
  },
  items: [
    { name: "كابتشينو", qty: "2", unitPrice: "12.00", lineTotal: "24.00" },
    { name: "قهوة عربية", qty: "1", unitPrice: "8.00", lineTotal: "8.00" },
  ],
  itemNotes: [null, "بدون سكر"],
  sections: {},
  summary: "32.00 د.ل",
};

function texts(lines: LayoutLine[]): string[] {
  return lines.flatMap((line) => (line.kind === "text" ? [line.text] : []));
}

describe("layoutTemplate — receipt", () => {
  it("expands header placeholders and skips empty optional lines", () => {
    const lines = layoutTemplate(DEFAULT_REPORT_TEMPLATES.receipt, receiptData);
    const header = texts(lines).slice(0, 3);
    expect(header).toEqual([
      "Acme Corner",
      "Fast Cafe · إيصال الدفع",
      "0911234567",
      // brand.address expanded to "" and was skipped
    ]);
    expect(lines.some((line) => line.kind === "logo")).toBe(true);
  });

  it("prints only shown fields that have values, in template order", () => {
    const lines = layoutTemplate(DEFAULT_REPORT_TEMPLATES.receipt, receiptData);
    const body = texts(lines);
    expect(body).toContain("رقم الطلب: 7");
    expect(body).toContain("فاتورة: #12");
    expect(body).not.toContain("السفرادجي:");
    expect(body).not.toContain("العميل:");
    expect(body.indexOf("رقم الطلب: 7")).toBeLessThan(
      body.indexOf("فاتورة: #12"),
    );
  });

  it("uses the four-column header and one columns line per item", () => {
    const lines = layoutTemplate(DEFAULT_REPORT_TEMPLATES.receipt, receiptData);
    const columnLines = lines.filter(
      (line): line is Extract<LayoutLine, { kind: "columns" }> =>
        line.kind === "columns",
    );
    expect(columnLines).toHaveLength(3); // header + 2 items
    expect(columnLines[0]!.cells.map((cell) => cell.text)).toEqual([
      "الصنف",
      "الكمية",
      "السعر",
      "الإجمالي",
    ]);
    expect(columnLines[1]!.cells.map((cell) => cell.text)).toEqual([
      "كابتشينو",
      "2",
      "12.00",
      "24.00",
    ]);
    expect(columnLines[1]!.widths).toEqual([10, 7, 6, 9]);
    expect(columnLines[1]!.widths.reduce((a, b) => a + b, 0)).toBe(32);
  });

  it("prints notes and a bold xlarge summary, and expands the footer", () => {
    const lines = layoutTemplate(DEFAULT_REPORT_TEMPLATES.receipt, receiptData);
    expect(texts(lines)).toContain("• بدون سكر");
    const summary = lines.find(
      (line) => line.kind === "text" && line.text.startsWith("الإجمالي:"),
    );
    expect(summary).toMatchObject({ bold: true, size: "xlarge" });
    expect(texts(lines).at(-1)).toBe("شكراً لزيارتكم");
  });

  it("honours a label override", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    template.labels.customer = "الزبون";
    const lines = layoutTemplate(template, {
      ...receiptData,
      fields: { ...receiptData.fields, customer: "محمد" },
    });
    expect(texts(lines)).toContain("الزبون: محمد");
  });
});

describe("layoutTemplate — documents without an item table", () => {
  it("renders shift sections in template order and the status footer", () => {
    const template = DEFAULT_REPORT_TEMPLATES.shift;
    const lines = layoutTemplate(template, {
      ...receiptData,
      title: "إغلاق وردية #3",
      status: "تم إغلاق الوردية",
      fields: {
        workDate: "2026-10-31",
        openedAt: "09:00",
        closedAt: "18:00",
        printedAt: "18:00",
        printedByName: "سارة",
        openedByName: null,
        closedByName: null,
      },
      sections: {
        collection: {
          kind: "kv",
          rows: [
            { labelId: "invoiceCount", value: "2" },
            { labelId: "total", value: "30.00 د.ل", bold: true },
          ],
        },
        expenses: {
          kind: "kv",
          rows: [],
          emptyText: "لا مصروفات في هذه الوردية",
        },
        reconciliation: {
          kind: "kv",
          rows: [{ labelId: "expectedCash", value: "37.50 د.ل" }],
        },
      },
      summary: null,
    });
    const body = texts(lines);
    expect(body.indexOf("التحصيل")).toBeLessThan(
      body.indexOf("العهدة والمصروفات"),
    );
    expect(body).toContain("لا مصروفات في هذه الوردية");
    expect(body.at(-1)).toBe("تم إغلاق الوردية");
  });

  it("renders grouped tables with a group total and a summary", () => {
    const template = DEFAULT_REPORT_TEMPLATES.items;
    const lines = layoutTemplate(template, {
      ...receiptData,
      title: "تقرير أصناف الوردية #3",
      status: "",
      sections: {
        overview: {
          kind: "kv",
          rows: [
            { labelId: "categoryCount", value: "1" },
            { labelId: "itemCount", value: "2" },
            { labelId: "totalItems", value: "3", bold: true },
          ],
        },
        groups: {
          kind: "groupedTable",
          rows: [],
          groups: [
            {
              label: "مشروبات ساخنة",
              rows: [
                { name: "شاي", qty: "2" },
                { name: "قهوة", qty: "1" },
              ],
              total: "3 قطعة",
            },
          ],
        },
      },
      summary: "3 قطعة",
    });
    const body = texts(lines);
    expect(body).toContain("— مشروبات ساخنة —");
    expect(body).toContain("إجمالي المجموعة: 3 قطعة");
    expect(body).toContain("الإجمالي العام: 3 قطعة");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/print/templates/layout.test.ts`
Expected: FAIL — `Cannot find module './layout'`.

- [ ] **Step 3: Create `lib/print/templates/layout.ts`**

```ts
import { charWidths } from "./columns";
import type {
  Align,
  DocumentData,
  LayoutLine,
  ReportTemplate,
  TemplateColumn,
  TemplateLine,
  TextSize,
} from "./types";

type TextOptions = {
  align?: Align;
  bold?: boolean;
  size?: TextSize;
};

type ColumnsLine = Extract<LayoutLine, { kind: "columns" }>;

function textLine(text: string, options: TextOptions = {}): LayoutLine {
  return {
    kind: "text",
    text,
    align: options.align ?? "right",
    bold: options.bold ?? false,
    size: options.size ?? "normal",
  };
}

export function expandPlaceholders(text: string, data: DocumentData): string {
  return text
    .replace(/\{\{\s*title\s*\}\}/g, data.title)
    .replace(/\{\{\s*subtitle\s*\}\}/g, data.subtitle)
    .replace(/\{\{\s*venue\s*\}\}/g, data.venue)
    .replace(/\{\{\s*brand\.phone\s*\}\}/g, data.brandPhone)
    .replace(/\{\{\s*brand\.address\s*\}\}/g, data.brandAddress)
    .replace(/\{\{\s*footer\s*\}\}/g, data.footer)
    .replace(/\{\{\s*status\s*\}\}/g, data.status)
    .trim();
}

function renderLines(lines: TemplateLine[], data: DocumentData): LayoutLine[] {
  const out: LayoutLine[] = [];
  for (const line of lines) {
    const value = expandPlaceholders(line.text, data);
    if (!value) continue;
    out.push(textLine(value, line));
  }
  return out;
}

export function wrapWords(value: string, limit: number): string[] {
  const text = value.trim();
  if (!text) return [""];
  if (!Number.isFinite(limit) || limit < 1) return [text];
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    let rest = word;
    while (rest.length > limit) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    const next = current ? `${current} ${rest}` : rest;
    if (next.length <= limit) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = rest;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

function columnCells(
  columns: TemplateColumn[],
  row: Record<string, string>,
  header = false,
): ColumnsLine {
  return {
    kind: "columns",
    widths: [],
    cells: columns.map((column) => ({
      text: row[column.key] ?? "",
      align: column.align ?? "right",
      bold: header ? true : (column.bold ?? false),
      size: column.size ?? "normal",
    })),
  };
}

/**
 * A table column may never be narrower than its own label: the header row
 * prints those labels verbatim, so a weight that cannot hold them would
 * truncate the header (e.g. "الكمية" in a 4-character quantity column).
 * Reserve the label widths first, then share the remaining paper width by
 * the extra weight each column requested.
 */
function tableWidths(columns: TemplateColumn[], paper: number): number[] {
  const minimums = columns.map((column) => column.label.length);
  const minimumTotal = minimums.reduce((sum, value) => sum + value, 0);
  if (minimumTotal === 0) {
    return charWidths(columns.map((column) => column.width), paper);
  }
  if (minimumTotal >= paper) {
    return charWidths(minimums, paper);
  }

  const extras = columns.map((column, index) =>
    Math.max(0, column.width - minimums[index]!),
  );
  const extraTotal = extras.reduce((sum, value) => sum + value, 0);
  const extra = charWidths(
    extraTotal > 0 ? extras : columns.map((column) => column.width),
    paper - minimumTotal,
  );
  return minimums.map((minimum, index) => minimum + (extra[index] ?? 0));
}

export function layoutTemplate(
  template: ReportTemplate,
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  const paper = template.paper.columns;

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

  const fieldRows = template.fields.show
    .map((id) => ({ id, value: data.fields[id]?.trim() ?? "" }))
    .filter((row) => row.value.length > 0);
  if (fieldRows.length > 0) {
    for (const field of fieldRows) {
      out.push(textLine(`${template.labels[field.id] ?? field.id}: ${field.value}`));
    }
    if (template.fields.separator !== false) out.push({ kind: "separator" });
  }

  if (template.items.show && data.items.length > 0 && template.items.columns.length > 0) {
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
  }

  for (const section of template.sections) {
    if (!section.show) continue;
    const sectionData = data.sections[section.id];
    if (!sectionData) continue;
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
          continue;
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
        if (!sectionData.emptyText) continue;
        rendered.length = section.title.trim() ? 1 : 0;
        rendered.push(textLine(sectionData.emptyText, { align: "center" }));
      }
    } else {
      const columns = section.columns ?? [];
      const widths = tableWidths(columns, paper);
      const groups = sectionData.groups ?? [];
      if (groups.length === 0) {
        if (!sectionData.emptyText) continue;
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
    if (rendered.length === 0) continue;
    if (section.separator !== false) out.push({ kind: "separator" });
    out.push(...rendered);
  }

  if (template.summary.show && data.summary) {
    if (template.summary.separator !== false) out.push({ kind: "separator" });
    out.push(
      textLine(`${template.summary.label}: ${data.summary}`, {
        bold: true,
        size: "xlarge",
      }),
    );
  }

  const footer = renderLines(template.footer.lines, data);
  if (footer.length > 0) {
    if (template.footer.separator !== false) out.push({ kind: "separator" });
    out.push(...footer);
  }

  return out;
}
```

- [ ] **Step 4: Run the test and fix failures**

Run: `npx vitest run lib/print/templates/layout.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 5: Document data adapters and sample data

**Files:**
- Create: `lib/print/templates/data.ts`
- Create: `lib/print/templates/sample.ts`
- Test: `lib/print/templates/data.test.ts`

**Interfaces:**
- Produces: `ReceiptDocumentSettings`, `receiptDocumentData`, `kitchenDocumentData`, `shiftDocumentData`, `itemsDocumentData`, `salesDocumentData`, `buildSampleDocuments(settings): Record<ReportDocument, DocumentData>`, `sampleSettings`.
- `ReceiptDocumentSettings = { venueName: string; brandName: string; brandPhone: string; brandAddress: string; footer: string; logoAvailable: boolean }`.

- [ ] **Step 1: Write the failing adapter test**

Create `lib/print/templates/data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import {
  itemsDocumentData,
  kitchenDocumentData,
  receiptDocumentData,
  salesDocumentData,
  shiftDocumentData,
  type ReceiptDocumentSettings,
} from "./data";
import { layoutTemplate } from "./layout";
import { buildSampleDocuments } from "./sample";
import type { CheckoutReceiptData, ReportSummaryPrintData, ShiftReportPrintData } from "@/lib/print/receipts";
import { REPORT_DOCUMENTS, type LayoutLine } from "./types";

const settings: ReceiptDocumentSettings = {
  venueName: "Fast Cafe",
  brandName: "Acme Corner",
  brandPhone: "0911234567",
  brandAddress: "Tripoli Main Street",
  footer: "شكراً لزيارتكم",
  logoAvailable: false,
};

const receipt: CheckoutReceiptData = {
  venueName: "Fast Cafe",
  orderId: 12,
  orderNo: 7,
  tableName: "4",
  waiterName: "أحمد",
  customerName: "محمد سالم",
  customerPhone: "0910000000",
  cashierName: "سارة",
  paymentMethod: "cash",
  paymentMethodLabel: "نقدي",
  paidAt: "2026-10-31 14:05",
  total: 32,
  lines: [
    { name: "كابتشينو", qty: 2, unitPrice: 12, lineTotal: 24, note: "بدون سكر" },
    { name: "قهوة عربية", qty: 1, unitPrice: 8, lineTotal: 8 },
  ],
};

const shift: ShiftReportPrintData = {
  kind: "close",
  shiftNumber: 4,
  venueName: "Fast Cafe",
  workDate: "2026-10-31",
  openedAt: "2026-10-31 09:00",
  closedAt: "2026-10-31 18:00",
  printedAt: "2026-10-31 18:00",
  printedByName: "سارة",
  openedByName: "سارة",
  closedByName: "سارة",
  invoiceCount: 12,
  totalSales: 640.5,
  cashTotal: 500.5,
  nonCashTotal: 140,
  paymentBreakdown: [
    { name: "نقدي", total: 500.5, count: 9 },
    { name: "بطاقة", total: 140, count: 3 },
  ],
  totalItems: 28,
  tableSales: 9,
  quickSales: 3,
  items: [
    { name: "شاي", qty: 2, categoryName: "مشروبات ساخنة" },
    { name: "كولا", qty: 3, categoryName: "مشروبات باردة" },
    { name: "قهوة", qty: 1, categoryName: "مشروبات ساخنة" },
  ],
  openingFloat: 50,
  expenseTotal: 12.5,
  expenses: [{ reason: "شراء ثلج", amount: 12.5, createdByName: "سارة" }],
  expectedCash: 500,
  countedCash: 505,
  difference: 5,
};

const sales: ReportSummaryPrintData = {
  venueName: "Fast Cafe",
  fromLabel: "2026-10-30 00:00",
  toLabel: "2026-10-31 23:59",
  printedAt: "2026-10-31 18:00",
  invoiceCount: 12,
  totalSales: 640.5,
  cashTotal: 500.5,
  nonCashTotal: 140,
  paymentBreakdown: [{ name: "نقدي", total: 500.5, count: 9 }],
  totalItems: 28,
  tableSales: 9,
  quickSales: 3,
  cancelledCount: 1,
  openCount: 2,
  openTotal: 45,
  categorySales: [{ name: "مشروبات ساخنة", qty: 18, revenue: 420.5 }],
  itemSales: [{ name: "شاي", qty: 12, revenue: 120 }],
  waiterPerformance: [],
  cashierPerformance: [],
};

describe("receiptDocumentData", () => {
  it("maps brand, fields, four item cells, notes, and the total", () => {
    const data = receiptDocumentData(receipt, settings);
    expect(data.title).toBe("Acme Corner");
    expect(data.subtitle).toBe("Fast Cafe · إيصال الدفع");
    expect(data.fields).toMatchObject({
      orderNo: "7",
      invoiceId: "#12",
      table: "4",
      waiter: "أحمد",
      customer: "محمد سالم",
      payment: "نقدي",
      time: "2026-10-31 14:05",
    });
    expect(data.items[0]).toEqual({
      name: "كابتشينو",
      qty: "2",
      unitPrice: "12.00",
      lineTotal: "24.00",
    });
    expect(data.itemNotes).toEqual(["بدون سكر", null]);
    expect(data.summary).toBe("32.00 د.ل");
    expect(data.footer).toBe("شكراً لزيارتكم");
  });

  it("falls back to the venue title and hides empty optionals", () => {
    const data = receiptDocumentData(
      { ...receipt, waiterName: null, customerName: null, customerPhone: null },
      { ...settings, brandName: "", brandAddress: "" },
    );
    expect(data.title).toBe("Fast Cafe");
    expect(data.subtitle).toBe("إيصال الدفع");
    expect(data.fields.waiter).toBeNull();
    expect(data.fields.customer).toBeNull();
  });
});

describe("kitchenDocumentData", () => {
  it("marks void tickets and keeps ticket parts", () => {
    const data = kitchenDocumentData({
      venueName: "Fast Cafe",
      orderId: 7,
      tableName: "T1",
      waiterName: "علي",
      createdAt: "12:30",
      ticketPart: "2/3",
      kind: "void",
      lines: [{ name: "بيتزا", qty: 1, note: "بدون بصل" }],
    });
    expect(data.title).toBe("إلغاء — لا تحضّر");
    expect(data.fields).toMatchObject({
      orderNo: "#7",
      table: "T1",
      waiter: "علي",
      time: "12:30",
      ticketPart: "2/3",
    });
    expect(data.items[0]).toEqual({ name: "بيتزا", qty: "1" });
    expect(data.summary).toBeNull();
  });
});

describe("shiftDocumentData", () => {
  it("maps the three sections, expenses, difference, and status", () => {
    const data = shiftDocumentData(shift);
    expect(data.title).toBe("إغلاق وردية #4");
    expect(data.sections.collection!.rows.map((row) => row.labelId)).toEqual([
      "invoiceCount",
      "total",
      undefined,
      undefined,
      "totalItems",
      "tableQuick",
    ]);
    expect(
      data.sections.expenses!.rows.map((row) => row.labelId ?? row.label),
    ).toEqual(["openingFloat", "شراء ثلج", "expenseTotal"]);
    expect(data.sections.reconciliation!.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labelId: "difference", value: "زيادة 5.00 د.ل", bold: true }),
      ]),
    );
    expect(data.footer).toBe("تم إغلاق الوردية");
    expect(data.status).toBe("تم إغلاق الوردية");
  });

  it("marks a reprinted closed shift as closed", () => {
    const data = shiftDocumentData({ ...shift, kind: "reprint" });
    expect(data.title).toBe("إعادة طباعة وردية #4");
    expect(data.status).toBe("تم إغلاق الوردية");
  });

  it("words matching and short cash differences", () => {
    const matching = shiftDocumentData({ ...shift, countedCash: 500, difference: 0 });
    expect(
      matching.sections.reconciliation!.rows.find((row) => row.labelId === "difference")
        ?.value,
    ).toBe("مطابق");
    const short = shiftDocumentData({ ...shift, countedCash: 492.5, difference: -7.5 });
    expect(
      short.sections.reconciliation!.rows.find((row) => row.labelId === "difference")
        ?.value,
    ).toBe("عجز 7.50 د.ل");
  });

  it("uses the empty-expenses text and an open status", () => {
    const data = shiftDocumentData({
      ...shift,
      kind: "summary",
      expenses: [],
      expenseTotal: 0,
      difference: null,
      countedCash: null,
    });
    expect(
      data.sections.expenses!.rows.map((row) => row.labelId ?? row.label),
    ).toEqual(["openingFloat", "لا مصروفات في هذه الوردية", "expenseTotal"]);
    expect(data.sections.expenses!.rows[1]).toEqual({
      label: "لا مصروفات في هذه الوردية",
      value: "",
    });
    expect(data.status).toBe("الوردية ما زالت مفتوحة");
    expect(
      data.sections.reconciliation!.rows.some((row) => row.labelId === "difference"),
    ).toBe(false);
  });
});

describe("items and sales documents", () => {
  it("groups the items ticket by category with subtotals and a grand total", () => {
    const data = itemsDocumentData(shift);
    expect(data.title).toBe("تقرير أصناف الوردية #4");
    expect(data.sections.overview!.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labelId: "categoryCount", value: "2" }),
        expect.objectContaining({ labelId: "itemCount", value: "3" }),
      ]),
    );
    const groups = data.sections.groups!.groups!;
    expect(groups.map((group) => group.label)).toEqual([
      "مشروبات ساخنة",
      "مشروبات باردة",
    ]);
    expect(groups[0]!.total).toBe("3 قطعة");
    expect(data.summary).toBe("6 قطعة");
  });

  it("renders the empty items state", () => {
    const data = itemsDocumentData({ ...shift, items: [] });
    expect(data.sections.overview!.rows).toEqual([]);
    expect(data.sections.groups!.groups).toEqual([]);
    expect(data.sections.groups!.emptyText).toBe("لا أصناف مبيعة في هذه الوردية");
    expect(data.summary).toBeNull();
  });

  it("maps the sales report totals and both tables", () => {
    const data = salesDocumentData(sales);
    expect(data.title).toBe("تقرير المبيعات");
    expect(data.sections.totals!.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labelId: "total", value: "640.50 د.ل", bold: true }),
        expect.objectContaining({ label: "نقدي", value: "500.50 د.ل" }),
      ]),
    );
    expect(data.sections.categories!.table![0]).toEqual({
      index: "1",
      name: "مشروبات ساخنة",
      qty: "18",
      revenue: "420.50",
    });
    expect(data.sections.itemsList!.table![0]).toEqual({
      index: "1",
      name: "شاي",
      qty: "12",
      revenue: "120.00",
    });
    expect(data.summary).toBe("640.50 د.ل");
  });

  it("prints a no-payments row when nothing was collected", () => {
    const data = salesDocumentData({
      ...sales,
      paymentBreakdown: [],
      totalSales: 0,
      invoiceCount: 0,
    });
    expect(data.sections.totals!.rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ labelId: "noPayments" })]),
    );
  });
});

describe("sample documents", () => {
  it("builds a renderable sample for every document", () => {
    const samples = buildSampleDocuments(settings);
    for (const doc of REPORT_DOCUMENTS) {
      const lines = layoutTemplate(DEFAULT_REPORT_TEMPLATES[doc], samples[doc]);
      expect(lines.length, doc).toBeGreaterThan(0);
    }
    const texts = (doc: (typeof REPORT_DOCUMENTS)[number]) =>
      layoutTemplate(DEFAULT_REPORT_TEMPLATES[doc], samples[doc])
        .filter((line): line is Extract<LayoutLine, { kind: "text" }> => line.kind === "text")
        .map((line) => line.text)
        .join("\n");
    expect(samples.receipt.items).toHaveLength(3);
    expect(samples.receipt.summary).toBe("38.00 د.ل");
    expect(
      JSON.stringify(layoutTemplate(DEFAULT_REPORT_TEMPLATES.receipt, samples.receipt)),
    ).toContain("كرواسون");
    expect(JSON.stringify(samples.kitchen)).toContain("كابتشينو");
    expect(texts("shift")).toContain("إغلاق وردية #4");
    expect(texts("items")).toContain("— مشروبات ساخنة —");
    expect(texts("sales")).toContain("تقرير المبيعات");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/print/templates/data.test.ts`
Expected: FAIL — `Cannot find module './data'`.

- [ ] **Step 3: Create `lib/print/templates/data.ts`**

```ts
import { receiptBrandBlock } from "@/lib/print/brand";
import {
  checkoutReceiptMethodLabel,
  type CheckoutReceiptData,
  type KitchenReceiptData,
  type ReportSummaryPrintData,
  type ShiftItemsPrintData,
  type ShiftReportPrintData,
} from "@/lib/print/receipts";
import type { DocumentData, DocumentSectionData } from "./types";

export type ReceiptDocumentSettings = {
  venueName: string;
  brandName: string;
  brandPhone: string;
  brandAddress: string;
  footer: string;
  logoAvailable: boolean;
};

function money(amount: number): string {
  return `${amount.toFixed(2)} د.ل`;
}

function amount(value: number): string {
  return value.toFixed(2);
}

export function receiptDocumentData(
  input: CheckoutReceiptData,
  settings: ReceiptDocumentSettings,
): DocumentData {
  const brand = receiptBrandBlock({
    venueName: input.venueName || settings.venueName,
    brandName: settings.brandName,
    brandPhone: settings.brandPhone,
    brandAddress: settings.brandAddress,
  });
  return {
    title: brand.title,
    subtitle: brand.subtitle,
    venue: input.venueName || settings.venueName,
    brandPhone: settings.brandPhone,
    brandAddress: settings.brandAddress,
    footer: settings.footer,
    status: "",
    logoAvailable: settings.logoAvailable,
    fields: {
      orderNo: input.orderNo ? String(input.orderNo) : null,
      invoiceId: input.orderId > 0 ? `#${input.orderId}` : "—",
      table: input.tableName || null,
      waiter: input.waiterName?.trim() || null,
      customer: input.customerName?.trim() || null,
      phone: input.customerPhone?.trim() || null,
      cashier: input.cashierName,
      payment: checkoutReceiptMethodLabel(input),
      time: input.paidAt,
    },
    items: input.lines.map((line) => ({
      name: line.name,
      qty: String(line.qty),
      unitPrice: amount(line.unitPrice),
      lineTotal: amount(line.lineTotal),
    })),
    itemNotes: input.lines.map((line) => line.note?.trim() || null),
    sections: {},
    summary: money(input.total),
  };
}

export function kitchenDocumentData(input: KitchenReceiptData): DocumentData {
  return {
    title: input.kind === "void" ? "إلغاء — لا تحضّر" : "طلبات المطبخ",
    subtitle: "",
    venue: input.venueName,
    brandPhone: "",
    brandAddress: "",
    footer: "",
    status: "",
    logoAvailable: false,
    fields: {
      orderNo: `#${input.orderId}`,
      table: input.tableName,
      waiter: input.waiterName,
      time: input.createdAt,
      ticketPart: input.ticketPart ?? null,
    },
    items: input.lines.map((line) => ({
      name: line.name,
      qty: String(line.qty),
    })),
    itemNotes: input.lines.map((line) => line.note?.trim() || null),
    sections: {},
    summary: null,
  };
}

function differenceValue(difference: number | null): string | null {
  if (difference === null) return null;
  if (difference === 0) return "مطابق";
  if (difference > 0) return `زيادة ${money(difference)}`;
  return `عجز ${money(Math.abs(difference))}`;
}

export function shiftDocumentData(input: ShiftReportPrintData): DocumentData {
  const title =
    input.kind === "close"
      ? `إغلاق وردية #${input.shiftNumber}`
      : input.kind === "reprint"
        ? `إعادة طباعة وردية #${input.shiftNumber}`
        : `ملخص وردية #${input.shiftNumber}`;
  const status =
    input.kind === "summary" ? "الوردية ما زالت مفتوحة" : "تم إغلاق الوردية";
  const collection: DocumentSectionData = {
    kind: "kv",
    rows: [
      { labelId: "invoiceCount", value: String(input.invoiceCount) },
      { labelId: "total", value: money(input.totalSales), bold: true },
      ...input.paymentBreakdown.map((payment) => ({
        label: payment.name,
        value: money(payment.total),
      })),
      ...(input.paymentBreakdown.length === 0
        ? [{ labelId: "noPayments", value: money(0) }]
        : []),
      { labelId: "totalItems", value: String(input.totalItems) },
      {
        labelId: "tableQuick",
        value: `${input.tableSales} / ${input.quickSales}`,
      },
    ],
  };
  const expenses: DocumentSectionData = {
    kind: "kv",
    rows: [
      { labelId: "openingFloat", value: money(input.openingFloat) },
      ...input.expenses.map((expense) => ({
        label: expense.reason,
        value: money(expense.amount),
      })),
      ...(input.expenses.length === 0
        ? [{ label: "لا مصروفات في هذه الوردية", value: "" }]
        : []),
      { labelId: "expenseTotal", value: money(input.expenseTotal) },
    ],
  };
  const difference = differenceValue(input.difference);
  const reconciliation: DocumentSectionData = {
    kind: "kv",
    rows: [
      { labelId: "expectedCash", value: money(input.expectedCash) },
      {
        labelId: "countedCash",
        value: input.countedCash === null ? "—" : money(input.countedCash),
      },
      ...(difference ? [{ labelId: "difference", value: difference, bold: true }] : []),
    ],
  };
  return {
    title,
    subtitle: "",
    venue: input.venueName,
    brandPhone: "",
    brandAddress: "",
    footer: status,
    status,
    logoAvailable: false,
    fields: {
      workDate: input.workDate,
      openedAt: input.openedAt,
      closedAt: input.closedAt ?? "مفتوحة",
      printedAt: input.printedAt,
      printedByName: input.printedByName,
      openedByName: input.openedByName,
      closedByName: input.closedByName,
    },
    items: [],
    itemNotes: [],
    sections: { collection, expenses, reconciliation },
    summary: null,
  };
}

export function itemsDocumentData(input: ShiftItemsPrintData): DocumentData {
  const groups: Array<{
    label: string;
    rows: Array<Record<string, string>>;
    total: string;
  }> = [];
  const groupTotals = new Map<string, number>();
  let totalQuantity = 0;
  for (const item of input.items) {
    let group = groups.find((entry) => entry.label === item.categoryName);
    if (!group) {
      group = { label: item.categoryName, rows: [], total: "" };
      groups.push(group);
    }
    group.rows.push({ name: item.name, qty: String(item.qty) });
    groupTotals.set(
      item.categoryName,
      (groupTotals.get(item.categoryName) ?? 0) + item.qty,
    );
    totalQuantity += item.qty;
  }
  for (const group of groups) {
    group.total = `${groupTotals.get(group.label) ?? 0} قطعة`;
  }
  const empty = input.items.length === 0;
  return {
    title: `تقرير أصناف الوردية #${input.shiftNumber}${
      input.kind === "reprint" ? " — إعادة طباعة" : ""
    }`,
    subtitle: "",
    venue: input.venueName,
    brandPhone: "",
    brandAddress: "",
    footer: "",
    status: "",
    logoAvailable: false,
    fields: {
      workDate: input.workDate,
      printedAt: input.printedAt,
      printedByName: input.printedByName,
    },
    items: [],
    itemNotes: [],
    sections: {
      overview: {
        kind: "kv",
        rows: empty
          ? []
          : [
              { labelId: "categoryCount", value: String(groups.length) },
              { labelId: "itemCount", value: String(input.items.length) },
              { labelId: "totalItems", value: String(totalQuantity), bold: true },
            ],
      },
      groups: {
        kind: "groupedTable",
        rows: [],
        groups,
        emptyText: "لا أصناف مبيعة في هذه الوردية",
      },
    },
    summary: empty ? null : `${totalQuantity} قطعة`,
  };
}

export function salesDocumentData(input: ReportSummaryPrintData): DocumentData {
  const totals: DocumentSectionData = {
    kind: "kv",
    rows: [
      { labelId: "total", value: money(input.totalSales), bold: true },
      { labelId: "invoiceCount", value: String(input.invoiceCount) },
      { labelId: "totalItems", value: String(input.totalItems) },
      {
        labelId: "tableQuick",
        value: `${input.tableSales} / ${input.quickSales}`,
      },
      ...input.paymentBreakdown.map((payment) => ({
        label: payment.name,
        value: money(payment.total),
      })),
      ...(input.paymentBreakdown.length === 0
        ? [{ labelId: "noPayments", value: money(0) }]
        : []),
    ],
  };
  const tableRows = (
    rows: Array<{ name: string; qty: number; revenue: number }>,
  ) =>
    rows.map((row, index) => ({
      index: String(index + 1),
      name: row.name,
      qty: String(row.qty),
      revenue: amount(row.revenue),
    }));
  return {
    title: "تقرير المبيعات",
    subtitle: "",
    venue: input.venueName,
    brandPhone: "",
    brandAddress: "",
    footer: "",
    status: "",
    logoAvailable: false,
    fields: {
      from: input.fromLabel,
      to: input.toLabel,
      printedAt: input.printedAt,
    },
    items: [],
    itemNotes: [],
    sections: {
      totals,
      categories: {
        kind: "table",
        rows: [],
        table: tableRows(input.categorySales),
        emptyText: "لا مجموعات في هذه الفترة",
      },
      itemsList: {
        kind: "table",
        rows: [],
        table: tableRows(input.itemSales),
        emptyText: "لا أصناف في هذه الفترة",
      },
    },
    summary: money(input.totalSales),
  };
}
```

- [ ] **Step 4: Create `lib/print/templates/sample.ts`**

```ts
import type {
  CheckoutReceiptData,
  KitchenReceiptData,
  ReportSummaryPrintData,
  ShiftReportPrintData,
} from "@/lib/print/receipts";
import {
  itemsDocumentData,
  kitchenDocumentData,
  receiptDocumentData,
  salesDocumentData,
  shiftDocumentData,
  type ReceiptDocumentSettings,
} from "./data";
import type { DocumentData, ReportDocument } from "./types";

export const sampleSettings: ReceiptDocumentSettings = {
  venueName: "فاست بوس",
  brandName: "REST",
  brandPhone: "0911234567",
  brandAddress: "طرابلس — الشارع الرئيسي",
  footer: "شكراً لزيارتكم — نراكم قريباً",
  logoAvailable: true,
};

const sampleReceipt: CheckoutReceiptData = {
  venueName: "فاست بوس",
  orderId: 148,
  orderNo: 12,
  tableName: "4",
  waiterName: "أحمد",
  customerName: "محمد سالم",
  customerPhone: "0910000000",
  cashierName: "سارة",
  paymentMethod: "cash",
  paymentMethodLabel: "نقدي",
  paidAt: "2026-10-31 14:05",
  total: 38,
  lines: [
    { name: "كابتشينو", qty: 2, unitPrice: 12, lineTotal: 24 },
    { name: "قهوة عربية", qty: 1, unitPrice: 8, lineTotal: 8, note: "بدون سكر" },
    { name: "كرواسون", qty: 1, unitPrice: 6, lineTotal: 6 },
  ],
};

const sampleKitchen: KitchenReceiptData = {
  venueName: "فاست بوس",
  orderId: 148,
  tableName: "4",
  waiterName: "أحمد",
  createdAt: "14:05",
  ticketPart: "1/2",
  kind: "order",
  lines: [
    { name: "كابتشينو", qty: 2 },
    { name: "قهوة عربية", qty: 1, note: "بدون سكر" },
  ],
};

const sampleShift: ShiftReportPrintData = {
  kind: "close",
  shiftNumber: 4,
  venueName: "فاست بوس",
  workDate: "2026-10-31",
  openedAt: "2026-10-31 09:00",
  closedAt: "2026-10-31 18:00",
  printedAt: "2026-10-31 18:00",
  printedByName: "سارة",
  openedByName: "سارة",
  closedByName: "سارة",
  invoiceCount: 12,
  totalSales: 640.5,
  cashTotal: 500.5,
  nonCashTotal: 140,
  paymentBreakdown: [
    { name: "نقدي", total: 500.5, count: 9 },
    { name: "بطاقة", total: 140, count: 3 },
  ],
  totalItems: 28,
  tableSales: 9,
  quickSales: 3,
  items: [
    { name: "شاي", qty: 2, categoryName: "مشروبات ساخنة" },
    { name: "كولا", qty: 3, categoryName: "مشروبات باردة" },
    { name: "قهوة", qty: 1, categoryName: "مشروبات ساخنة" },
  ],
  openingFloat: 50,
  expenseTotal: 12.5,
  expenses: [{ reason: "شراء ثلج", amount: 12.5, createdByName: "سارة" }],
  expectedCash: 500,
  countedCash: 505,
  difference: 5,
};

const sampleSales: ReportSummaryPrintData = {
  venueName: "فاست بوس",
  fromLabel: "2026-10-30 00:00",
  toLabel: "2026-10-31 23:59",
  printedAt: "2026-10-31 18:00",
  invoiceCount: 12,
  totalSales: 640.5,
  cashTotal: 500.5,
  nonCashTotal: 140,
  paymentBreakdown: [
    { name: "نقدي", total: 500.5, count: 9 },
    { name: "بطاقة", total: 140, count: 3 },
  ],
  totalItems: 28,
  tableSales: 9,
  quickSales: 3,
  cancelledCount: 1,
  openCount: 2,
  openTotal: 45,
  categorySales: [
    { name: "مشروبات ساخنة", qty: 18, revenue: 420.5 },
    { name: "مشروبات باردة", qty: 10, revenue: 220 },
  ],
  itemSales: [
    { name: "شاي", qty: 12, revenue: 120 },
    { name: "كابتشينو", qty: 6, revenue: 72 },
  ],
  waiterPerformance: [],
  cashierPerformance: [],
};

export function buildSampleDocuments(
  settings: ReceiptDocumentSettings,
): Record<ReportDocument, DocumentData> {
  return {
    receipt: receiptDocumentData(
      { ...sampleReceipt, venueName: settings.venueName },
      settings,
    ),
    kitchen: kitchenDocumentData({
      ...sampleKitchen,
      venueName: settings.venueName,
    }),
    shift: shiftDocumentData({ ...sampleShift, venueName: settings.venueName }),
    items: itemsDocumentData({ ...sampleShift, venueName: settings.venueName }),
    sales: salesDocumentData({ ...sampleSales, venueName: settings.venueName }),
  };
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run lib/print/templates/data.test.ts`
Expected: PASS. If the `collection.rows` labelId array fails, remember the payment rows have `labelId: undefined` — the expectation uses `undefined` twice.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 6: ESC/POS primitives, column rasterizer, logo widths, byte renderer

**Files:**
- Create: `lib/print/primitives.ts`
- Modify: `lib/print/escpos.ts` (import the moved helpers; replace `center: true`)
- Modify: `lib/print/text-raster.ts` (left alignment, `columnsToText`, `columnsToEscPos`)
- Modify: `lib/print/logo.ts` (`maxWidth` argument, width-aware cache, aligned `appendLogo`)
- Create: `lib/print/templates/render.ts`
- Test: `lib/print/text-raster.test.ts`
- Test: `lib/print/templates/render.test.ts`

**Interfaces:**
- Consumes: `LayoutLine` (Task 1), `pixelWidths` (Task 3).
- Produces: `concat`, `cmd`, `textLine`, `money`, `init`, `align`, `bold`, `doubleSize`, `cut`, `separator`, `printLine`, `LINE_WIDTH`, `CUT_FEED_LINES` from `lib/print/primitives.ts`; `ColumnCell`, `columnsToText(cells, widths)`, `columnsToEscPos(cells, widths)` from `lib/print/text-raster.ts`; `getReceiptLogoEscPos(maxWidth?)` and `appendLogo(parts, logo, align?)` from `lib/print/logo.ts`; `renderLayout(lines, { logo? })` and `TEXT_SIZE_PX` from `lib/print/templates/render.ts`.

- [ ] **Step 1: Write the failing column-renderer tests**

Create `lib/print/text-raster.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { columnsToEscPos, columnsToText } from "./text-raster";

const cells = [
  { text: "Burger", align: "right" as const, fontSize: 26 },
  { text: "2", align: "center" as const, fontSize: 26 },
  { text: "12.00", align: "center" as const, fontSize: 26 },
  { text: "24.00", align: "center" as const, fontSize: 26 },
];

describe("columnsToText", () => {
  it("reverses cells so the first template column sits at the right edge", () => {
    const line = columnsToText(cells, [11, 4, 7, 10]);
    expect(line).toHaveLength(32);
    expect(line.endsWith("Burger")).toBe(true);
    expect(line.indexOf("24.00")).toBeLessThan(line.indexOf("Burger"));
  });

  it("truncates only when a cell cannot fit", () => {
    const line = columnsToText(
      [{ text: "123456789", align: "right", fontSize: 26 }],
      [4],
    );
    expect(line).toHaveLength(4);
    expect(line.endsWith("…")).toBe(true);
  });

  it("pads left, center, and right cells and skips zero widths", () => {
    const line = columnsToText(
      [
        { text: "L", align: "left" },
        { text: "C", align: "center" },
        { text: "R", align: "right" },
        { text: "gone", align: "right" },
      ],
      [4, 4, 4, 0],
    );
    expect(line).toBe("   R C  L   ");
  });
});

describe("columnsToEscPos", () => {
  it("emits one 384 px raster block", () => {
    const bytes = columnsToEscPos(
      [
        { text: "برجر", align: "right", fontSize: 26 },
        { text: "2", align: "center", fontSize: 26 },
      ],
      [48, 336],
    );
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x1d, 0x76, 0x30, 0x00]);
    const bytesPerRow = bytes[4]! | (bytes[5]! << 8);
    expect(bytesPerRow).toBe(48);
  });

  it("keeps the raster at 384 px for left/center cells and zero widths", () => {
    const bytes = columnsToEscPos(
      [
        { text: "Menu", align: "left", fontSize: 26 },
        { text: "وسط", align: "center", fontSize: 32 },
        { text: "", align: "right", fontSize: 26 },
        { text: "5.00", align: "right", fontSize: 26 },
      ],
      [0, 400, 20, 0],
    );
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x1d, 0x76, 0x30, 0x00]);
    const bytesPerRow = bytes[4]! | (bytes[5]! << 8);
    expect(bytesPerRow).toBe(48);
  });
});
```

Create `lib/print/templates/render.test.ts`:

```ts
import iconv from "iconv-lite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { LayoutLine } from "./types";

type RenderFn = typeof import("./render").renderLayout;
let renderLayout: RenderFn;

const columnsLine: LayoutLine = {
  kind: "columns",
  widths: [10, 6, 6, 10],
  cells: [
    { text: "الصنف", align: "right", bold: true, size: "normal" },
    { text: "الكمية", align: "center", bold: true, size: "normal" },
    { text: "السعر", align: "center", bold: true, size: "normal" },
    { text: "الإجمالي", align: "center", bold: true, size: "normal" },
  ],
};

const itemLine: LayoutLine = {
  kind: "columns",
  widths: [10, 6, 6, 10],
  cells: [
    { text: "شاي", align: "right", bold: false, size: "normal" },
    { text: "2", align: "center", bold: false, size: "normal" },
    { text: "5.00", align: "center", bold: false, size: "normal" },
    { text: "10.00", align: "center", bold: false, size: "normal" },
  ],
};

const lines: LayoutLine[] = [
  { kind: "text", text: "Acme Corner", align: "center", bold: true, size: "xlarge" },
  { kind: "separator" },
  columnsLine,
  itemLine,
];

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  ({ renderLayout } = await import("./render"));
});

afterAll(() => {
  delete process.env.PRINTER_ARABIC_RASTER;
});

function decode(bytes: Uint8Array) {
  return iconv.decode(Buffer.from(bytes), "win1256");
}

function lastCut(bytes: Uint8Array) {
  for (let index = bytes.length - 3; index >= 0; index -= 1) {
    if (
      bytes[index] === 0x1d &&
      bytes[index + 1] === 0x56 &&
      bytes[index + 2] === 0x00
    ) {
      let feed = 0;
      for (let position = index - 1; position >= 0; position -= 1) {
        if (bytes[position] !== 0x0a) break;
        feed += 1;
      }
      return { index, feed };
    }
  }
  return null;
}

function contains(bytes: Uint8Array, sequence: number[]) {
  return bytes.some((_, index) =>
    sequence.every((value, offset) => bytes[index + offset] === value),
  );
}

describe("renderLayout", () => {
  it("renders the four column labels and padded amounts without x/= item lines", () => {
    const text = decode(renderLayout(lines));
    expect(text).toContain("الصنف");
    expect(text).toContain("الكمية");
    expect(text).toContain("السعر");
    expect(text).toContain("الإجمالي");
    expect(text).toContain("10.00");
    expect(text).not.toMatch(/\d+ x /);
    expect(text).toContain("-".repeat(32));
  });

  it("starts with init and ends with an eight-line cut feed", () => {
    const bytes = renderLayout(lines);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
    const cut = lastCut(bytes);
    expect(cut).not.toBeNull();
    expect(cut!.feed).toBeGreaterThanOrEqual(8);
  });

  it("sets bold and double size for xlarge lines", () => {
    const bytes = renderLayout([
      { kind: "text", text: "Acme", align: "center", bold: true, size: "xlarge" },
    ]);
    expect(contains(bytes, [0x1d, 0x21, 0x11])).toBe(true);
    expect(contains(bytes, [0x1b, 0x45, 0x01])).toBe(true);
  });

  it("only emits a centered logo when one is supplied", () => {
    const line: LayoutLine = { kind: "logo", align: "center", maxWidth: 256 };
    const logo = new Uint8Array([
      0x1d, 0x76, 0x30, 0x00, 0x01, 0x00, 0x01, 0x00, 0xff,
    ]);
    const withLogo = renderLayout([line], { logo });
    expect(contains(withLogo, [0x1b, 0x61, 0x01])).toBe(true);
    expect(renderLayout([line], { logo: null }).length).toBe(
      renderLayout([]).length,
    );
  });

  it("emits a raster block per column row when raster mode is enabled", async () => {
    process.env.PRINTER_ARABIC_RASTER = "1";
    vi.resetModules();
    const { renderLayout: rasterRender } = await import("./render");
    const bytes = rasterRender([itemLine]);
    expect(contains(bytes, [0x1d, 0x76, 0x30, 0x00])).toBe(true);
    process.env.PRINTER_ARABIC_RASTER = "0";
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/print/text-raster.test.ts lib/print/templates/render.test.ts`
Expected: FAIL — `columnsToText` is not exported and `./render` cannot be found.

- [ ] **Step 3: Create `lib/print/primitives.ts`**

Move the shared byte helpers out of `lib/print/escpos.ts`:

```ts
import {
  encodePrinterText,
  hasArabicText,
  isArabicRasterEnabled,
  normalizePrinterText,
  printerInitBytes,
  restorePrinterTextMode,
} from "./encoding";
import { textToEscPosRaster } from "./text-raster";

export const ESC = 0x1b;
export const GS = 0x1d;
export const LINE_WIDTH = 32;

export function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function cmd(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

export function textLine(value = ""): Uint8Array {
  return concat(encodePrinterText(value), new Uint8Array([0x0a]));
}

export function money(amount: number): string {
  return `${amount.toFixed(2)} د.ل`;
}

export function init(): Uint8Array {
  return printerInitBytes();
}

export function align(mode: "left" | "center" | "right"): Uint8Array {
  const value = mode === "left" ? 0 : mode === "center" ? 1 : 2;
  return cmd(ESC, 0x61, value);
}

export function bold(on: boolean): Uint8Array {
  return cmd(ESC, 0x45, on ? 1 : 0);
}

export function doubleSize(on: boolean): Uint8Array {
  return cmd(GS, 0x21, on ? 0x11 : 0x00);
}

/** Blank feed before cutting: the cutter sits ~30mm past the print head. */
export const CUT_FEED_LINES = 8;

export function cut(): Uint8Array {
  return concat(
    ...Array.from({ length: CUT_FEED_LINES }, () => textLine()),
    cmd(GS, 0x56, 0x00),
  );
}

export function separator(): Uint8Array {
  return textLine("--------------------------------");
}

export type PrintLineOptions = {
  bold?: boolean;
  align?: "left" | "center" | "right";
  fontSize?: number;
};

export function printLine(
  parts: Uint8Array[],
  value: string,
  options: PrintLineOptions = {},
): void {
  const normalized = normalizePrinterText(value);
  if (!normalized) {
    parts.push(textLine(""));
    return;
  }

  const alignMode = options.align ?? "right";

  if (isArabicRasterEnabled() && hasArabicText(normalized)) {
    parts.push(align(alignMode));
    parts.push(
      textToEscPosRaster(normalized, {
        bold: options.bold,
        fontSize: options.fontSize,
        align: alignMode,
      }),
    );
    parts.push(restorePrinterTextMode(alignMode));
    return;
  }

  if (alignMode !== "right") parts.push(align(alignMode));
  if (options.bold) parts.push(bold(true));
  if (options.fontSize && options.fontSize >= 32) parts.push(doubleSize(true));
  parts.push(textLine(normalized));
  if (options.fontSize && options.fontSize >= 32) parts.push(doubleSize(false));
  if (options.bold) parts.push(bold(false));
  if (alignMode !== "right") parts.push(align("right"));
}
```

- [ ] **Step 4: Switch `lib/print/escpos.ts` to the shared helpers**

Replace its `./encoding` import and delete the local helper definitions:

```ts
import type {
  CheckoutReceiptData,
  KitchenReceiptData,
  ReportSummaryPrintData,
  ShiftItemsPrintData,
  ShiftReportPrintData,
} from "./receipts";
import { checkoutReceiptMethodLabel } from "./receipts";
import {
  hasArabicText,
  isArabicRasterEnabled,
  normalizePrinterText,
  restorePrinterTextMode,
} from "./encoding";
import { appendLogo } from "./logo";
import { receiptBrandBlock } from "./brand";
import { textToEscPosRaster } from "./text-raster";
import {
  LINE_WIDTH,
  align,
  bold,
  concat,
  cut,
  init,
  money,
  printLine,
  separator,
  textLine,
} from "./primitives";
```

Delete everything from `const ESC = 0x1b;` through the end of the old `printLine` function (the block ending at `if (options.bold) parts.push(bold(false));\n}`), including `cmd`, `textLine`, `money`, `reportSep`, `init`, `align`, `bold`, `doubleSize`, `CUT_FEED_LINES`, `cut`, `separator`, and `printLine`. Keep `fieldLine`, `wrapText`, `printWrappedName`, `headerBlock`, `kitchenLine`, `kitchenSep`, the chunk helpers, and every builder.

Then replace every `center: true` in the remaining code with `align: "center"` (11 occurrences: `headerBlock`, the sales report headings, shift footer, items group headings, checkout footer, and the test print). `printLine` no longer accepts `center`.

- [ ] **Step 5: Extend `lib/print/text-raster.ts`**

Add `hasArabicText` to the `./encoding` import, widen `textToEscPosRaster`'s alignment, and append the column functions:

```ts
export function textToEscPosRaster(
  text: string,
  options: {
    bold?: boolean;
    fontSize?: number;
    align?: "right" | "center" | "left";
  } = {},
): Uint8Array {
  const value = normalizePrinterText(text);
  const fontSize = options.fontSize ?? (options.bold ? 30 : 26);
  const lineHeight = fontSize + 10;
  const align = options.align ?? "right";
  const maxWidth = RASTER_WIDTH - SIDE_PAD * 2;

  const measureCanvas = createCanvas(RASTER_WIDTH, lineHeight);
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.font = `${options.bold ? "bold " : ""}${fontSize}px Tahoma, "Segoe UI", Arial, sans-serif`;

  const rows = wrapMeasured(measureCtx, value, maxWidth);
  const height = Math.max(lineHeight, rows.length * lineHeight);
  const canvas = createCanvas(RASTER_WIDTH, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, RASTER_WIDTH, height);
  ctx.fillStyle = "#000000";
  ctx.font = `${options.bold ? "bold " : ""}${fontSize}px Tahoma, "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";

  const x =
    align === "center"
      ? RASTER_WIDTH / 2
      : align === "left"
        ? SIDE_PAD
        : RASTER_WIDTH - SIDE_PAD;
  rows.forEach((row, index) => {
    ctx.fillText(row, x, index * lineHeight + lineHeight / 2);
  });

  const png = PNG.sync.read(canvas.toBuffer("image/png"));
  return pngToEscPosRaster(png, RASTER_WIDTH);
}
```

Append:

```ts
export type ColumnCell = {
  text: string;
  align: "left" | "center" | "right";
  bold?: boolean;
  fontSize?: number;
};

const COLUMN_FONT_FAMILY = 'Tahoma, "Segoe UI", Arial, sans-serif';

function fitCell(
  text: string,
  width: number,
  align: "left" | "center" | "right",
): string {
  if (width <= 0) return "";
  const value =
    text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text;
  const pad = Math.max(0, width - value.length);
  if (align === "left") return value + " ".repeat(pad);
  if (align === "center") {
    const left = Math.floor(pad / 2);
    return " ".repeat(left) + value + " ".repeat(pad - left);
  }
  return " ".repeat(pad) + value;
}

/** Text fallback: the first template column is printed at the right edge. */
export function columnsToText(
  cells: Array<{ text: string; align?: "left" | "center" | "right" }>,
  widths: number[],
): string {
  let line = "";
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    const cell = cells[index]!;
    line += fitCell(cell.text, widths[index] ?? 0, cell.align ?? "right");
  }
  return line;
}

export function columnsToEscPos(
  cells: ColumnCell[],
  widths: number[],
): Uint8Array {
  const largest = Math.max(...cells.map((cell) => cell.fontSize ?? 26), 20);
  const lineHeight = largest + 10;
  const canvas = createCanvas(RASTER_WIDTH, lineHeight);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, RASTER_WIDTH, lineHeight);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "middle";

  const bounds: Array<{ left: number; right: number; width: number }> = [];
  let offset = 0;
  for (const width of widths) {
    const right = Math.min(RASTER_WIDTH, Math.max(0, RASTER_WIDTH - offset));
    offset += width;
    const left = Math.min(right, Math.max(0, right - width));
    bounds.push({ left, right, width: Math.max(0, right - left) });
  }

  cells.forEach((cell, index) => {
    const bound = bounds[index];
    if (!bound || bound.width <= 0) return;

    const alignMode = cell.align ?? "right";
    let fontSize = Math.max(20, cell.fontSize ?? 26);
    let text = normalizePrinterText(cell.text);
    const font = () =>
      `${cell.bold ? "bold " : ""}${fontSize}px ${COLUMN_FONT_FAMILY}`;

    ctx.font = font();
    while (fontSize > 20 && ctx.measureText(text).width > bound.width - 4) {
      fontSize -= 2;
      ctx.font = font();
    }
    if (ctx.measureText(text).width > bound.width) {
      while (
        text.length > 1 &&
        ctx.measureText(`${text}…`).width > bound.width
      ) {
        text = text.slice(0, -1);
      }
      text = `${text}…`;
    }

    ctx.direction = hasArabicText(text) ? "rtl" : "ltr";
    ctx.textAlign = alignMode;
    const x = Math.min(
      RASTER_WIDTH,
      Math.max(
        0,
        alignMode === "left"
          ? bound.left + 2
          : alignMode === "center"
            ? bound.left + bound.width / 2
            : bound.right - 2,
      ),
    );
    ctx.fillText(text, x, lineHeight / 2);
  });

  const png = PNG.sync.read(canvas.toBuffer("image/png"));
  return pngToEscPosRaster(png, RASTER_WIDTH);
}
```

- [ ] **Step 6: Update `lib/print/logo.ts`**

Replace the single-value logo cache with a width-keyed cache, give `getReceiptLogoEscPos` an optional width, and allow `appendLogo` to honor an alignment:

```ts
const MAX_WIDTH = 384;

const escposCache = new Map<string, Uint8Array | null>();

export function clearReceiptLogoCache() {
  escposCache.clear();
}

export async function getReceiptLogoEscPos(
  maxWidth = MAX_WIDTH,
): Promise<Uint8Array | null> {
  const cacheKey = `${getLogoCacheKey()}:${maxWidth}`;
  if (escposCache.has(cacheKey)) return escposCache.get(cacheKey) ?? null;

  try {
    const png = readLogoPixels();
    if (!png) {
      escposCache.set(cacheKey, null);
      return null;
    }
    const bytes = pngToEscPosRaster(png, maxWidth);
    escposCache.set(cacheKey, bytes);
    return bytes;
  } catch {
    escposCache.set(cacheKey, null);
    return null;
  }
}

export function appendLogo(
  parts: Uint8Array[],
  logo: Uint8Array | null,
  align: "left" | "center" | "right" = "center",
) {
  if (!logo) return;
  const ESC = 0x1b;
  const mode = align === "left" ? 0 : align === "center" ? 1 : 2;

  parts.push(new Uint8Array([ESC, 0x61, mode]));
  parts.push(logo);
  parts.push(new Uint8Array([0x0a]));
  parts.push(restorePrinterTextMode("right"));
}
```

Remove the old `cachedLogo` / `cachedEscPosLogoKey` variables. Existing callers that pass no width keep the 384 px behavior.

- [ ] **Step 7: Create `lib/print/templates/render.ts`**

```ts
import { isArabicRasterEnabled, restorePrinterTextMode } from "../encoding";
import { appendLogo } from "../logo";
import {
  align,
  concat,
  cut,
  init,
  printLine,
  separator,
  textLine,
} from "../primitives";
import { columnsToEscPos, columnsToText } from "../text-raster";
import { pixelWidths } from "./columns";
import type { LayoutLine, TextSize } from "./types";

export const TEXT_SIZE_PX: Record<TextSize, number> = {
  small: 22,
  normal: 26,
  large: 30,
  xlarge: 34,
};

export type RenderOptions = { logo?: Uint8Array | null };

function renderColumns(
  parts: Uint8Array[],
  line: Extract<LayoutLine, { kind: "columns" }>,
) {
  const cells = line.cells.map((cell) => ({
    text: cell.text,
    align: cell.align,
    bold: cell.bold,
    fontSize: TEXT_SIZE_PX[cell.size],
  }));

  if (isArabicRasterEnabled()) {
    parts.push(align("right"));
    parts.push(columnsToEscPos(cells, pixelWidths(line.widths, 384)));
    parts.push(restorePrinterTextMode("right"));
    return;
  }

  parts.push(align("right"), textLine(columnsToText(cells, line.widths)));
}

export function renderLayout(
  lines: LayoutLine[],
  options: RenderOptions = {},
): Uint8Array {
  const parts: Uint8Array[] = [init()];

  for (const line of lines) {
    if (line.kind === "separator") {
      parts.push(align("right"), separator());
      continue;
    }
    if (line.kind === "logo") {
      appendLogo(parts, options.logo ?? null, line.align);
      continue;
    }
    if (line.kind === "columns") {
      renderColumns(parts, line);
      continue;
    }
    printLine(parts, line.text, {
      bold: line.bold,
      align: line.align,
      fontSize: TEXT_SIZE_PX[line.size],
    });
  }

  parts.push(cut());
  return concat(...parts);
}
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run lib/print/text-raster.test.ts lib/print/templates/render.test.ts lib/print/kitchen-font.test.ts lib/print/escpos-cut.test.ts lib/print/order-number.test.ts`
Expected: PASS. The raster-enabled case uses the real canvas; if `ctx.direction` is rejected by the installed `@napi-rs/canvas` types, remove that assignment (the numeric cells stay LTR and Arabic shaping still follows `textAlign`).

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `textToEscPosRaster`'s widened `align` conflicts with a caller typed as `"right" | "center"`, update that caller's option type — it is a widening, not a behavior change.

---

### Task 7: Storage, async builders, and print-entry migration

**Files:**
- Modify: `lib/settings.ts` (export value helpers)
- Create: `lib/print/templates/store.ts`
- Create: `lib/print/templates/build.ts`
- Modify: `lib/print/checkout-bytes.ts`
- Modify: `app/actions/orders.ts`, `app/actions/shifts.ts`, `app/actions/reports.ts`
- Modify: `lib/print/escpos.ts` (delete the old document builders)
- Test: `lib/print/templates/store.test.ts`
- Test: `lib/print/templates/build.test.ts`
- Test (port): `lib/print/order-number.test.ts`, `lib/print/receipts.test.ts`, `lib/print/escpos.brand.test.ts`, `lib/print/shift-report.test.ts`, `lib/print/kitchen-font.test.ts`, `lib/print/escpos-cut.test.ts`
- Test (mocks): `lib/orders/kitchen-skip.test.ts`, `lib/orders/pay-hold.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_REPORT_TEMPLATES` (Task 2), `parseReportTemplateJson` (Task 1), adapters and samples (Task 5), `renderLayout` (Task 6).
- Produces: `getSettingValue`, `setSettingValue`, `deleteSettingValue`; `loadReportTemplate`, `getReportTemplateJson`, `persistReportTemplate`, `deleteReportTemplate`, `reportTemplateKey`; `buildReceiptEscPos`, `buildKitchenEscPos`, `buildShiftReportEscPos`, `buildShiftItemsEscPos`, `buildSalesReportEscPos`, `buildSampleEscPos`, `BuildOverrides`, `SampleBuildOptions`.

- [ ] **Step 1: Write the failing store and builder tests**

Create `lib/print/templates/store.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock("@/lib/settings", () => ({
  getSettingValue: (key: string) => state.values.get(key) ?? null,
  setSettingValue: (key: string, value: string) => {
    state.values.set(key, value);
  },
  deleteSettingValue: (key: string) => {
    state.values.delete(key);
  },
}));

import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import {
  deleteReportTemplate,
  getReportTemplateJson,
  loadReportTemplate,
  persistReportTemplate,
} from "./store";

beforeEach(() => {
  state.values.clear();
});

describe("report template store", () => {
  it("returns the default when nothing is stored", () => {
    expect(loadReportTemplate("receipt")).toEqual(
      DEFAULT_REPORT_TEMPLATES.receipt,
    );
  });

  it("round-trips a persisted template and isolates documents", () => {
    const edited = {
      ...DEFAULT_REPORT_TEMPLATES.receipt,
      labels: { ...DEFAULT_REPORT_TEMPLATES.receipt.labels, orderNo: "طلب" },
    };
    expect(persistReportTemplate("receipt", JSON.stringify(edited))).toEqual({
      ok: true,
    });
    expect(loadReportTemplate("receipt").labels.orderNo).toBe("طلب");
    expect(loadReportTemplate("kitchen")).toEqual(
      DEFAULT_REPORT_TEMPLATES.kitchen,
    );
    expect(getReportTemplateJson("receipt")).toContain('"طلب"');
  });

  it("rejects invalid JSON without touching the stored value", () => {
    persistReportTemplate(
      "receipt",
      JSON.stringify(DEFAULT_REPORT_TEMPLATES.receipt),
    );
    const result = persistReportTemplate("receipt", "{");
    expect(result.ok).toBe(false);
    expect(loadReportTemplate("receipt")).toEqual(
      DEFAULT_REPORT_TEMPLATES.receipt,
    );
  });

  it("deletes the stored row", () => {
    persistReportTemplate(
      "receipt",
      JSON.stringify(DEFAULT_REPORT_TEMPLATES.receipt),
    );
    deleteReportTemplate("receipt");
    expect(state.values.has("report_template.receipt")).toBe(false);
    expect(loadReportTemplate("receipt")).toEqual(
      DEFAULT_REPORT_TEMPLATES.receipt,
    );
  });

  it("falls back and warns once for a malformed stored template", async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.values.set("report_template.shift", "{");
    const fresh = await import("./store");
    expect(fresh.loadReportTemplate("shift")).toEqual(
      DEFAULT_REPORT_TEMPLATES.shift,
    );
    fresh.loadReportTemplate("shift");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("[report-template] shift");
    warn.mockRestore();
  });
});
```

Create `lib/print/templates/build.test.ts`:

```ts
import iconv from "iconv-lite";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import type {
  CheckoutReceiptData,
  KitchenReceiptData,
  ReportSummaryPrintData,
} from "@/lib/print/receipts";

type BuildModule = typeof import("./build");
let build: BuildModule;

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  build = await import("./build");
});

const receipt: CheckoutReceiptData = {
  venueName: "Fast Cafe",
  orderId: 12,
  orderNo: 7,
  tableName: "4",
  waiterName: "أحمد",
  customerName: "محمد سالم",
  customerPhone: "0910000000",
  cashierName: "سارة",
  paymentMethod: "cash",
  paymentMethodLabel: "نقدي",
  paidAt: "2026-10-31 14:05",
  total: 32,
  lines: [
    { name: "كابتشينو", qty: 2, unitPrice: 12, lineTotal: 24 },
    { name: "قهوة عربية", qty: 1, unitPrice: 8, lineTotal: 8 },
  ],
};

const kitchen: KitchenReceiptData = {
  venueName: "Fast Cafe",
  orderId: 12,
  tableName: "4",
  waiterName: "أحمد",
  createdAt: "14:05",
  kind: "order",
  lines: [{ name: "بيتزا", qty: 2 }],
};

const sales: ReportSummaryPrintData = {
  venueName: "Fast Cafe",
  fromLabel: "2026-10-30 00:00",
  toLabel: "2026-10-31 23:59",
  printedAt: "2026-10-31 18:00",
  invoiceCount: 2,
  totalSales: 30,
  cashTotal: 20,
  nonCashTotal: 10,
  paymentBreakdown: [{ name: "نقدي", total: 20, count: 1 }],
  totalItems: 3,
  tableSales: 1,
  quickSales: 1,
  cancelledCount: 0,
  openCount: 0,
  openTotal: 0,
  categorySales: [{ name: "مشروبات ساخنة", qty: 2, revenue: 20 }],
  itemSales: [{ name: "شاي", qty: 2, revenue: 20 }],
  waiterPerformance: [],
  cashierPerformance: [],
};

const receiptOverrides = {
  template: DEFAULT_REPORT_TEMPLATES.receipt,
  settings: { logoAvailable: false },
  logo: null,
};

function decode(bytes: Uint8Array) {
  return iconv.decode(Buffer.from(bytes), "win1256");
}

describe("template builders", () => {
  it("builds the receipt with the four-column item table", async () => {
    const text = decode(await build.buildReceiptEscPos(receipt, receiptOverrides));

    expect(text).toContain("رقم الطلب: 7");
    expect(text).toContain("فاتورة: #12");
    expect(text).toContain("محمد سالم");
    expect(text).toContain("0910000000");
    expect(text).toContain("الصنف");
    expect(text).toContain("الكمية");
    expect(text).toContain("السعر");
    expect(text).toContain("الإجمالي");
    expect(text).toContain("24.00");
    expect(text).toContain("32.00");
    expect(text).not.toMatch(/\d+ x /);
  });

  it("omits totals from kitchen tickets", async () => {
    const text = decode(
      await build.buildKitchenEscPos(kitchen, {
        template: DEFAULT_REPORT_TEMPLATES.kitchen,
        logo: null,
      }),
    );

    expect(text).toContain("طلبات المطبخ");
    expect(text).toContain("بيتزا");
    expect(text).not.toContain("الإجمالي");
    expect(text).not.toContain("د.ل");
  });

  it("renders the sales report sections and the final total", async () => {
    const text = decode(
      await build.buildSalesReportEscPos(sales, {
        template: DEFAULT_REPORT_TEMPLATES.sales,
        logo: null,
      }),
    );

    expect(text).toContain("تقرير المبيعات");
    expect(text).toContain("المجموعات");
    expect(text).toContain("مشروبات ساخنة");
    expect(text).toContain("الإجمالي النهائي");
  });

  it("builds a sample document from a validated template", async () => {
    const text = decode(
      await build.buildSampleEscPos(
        "receipt",
        DEFAULT_REPORT_TEMPLATES.receipt,
        { settings: { logoAvailable: false }, logo: null },
      ),
    );

    expect(text).toContain("كابتشينو");
    expect(text).toContain("الصنف");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/print/templates/store.test.ts lib/print/templates/build.test.ts`
Expected: FAIL — `Cannot find module './store'` / `'./build'`.

- [ ] **Step 3: Export the settings value helpers**

In `lib/settings.ts`, keep `getSetting`/`setSetting` private and add:

```ts
export function getSettingValue(key: string): string | null {
  return getSetting(key);
}

export function setSettingValue(key: string, value: string): void {
  setSetting(key, value);
}

export function deleteSettingValue(key: string): void {
  const sqlite = getSqlite();
  sqlite.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
}
```

- [ ] **Step 4: Create `lib/print/templates/store.ts`**

```ts
import {
  deleteSettingValue,
  getSettingValue,
  setSettingValue,
} from "@/lib/settings";
import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import { parseReportTemplateJson } from "./schema";
import type { ReportDocument, ReportTemplate } from "./types";

export const REPORT_TEMPLATE_KEY_PREFIX = "report_template.";

export function reportTemplateKey(document: ReportDocument): string {
  return `${REPORT_TEMPLATE_KEY_PREFIX}${document}`;
}

const warned = new Set<ReportDocument>();

export function loadReportTemplate(document: ReportDocument): ReportTemplate {
  const stored = getSettingValue(reportTemplateKey(document));
  if (!stored) return DEFAULT_REPORT_TEMPLATES[document];

  const result = parseReportTemplateJson(stored, document);
  if (result.ok) return result.template;

  if (!warned.has(document)) {
    warned.add(document);
    console.warn(
      `[report-template] ${document}: ${result.errors.join("; ")}; using default`,
    );
  }
  return DEFAULT_REPORT_TEMPLATES[document];
}

export function getReportTemplateJson(document: ReportDocument): string {
  return JSON.stringify(loadReportTemplate(document), null, 2);
}

export function persistReportTemplate(
  document: ReportDocument,
  json: string,
): { ok: true } | { ok: false; errors: string[] } {
  const result = parseReportTemplateJson(json, document);
  if (!result.ok) return { ok: false, errors: result.errors };

  setSettingValue(reportTemplateKey(document), JSON.stringify(result.template));
  warned.delete(document);
  return { ok: true };
}

export function deleteReportTemplate(document: ReportDocument): void {
  deleteSettingValue(reportTemplateKey(document));
}
```

Run: `npx vitest run lib/print/templates/store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Create `lib/print/templates/build.ts`**

```ts
import {
  getBrandDetails,
  getReceiptFooterMessage,
} from "@/lib/settings";
import type {
  CheckoutReceiptData,
  KitchenReceiptData,
  ReportSummaryPrintData,
  ShiftItemsPrintData,
  ShiftReportPrintData,
} from "../receipts";
import { getReceiptLogoEscPos } from "../logo";
import {
  itemsDocumentData,
  kitchenDocumentData,
  receiptDocumentData,
  salesDocumentData,
  shiftDocumentData,
  type ReceiptDocumentSettings,
} from "./data";
import { layoutTemplate } from "./layout";
import { renderLayout } from "./render";
import { buildSampleDocuments } from "./sample";
import { loadReportTemplate } from "./store";
import type {
  DocumentData,
  ReportDocument,
  ReportTemplate,
} from "./types";

export type BuildOverrides = {
  template?: ReportTemplate;
  logo?: Uint8Array | null;
  settings?: Partial<ReceiptDocumentSettings>;
};

export type SampleBuildOptions = {
  logo?: Uint8Array | null;
  settings?: Partial<ReceiptDocumentSettings>;
};

function storedSettings(): Omit<ReceiptDocumentSettings, "venueName"> {
  const brand = getBrandDetails();
  return {
    brandName: brand.name,
    brandPhone: brand.phone,
    brandAddress: brand.address,
    footer: getReceiptFooterMessage(),
    logoAvailable: true,
  };
}

function resolveSettings(
  venueName: string,
  overrides?: Partial<ReceiptDocumentSettings>,
): ReceiptDocumentSettings {
  const base: Omit<ReceiptDocumentSettings, "venueName"> = overrides
    ? {
        brandName: "",
        brandPhone: "",
        brandAddress: "",
        footer: "",
        logoAvailable: false,
      }
    : storedSettings();
  return {
    ...base,
    ...(overrides ?? {}),
    venueName,
  };
}

async function renderDocument(
  document: ReportDocument,
  data: DocumentData,
  overrides: BuildOverrides,
): Promise<Uint8Array> {
  const template = overrides.template ?? loadReportTemplate(document);
  let logo: Uint8Array | null = null;

  if (overrides.logo !== undefined) {
    logo = overrides.logo;
  } else if (template.header.logo.show && data.logoAvailable) {
    logo = await getReceiptLogoEscPos(template.header.logo.maxWidth ?? 256);
  }

  return renderLayout(layoutTemplate(template, data), { logo });
}

export async function buildReceiptEscPos(
  data: CheckoutReceiptData,
  overrides: BuildOverrides = {},
): Promise<Uint8Array> {
  const settings = resolveSettings(data.venueName, overrides.settings);
  return renderDocument(
    "receipt",
    receiptDocumentData(data, settings),
    overrides,
  );
}

export async function buildKitchenEscPos(
  data: KitchenReceiptData,
  overrides: BuildOverrides = {},
): Promise<Uint8Array> {
  return renderDocument("kitchen", kitchenDocumentData(data), overrides);
}

export async function buildShiftReportEscPos(
  data: ShiftReportPrintData,
  overrides: BuildOverrides = {},
): Promise<Uint8Array> {
  return renderDocument("shift", shiftDocumentData(data), overrides);
}

export async function buildShiftItemsEscPos(
  data: ShiftItemsPrintData,
  overrides: BuildOverrides = {},
): Promise<Uint8Array> {
  return renderDocument("items", itemsDocumentData(data), overrides);
}

export async function buildSalesReportEscPos(
  data: ReportSummaryPrintData,
  overrides: BuildOverrides = {},
): Promise<Uint8Array> {
  return renderDocument("sales", salesDocumentData(data), overrides);
}

export async function buildSampleEscPos(
  document: ReportDocument,
  template: ReportTemplate,
  options: SampleBuildOptions = {},
): Promise<Uint8Array> {
  const settings = resolveSettings("فاست بوس", options.settings);
  const data = buildSampleDocuments(settings)[document];

  let logo: Uint8Array | null = null;
  if (options.logo !== undefined) {
    logo = options.logo;
  } else if (template.header.logo.show && data.logoAvailable) {
    logo = await getReceiptLogoEscPos(template.header.logo.maxWidth ?? 256);
  }

  return renderLayout(layoutTemplate(template, data), { logo });
}
```

Run: `npx vitest run lib/print/templates/build.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Delegate the checkout byte builder**

Replace `lib/print/checkout-bytes.ts` with:

```ts
import type { CheckoutReceiptData } from "./receipts";
import { buildReceiptEscPos } from "./templates/build";

export async function buildCheckoutPrintBytes(
  receipt: CheckoutReceiptData,
): Promise<Uint8Array> {
  return buildReceiptEscPos(receipt);
}
```

The old file merged brand/footer/logo itself; `buildReceiptEscPos` now owns that merge, so the signature stays identical for `app/actions/orders.ts`.

- [ ] **Step 7: Await the new builders at every print entry point**

`app/actions/orders.ts`:

```ts
import { chunkKitchenLines } from "@/lib/print/escpos";
import { buildKitchenEscPos } from "@/lib/print/templates/build";
```

Replace `buildKitchenEscPos` import from `@/lib/print/escpos`, then prefix both calls with `await`:

- the void ticket call (currently `const data = buildKitchenEscPos({ ... });`)
- the chunked call (currently `const payload = buildKitchenEscPos({ ... });`)

`app/actions/shifts.ts`:

```ts
import {
  buildShiftItemsEscPos,
  buildShiftReportEscPos,
} from "@/lib/print/templates/build";
```

Replace the old import from `@/lib/print/escpos` and await both calls inside `printShiftReportData`:

```ts
      await buildShiftReportEscPos(data),
```

```ts
      await buildShiftItemsEscPos(data),
```

`app/actions/reports.ts`:

```ts
import { buildSalesReportEscPos } from "@/lib/print/templates/build";
```

Replace the old import and await the call:

```ts
    const bytes = await buildSalesReportEscPos(data);
```

- [ ] **Step 8: Port the print tests to the async builders**

Every ported test file that imports `./templates/build` MUST declare this mock before its
dynamic import, because `build.ts` → `@/lib/settings` → `@/lib/db` opens the live database at
module load:

```ts
vi.mock("@/lib/settings", () => ({
  getSettingValue: () => null,
  setSettingValue: () => {},
  deleteSettingValue: () => {},
  getBrandDetails: () => ({ name: "", phone: "", address: "" }),
  getReceiptFooterMessage: () => "",
}));
```

Passing builder overrides does NOT prevent the import-time DB open.

Replace `lib/print/order-number.test.ts`:

```ts
import iconv from "iconv-lite";
import { beforeAll, describe, expect, it } from "vitest";
import type { CheckoutReceiptData } from "./receipts";
import { DEFAULT_REPORT_TEMPLATES } from "./templates/defaults";

type BuildFn = typeof import("./templates/build").buildReceiptEscPos;

let buildReceiptEscPos: BuildFn;

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  ({ buildReceiptEscPos } = await import("./templates/build"));
});

const base: CheckoutReceiptData = {
  venueName: "Fast Cafe",
  orderId: 12,
  tableName: "Quick sale",
  waiterName: null,
  cashierName: "Cashier",
  paymentMethod: "cash",
  paidAt: "2026-10-24 10:00:00",
  total: 10,
  lines: [{ name: "Tea", qty: 1, unitPrice: 10, lineTotal: 10 }],
};

const overrides = {
  template: DEFAULT_REPORT_TEMPLATES.receipt,
  settings: { logoAvailable: false },
  logo: null,
};

describe("order number on the checkout receipt", () => {
  it("prints the order number in the ESC/POS receipt", async () => {
    const text = iconv.decode(
      Buffer.from(
        await buildReceiptEscPos({ ...base, orderNo: 7 }, overrides),
      ),
      "win1256",
    );

    expect(text).toContain("رقم الطلب: 7");
    expect(text).toContain("فاتورة: #12");
    expect(text.indexOf("رقم الطلب")).toBeLessThan(text.indexOf("فاتورة:"));
  });

  it("omits the order number line in the ESC/POS receipt when absent", async () => {
    const text = iconv.decode(
      Buffer.from(await buildReceiptEscPos(base, overrides)),
      "win1256",
    );

    expect(text).not.toContain("رقم الطلب");
  });
});
```

Replace `lib/print/receipts.test.ts`:

```ts
import iconv from "iconv-lite";
import { beforeAll, describe, expect, it } from "vitest";
import { nowSqlTripoli } from "@/lib/time/tripoli";
import { formatDateTime } from "@/lib/venues";
import type { CheckoutReceiptData } from "./receipts";
import { DEFAULT_REPORT_TEMPLATES } from "./templates/defaults";

type BuildFn = typeof import("./templates/build").buildReceiptEscPos;

let buildReceiptEscPos: BuildFn;

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  ({ buildReceiptEscPos } = await import("./templates/build"));
});

const base: CheckoutReceiptData = {
  venueName: "فاست بوس",
  orderId: 12,
  tableName: "بيع سريع",
  waiterName: null,
  cashierName: "كاشير",
  paymentMethod: "cash",
  paidAt: "2026-10-24 10:00:00",
  total: 10,
  lines: [{ name: "شاي", qty: 1, unitPrice: 10, lineTotal: 10 }],
};

const overrides = {
  template: DEFAULT_REPORT_TEMPLATES.receipt,
  settings: { logoAvailable: false },
  logo: null,
};

async function receiptText(data: CheckoutReceiptData) {
  return iconv.decode(
    Buffer.from(await buildReceiptEscPos(data, overrides)),
    "win1256",
  );
}

describe("checkout receipt text", () => {
  it("prints the Libya wall clock, not UTC", async () => {
    const paidAt = formatDateTime(
      nowSqlTripoli(new Date("2026-10-25T12:13:22Z")),
    );
    const text = await receiptText({ ...base, paidAt });

    expect(text).toContain("2:13");
    expect(text).not.toContain("12:13");
  });

  it("prints the customer name and phone when attached", async () => {
    const text = await receiptText({
      ...base,
      customerName: "محمد سالم",
      customerPhone: "0910000000",
    });

    expect(text).toContain("العميل: محمد سالم");
    expect(text).toContain("الهاتف: 0910000000");
  });

  it("omits customer rows when no customer is attached", async () => {
    const text = await receiptText(base);

    expect(text).not.toContain("العميل:");
    expect(text).not.toContain("الهاتف:");
  });

  it("prints the configured payment method label", async () => {
    const text = await receiptText({
      ...base,
      paymentMethod: "custom",
      paymentMethodLabel: "آجل",
    });

    expect(text).toContain("الدفع: آجل");
  });
});
```

Replace `lib/print/escpos.brand.test.ts`:

```ts
import iconv from "iconv-lite";
import { beforeAll, describe, expect, it } from "vitest";
import type { CheckoutReceiptData } from "./receipts";
import { DEFAULT_REPORT_TEMPLATES } from "./templates/defaults";

type BuildFn = typeof import("./templates/build").buildReceiptEscPos;

let buildReceiptEscPos: BuildFn;

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  ({ buildReceiptEscPos } = await import("./templates/build"));
});

const base: CheckoutReceiptData = {
  venueName: "Fast Cafe",
  orderId: 12,
  tableName: "Quick sale",
  waiterName: null,
  cashierName: "Cashier",
  paymentMethod: "cash",
  paidAt: "2026-10-24 10:00:00",
  total: 10,
  lines: [{ name: "Tea", qty: 1, unitPrice: 10, lineTotal: 10 }],
};

function receiptText(
  data: CheckoutReceiptData,
  settings: Record<string, string | boolean> = {},
) {
  return buildReceiptEscPos(data, {
    template: DEFAULT_REPORT_TEMPLATES.receipt,
    settings: { logoAvailable: false, ...settings },
    logo: null,
  }).then((bytes) => iconv.decode(Buffer.from(bytes), "win1256"));
}

describe("receipt brand header", () => {
  it("prints the brand name, venue subtitle, phone and address", async () => {
    const text = await receiptText({
      ...base,
      brandName: "Acme Corner",
      brandPhone: "0911234567",
      brandAddress: "Tripoli Main Street",
    }, {
      brandName: "Acme Corner",
      brandPhone: "0911234567",
      brandAddress: "Tripoli Main Street",
    });

    expect(text).toContain("Acme Corner");
    expect(text).toContain("Fast Cafe");
    expect(text).toContain("إيصال الدفع");
    expect(text).toContain("0911234567");
    expect(text).toContain("Tripoli Main Street");
  });

  it("keeps the venue name as title when the brand name is empty", async () => {
    const text = await receiptText({
      ...base,
      brandName: "  ",
      brandPhone: "0911234567",
    }, {
      brandName: "  ",
      brandPhone: "0911234567",
    });

    expect(text).toContain("Fast Cafe");
    expect(text).toContain("إيصال الدفع");
    expect(text).toContain("0911234567");
  });
});
```

Replace `lib/print/shift-report.test.ts`:

```ts
import iconv from "iconv-lite";
import { beforeAll, describe, expect, it } from "vitest";
import type { ShiftReportPrintData } from "./receipts";
import { DEFAULT_REPORT_TEMPLATES } from "./templates/defaults";

type BuildReport = typeof import("./templates/build").buildShiftReportEscPos;
type BuildItems = typeof import("./templates/build").buildShiftItemsEscPos;

let buildShiftReportEscPos: BuildReport;
let buildShiftItemsEscPos: BuildItems;

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  ({ buildShiftReportEscPos, buildShiftItemsEscPos } = await import(
    "./templates/build"
  ));
});

const base: ShiftReportPrintData = {
  kind: "close",
  shiftNumber: 3,
  venueName: "مطعم",
  workDate: "2026-10-25",
  openedAt: "2026-10-25 09:00:00",
  closedAt: "2026-10-25 18:00:00",
  printedAt: "2026-10-25 18:00:00",
  printedByName: "كاشير رئيسي",
  openedByName: "كاشير رئيسي",
  closedByName: "كاشير رئيسي",
  invoiceCount: 2,
  totalSales: 30,
  cashTotal: 20,
  nonCashTotal: 10,
  paymentBreakdown: [
    { name: "نقدي", total: 20, count: 1 },
    { name: "بطاقة", total: 10, count: 1 },
  ],
  totalItems: 3,
  tableSales: 1,
  quickSales: 1,
  items: [
    { name: "شاي", qty: 2, categoryName: "مشروبات ساخنة" },
    { name: "قهوة", qty: 1, categoryName: "مشروبات ساخنة" },
  ],
  openingFloat: 30,
  expenseTotal: 12.5,
  expenses: [
    { reason: "شراء ثلج", amount: 12.5, createdByName: "كاشير" },
  ],
  expectedCash: 37.5,
  countedCash: 40,
  difference: 2.5,
};

const reportOverrides = {
  template: DEFAULT_REPORT_TEMPLATES.shift,
  logo: null,
};

const itemsOverrides = {
  template: DEFAULT_REPORT_TEMPLATES.items,
  logo: null,
};

async function reportText(data: ShiftReportPrintData) {
  return iconv.decode(
    Buffer.from(await buildShiftReportEscPos(data, reportOverrides)),
    "win1256",
  );
}

describe("shift report expenses", () => {
  it("itemizes expenses and prints the deducted expected cash", async () => {
    const text = await reportText(base);

    expect(text).toContain("المصروفات");
    expect(text).toContain("شراء ثلج");
    expect(text).toContain("12.50");
    expect(text).toContain("إجمالي المصروفات");
    expect(text).toContain("37.50");
    expect(text).toContain("زيادة 2.50");
  });

  it("prints an empty-expenses line when none were recorded", async () => {
    const text = await reportText({
      ...base,
      expenses: [],
      expenseTotal: 0,
      expectedCash: 50,
    });

    expect(text).toContain("لا مصروفات في هذه الوردية");
  });
});

describe("shift report payment methods", () => {
  it("prints every configured payment method total, including custom ones", async () => {
    const text = await reportText({
      ...base,
      paymentBreakdown: [
        { name: "نقدي", total: 20, count: 1 },
        { name: "بريستو", total: 10, count: 1 },
      ],
    });

    expect(text).toContain("نقدي");
    expect(text).toContain("بريستو");
    expect(text).toContain("10.00");
  });

  it("prints a no-payments line when nothing was collected", async () => {
    const text = await reportText({
      ...base,
      paymentBreakdown: [],
      invoiceCount: 0,
      totalSales: 0,
      cashTotal: 0,
      nonCashTotal: 0,
    });

    expect(text).toContain("لا مدفوعات");
  });
});

describe("shift report financial sections", () => {
  it("prints only financial records and keeps sales counts", async () => {
    const text = await reportText(base);

    expect(text).toContain("التحصيل");
    expect(text).toContain("العهدة والمصروفات");
    expect(text).toContain("مطابقة النقد");
    expect(text).toContain("الفواتير: 2");
    expect(text).toContain("قطع مباعة: 3");
    expect(text).toContain("طاولات / سريع: 1 / 1");
    expect(text).not.toContain("المبيعات حسب المجموعة");
    expect(text).not.toContain("مشروبات ساخنة");
  });
});

describe("shift items ticket", () => {
  async function itemsText(
    items: ShiftReportPrintData["items"],
    totalItems: number,
  ) {
    return iconv.decode(
      Buffer.from(
        await buildShiftItemsEscPos(
          { ...base, items, totalItems },
          itemsOverrides,
        ),
      ),
      "win1256",
    );
  }

  it("groups items under bold category headers with subtotals", async () => {
    const text = await itemsText(
      [
        { name: "كولا", qty: 3, categoryName: "مشروبات باردة" },
        { name: "شاي", qty: 2, categoryName: "مشروبات ساخنة" },
        { name: "قهوة", qty: 1, categoryName: "مشروبات ساخنة" },
      ],
      6,
    );

    expect(text).toContain("تقرير أصناف الوردية #3");
    expect(text).toContain("المجموعات: 2");
    expect(text).toContain("الأصناف: 3");
    expect(text).toContain("إجمالي القطع: 6");
    expect(text).toContain("— مشروبات باردة —");
    expect(text).toContain("— مشروبات ساخنة —");
    expect(text.indexOf("— مشروبات باردة —")).toBeLessThan(
      text.indexOf("— مشروبات ساخنة —"),
    );
    expect(text).toMatch(/3\s+كولا/);
    expect(text).toMatch(/2\s+شاي/);
    expect(text).toMatch(/1\s+قهوة/);
    expect(text).toContain("إجمالي المجموعة: 3 قطعة");
    expect(text).toContain("الإجمالي العام: 6 قطعة");
    expect(text).toContain("— نهاية التقرير —");
  });

  it("prints an empty-sales line instead of a blank list", async () => {
    const text = await itemsText([], 0);

    expect(text).toContain("لا أصناف مبيعة في هذه الوردية");
  });
});
```

Replace `lib/print/kitchen-font.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(
  () => [] as Array<{ text: string; fontSize?: number; bold?: boolean }>,
);

vi.mock("./text-raster", () => ({
  textToEscPosRaster: (
    text: string,
    options: { fontSize?: number; bold?: boolean } = {},
  ) => {
    captured.push({ text, fontSize: options.fontSize, bold: options.bold });
    return new Uint8Array([0x1d, 0x76, 0x30, 0x00]);
  },
  columnsToEscPos: (
    cells: Array<{ text: string; fontSize?: number; bold?: boolean }>,
  ) => {
    for (const cell of cells) {
      captured.push({
        text: cell.text,
        fontSize: cell.fontSize,
        bold: cell.bold,
      });
    }
    return new Uint8Array([0x1d, 0x76, 0x30, 0x00]);
  },
  columnsToText: () => "",
}));

import { DEFAULT_REPORT_TEMPLATES } from "./templates/defaults";
import { buildKitchenEscPos } from "./templates/build";

beforeEach(() => {
  captured.length = 0;
});

describe("kitchen ticket font size", () => {
  it("renders item names large, notes small, and metadata normal", async () => {
    await buildKitchenEscPos(
      {
        venueName: "مطعم",
        orderId: 12,
        tableName: "T1",
        waiterName: "سارة",
        createdAt: "12:30",
        kind: "order",
        lines: [{ name: "بيتزا تن كبيرة", qty: 2, note: "بدون بصل" }],
      },
      { template: DEFAULT_REPORT_TEMPLATES.kitchen, logo: null },
    );

    const item = captured.find((line) => line.text.includes("بيتزا تن كبيرة"));
    const note = captured.find((line) => line.text.includes("بدون بصل"));
    const meta = captured.find((line) => line.text.includes("12:30"));

    expect(item).toMatchObject({ fontSize: 30, bold: true });
    expect(note).toMatchObject({ fontSize: 22 });
    expect(meta).toMatchObject({ fontSize: 26 });
  });
});
```

Replace `lib/print/escpos-cut.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "./templates/defaults";

type BuildFn = typeof import("./templates/build").buildKitchenEscPos;
let buildKitchenEscPos: BuildFn;

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  ({ buildKitchenEscPos } = await import("./templates/build"));
});

function cutTail(bytes: Uint8Array) {
  const cut = [0x1d, 0x56, 0x00];
  const index = bytes.findLastIndex(
    (byte, position) =>
      byte === cut[0] &&
      bytes[position + 1] === cut[1] &&
      bytes[position + 2] === cut[2],
  );
  if (index < 0) return null;

  let feed = 0;
  for (let position = index - 1; position >= 0; position -= 1) {
    if (bytes[position] !== 0x0a) break;
    feed += 1;
  }
  return { index, feed };
}

describe("kitchen ticket cut clearance", () => {
  it("feeds enough blank lines to clear the last note before cutting", async () => {
    const bytes = await buildKitchenEscPos(
      {
        venueName: "مطعم",
        orderId: 7,
        tableName: "T1",
        waiterName: "Ali",
        createdAt: "12:30",
        kind: "order",
        lines: [{ name: "Pizza", qty: 1, note: "no onion no pepper" }],
      },
      { template: DEFAULT_REPORT_TEMPLATES.kitchen, logo: null },
    );

    const tail = cutTail(bytes);
    expect(tail).not.toBeNull();
    expect(tail!.feed).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 9: Update the order-action mocks**

In `lib/orders/kitchen-skip.test.ts`, replace the `@/lib/print/escpos` mock with:

```ts
vi.mock("@/lib/print/templates/build", () => ({
  buildKitchenEscPos: async (options: {
    lines: Array<{ name: string; qty: number }>;
  }) => {
    holder.tickets.push({ lines: options.lines });
    return new Uint8Array();
  },
}));
vi.mock("@/lib/print/escpos", () => ({
  chunkKitchenLines: (lines: unknown[]) => [lines],
}));
```

In `lib/orders/pay-hold.test.ts`, replace the `@/lib/print/escpos` mock with:

```ts
vi.mock("@/lib/print/templates/build", () => ({
  buildKitchenEscPos: async () => new Uint8Array(),
}));
vi.mock("@/lib/print/escpos", () => ({
  chunkKitchenLines: (lines: unknown[]) => [lines],
}));
```

- [ ] **Step 10: Reduce `lib/print/escpos.ts` to the diagnostic and chunk helper**

Replace the file with:

```ts
import { printerProfile } from "./encoding";
import { appendLogo } from "./logo";
import {
  align,
  concat,
  cut,
  init,
  printLine,
  separator,
} from "./primitives";

function fieldLine(parts: Uint8Array[], label: string, value: string) {
  printLine(parts, `${label}: ${value}`);
}

function headerBlock(
  parts: Uint8Array[],
  title: string,
  subtitle?: string,
  contacts: string[] = [],
) {
  printLine(parts, title, { bold: true, align: "center", fontSize: 34 });
  if (subtitle) {
    printLine(parts, subtitle, { align: "center", fontSize: 28 });
  }
  for (const contact of contacts) {
    printLine(parts, contact, { align: "center", fontSize: 26 });
  }
  parts.push(align("right"));
}

/** Max items per kitchen ticket — avoids printer buffer overflow. */
export const KITCHEN_ITEMS_PER_TICKET = 18;

export function chunkKitchenLines<T>(
  lines: T[],
  size = KITCHEN_ITEMS_PER_TICKET,
): T[][] {
  if (lines.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < lines.length; i += size) {
    chunks.push(lines.slice(i, i + size));
  }
  return chunks;
}

export function buildTestEscPos(
  printerName: string,
  logo: Uint8Array | null = null,
): Uint8Array {
  const now = new Date()
    .toLocaleString("ar-LY", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(/[\u200e\u200f\u061c]/g, "");

  const parts: Uint8Array[] = [init()];
  appendLogo(parts, logo);
  headerBlock(parts, "اختبار طباعة", "Fast POS");
  parts.push(separator());
  fieldLine(parts, "الطابعة", printerName);
  fieldLine(parts, "الحالة", "تعمل بنجاح");
  fieldLine(parts, "الوقت", now);
  fieldLine(parts, "النوع", printerProfile.label);
  fieldLine(parts, "Code page", String(printerProfile.codePage));
  parts.push(separator());
  printLine(parts, "كابتشينو", { bold: true });
  printLine(parts, "قهوة عربية", { bold: true });
  printLine(parts, "2 x 12.00 د.ل  =  24.00 د.ل");
  parts.push(separator(), align("center"));
  printLine(parts, "تم الاتصال بالطابعة", { align: "center" });
  parts.push(cut());

  return concat(...parts);
}
```

This removes `buildCheckoutEscPos`, `buildKitchenEscPos`, `buildReportSummaryEscPos`, `buildShiftReportEscPos`, `buildShiftItemsEscPos`, `printWrappedName`, `kitchenLine`, `kitchenSep`, `printSalesRow`, `itemQuantityRow`, `reportSep`, `wrapText`, and every now-unused import. No other module may import those names.

- [ ] **Step 11: Run the print and order tests**

Run:

```bash
npx vitest run lib/print/order-number.test.ts lib/print/receipts.test.ts lib/print/escpos.brand.test.ts lib/print/shift-report.test.ts lib/print/kitchen-font.test.ts lib/print/escpos-cut.test.ts lib/print/templates/build.test.ts lib/print/templates/store.test.ts lib/orders/kitchen-skip.test.ts lib/orders/pay-hold.test.ts
```

Expected: PASS. If `pay-hold` or `kitchen-skip` still import `buildKitchenEscPos` from `escpos`, Step 9 was missed.

- [ ] **Step 12: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 8: Report-design server actions

**Files:**
- Create: `app/actions/report-templates.ts`
- Test: `app/actions/report-templates.test.ts`

**Interfaces:**
- Consumes: `persistReportTemplate`, `deleteReportTemplate` (Task 7); `parseReportTemplateJson` (Task 1); `buildSampleEscPos` (Task 7); `isReportDocument`, `ReportDocument` (Task 1); `DEFAULT_REPORT_TEMPLATES` (Task 2).
- Produces:
  - `saveReportTemplate(document: string, json: string): Promise<{ ok: true } | { error: string }>` — admin only; validates through the store.
  - `resetReportTemplate(document: string): Promise<{ ok: true } | { error: string }>` — admin only; deletes the stored override.
  - `testPrintReportTemplate(document: string, json: string, printerId: number): Promise<{ ok: true; message: string } | { error: string }>` — admin only; scans and prints the unsaved template.
- Non-admin calls throw `غير مصرح` (same contract as every other admin action). Unknown documents return `{ error: "نوع التقرير غير معروف" }`. Printer lookup failures return `{ error: "الطابعة غير موجودة أو معطّلة" }`.

- [ ] **Step 1: Write the failing action test**

Create `app/actions/report-templates.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  sqlite: null as import("better-sqlite3").Database | null,
  raw: vi.fn(),
  network: vi.fn(),
  role: "admin" as "admin" | "cashier",
  settings: new Map<string, string>(),
  samples: [] as { document: string; template: unknown }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({
    userId: 1,
    name: "مدير",
    role: holder.role,
    venueId: null,
    mustChangePin: false,
  }),
}));
vi.mock("@/lib/settings", () => ({
  getSettingValue: (key: string) => holder.settings.get(key) ?? null,
  setSettingValue: (key: string, value: string) => {
    holder.settings.set(key, value);
  },
  deleteSettingValue: (key: string) => {
    holder.settings.delete(key);
  },
}));
vi.mock("@/lib/print/windows-raw", () => ({
  printRawToWindowsPrinter: (...args: unknown[]) => holder.raw(...args),
}));
vi.mock("@/lib/print/network", () => ({
  printToPrinter: (...args: unknown[]) => holder.network(...args),
}));
vi.mock("@/lib/print/templates/build", () => ({
  buildSampleEscPos: async (document: string, template: unknown) => {
    holder.samples.push({ document, template });
    return new Uint8Array([9, 9, 9]);
  },
}));
vi.mock("@/lib/db", async () => {
  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const schema = await import("@/lib/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      host TEXT NOT NULL DEFAULT '',
      port INTEGER NOT NULL DEFAULT 9100,
      connection_type TEXT NOT NULL DEFAULT 'network',
      auto_print INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER,
      user_name TEXT NOT NULL,
      role TEXT NOT NULL,
      venue_id TEXT,
      kind TEXT NOT NULL,
      order_id INTEGER,
      printer_name TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      detail TEXT NOT NULL
    );
  `);
  holder.sqlite = sqlite;
  return { db: drizzle(sqlite, { schema }), getSqlite: () => sqlite };
});

import {
  resetReportTemplate,
  saveReportTemplate,
  testPrintReportTemplate,
} from "@/app/actions/report-templates";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";

function validJson() {
  return JSON.stringify(DEFAULT_REPORT_TEMPLATES.receipt);
}

function seedPrinter(input: {
  name: string;
  connectionType: "local" | "network";
  host: string;
  port?: number;
  active?: boolean;
}) {
  const info = holder.sqlite!
    .prepare(
      `INSERT INTO printers
         (venue_id, name, role, host, port, connection_type, auto_print, active)
       VALUES (NULL, ?, 'checkout', ?, ?, ?, 0, ?)`,
    )
    .run(
      input.name,
      input.host,
      input.port ?? 9100,
      input.connectionType,
      input.active === false ? 0 : 1,
    );
  return Number(info.lastInsertRowid);
}

function latestAudit() {
  return holder.sqlite!
    .prepare(
      "SELECT kind, printer_name, success, detail FROM audit_events ORDER BY id DESC LIMIT 1",
    )
    .get() as Record<string, unknown> | undefined;
}

beforeEach(() => {
  holder.role = "admin";
  holder.settings.clear();
  holder.sqlite!.exec("DELETE FROM audit_events; DELETE FROM printers;");
  holder.raw.mockReset();
  holder.network.mockReset();
  holder.raw.mockResolvedValue(undefined);
  holder.network.mockResolvedValue(undefined);
  holder.samples.length = 0;
});

describe("report template actions", () => {
  it("rejects non-admin users", async () => {
    holder.role = "cashier";
    await expect(saveReportTemplate("receipt", validJson())).rejects.toThrow(
      "غير مصرح",
    );
    await expect(resetReportTemplate("receipt")).rejects.toThrow("غير مصرح");
    await expect(
      testPrintReportTemplate("receipt", validJson(), 1),
    ).rejects.toThrow("غير مصرح");
  });

  it("rejects an unknown document", async () => {
    expect(await saveReportTemplate("invoice", validJson())).toEqual({
      error: "نوع التقرير غير معروف",
    });
  });

  it("does not store invalid JSON", async () => {
    expect(await saveReportTemplate("receipt", "{")).toEqual({
      error: "ملف التصميم ليس JSON صالحاً",
    });
    expect(holder.settings.size).toBe(0);
  });

  it("saves a valid template and resets it", async () => {
    const template = JSON.parse(validJson()) as {
      labels: { orderNo: string };
    };
    template.labels.orderNo = "طلب";

    expect(
      await saveReportTemplate("receipt", JSON.stringify(template)),
    ).toEqual({ ok: true });
    expect(holder.settings.has("report_template.receipt")).toBe(true);

    expect(latestAudit()).toMatchObject({
      kind: "settings",
      detail: "حفظ تصميم إيصال الدفع",
    });

    expect(await resetReportTemplate("receipt")).toEqual({ ok: true });
    expect(holder.settings.has("report_template.receipt")).toBe(false);
    expect(latestAudit()).toMatchObject({
      kind: "settings",
      detail: "استعادة التصميم الافتراضي لإيصال الدفع",
    });
  });

  it("test prints to a local Windows printer using the unsaved template", async () => {
    const printerId = seedPrinter({
      name: "كاشير",
      connectionType: "local",
      host: "XP-80C",
    });
    const template = JSON.parse(validJson()) as {
      labels: { orderNo: string };
    };
    template.labels.orderNo = "طلب";
    holder.settings.set(
      "report_template.receipt",
      JSON.stringify({
        ...template,
        labels: { ...template.labels, orderNo: "محفوظ" },
      }),
    );

    expect(
      await testPrintReportTemplate("receipt", JSON.stringify(template), printerId),
    ).toEqual({
      ok: true,
      message: "تم إرسال معاينة التصميم إلى كاشير",
    });
    expect(holder.raw).toHaveBeenCalledWith(
      "XP-80C",
      new Uint8Array([9, 9, 9]),
    );
    expect(holder.network).not.toHaveBeenCalled();
    expect(holder.samples).toHaveLength(1);
    expect(holder.samples[0]!.document).toBe("receipt");
    expect(
      (holder.samples[0]!.template as { labels: { orderNo: string } }).labels
        .orderNo,
    ).toBe("طلب");
    expect(latestAudit()).toMatchObject({
      kind: "test",
      printer_name: "كاشير",
      success: 1,
      detail: "معاينة إيصال الدفع على كاشير",
    });
  });

  it("test prints to a network printer", async () => {
    const printerId = seedPrinter({
      name: "شبكة",
      connectionType: "network",
      host: "10.0.0.9",
      port: 9200,
    });

    expect(
      await testPrintReportTemplate("receipt", validJson(), printerId),
    ).toMatchObject({ ok: true });
    expect(holder.network).toHaveBeenCalledWith({
      host: "10.0.0.9",
      port: 9200,
      data: new Uint8Array([9, 9, 9]),
    });
    expect(holder.raw).not.toHaveBeenCalled();
  });

  it("refuses invalid templates and inactive or missing printers", async () => {
    const inactive = seedPrinter({
      name: "معطلة",
      connectionType: "local",
      host: "XP-80C",
      active: false,
    });

    expect(
      await testPrintReportTemplate("receipt", "{", inactive),
    ).toEqual({ error: "ملف التصميم ليس JSON صالحاً" });
    expect(
      await testPrintReportTemplate("receipt", validJson(), inactive),
    ).toEqual({ error: "الطابعة غير موجودة أو معطّلة" });
    expect(
      await testPrintReportTemplate("receipt", validJson(), 999),
    ).toEqual({ error: "الطابعة غير موجودة أو معطّلة" });
    expect(holder.raw).not.toHaveBeenCalled();
    expect(holder.network).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/actions/report-templates.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/actions/report-templates"`.

- [ ] **Step 3: Create `app/actions/report-templates.ts`**

```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recordSessionAudit } from "@/lib/audit";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
import { printToPrinter } from "@/lib/print/network";
import { buildSampleEscPos } from "@/lib/print/templates/build";
import { parseReportTemplateJson } from "@/lib/print/templates/schema";
import {
  deleteReportTemplate,
  persistReportTemplate,
} from "@/lib/print/templates/store";
import {
  isReportDocument,
  type ReportDocument,
} from "@/lib/print/templates/types";
import { printRawToWindowsPrinter } from "@/lib/print/windows-raw";

type ActionResult = { ok: true } | { error: string };
type PrintResult = { ok: true; message: string } | { error: string };

const DOCUMENT_LABELS: Record<ReportDocument, string> = {
  receipt: "إيصال الدفع",
  kitchen: "تذكرة المطبخ",
  shift: "تقرير الوردية",
  items: "تذكرة الأصناف",
  sales: "تقرير المبيعات",
};

async function assertAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("غير مصرح");
  }
  return session;
}

function toDocument(value: string): ReportDocument | null {
  return isReportDocument(value) ? value : null;
}

export async function saveReportTemplate(
  document: string,
  json: string,
): Promise<ActionResult> {
  const session = await assertAdmin();
  const doc = toDocument(document);
  if (!doc) return { error: "نوع التقرير غير معروف" };

  const result = persistReportTemplate(doc, json);
  if (!result.ok) return { error: result.errors.join("\n") };

  recordSessionAudit(session, {
    kind: "settings",
    success: true,
    detail: `حفظ تصميم ${DOCUMENT_LABELS[doc]}`,
  });
  revalidatePath("/admin/reports/design");
  return { ok: true };
}

export async function resetReportTemplate(
  document: string,
): Promise<ActionResult> {
  const session = await assertAdmin();
  const doc = toDocument(document);
  if (!doc) return { error: "نوع التقرير غير معروف" };

  deleteReportTemplate(doc);
  recordSessionAudit(session, {
    kind: "settings",
    success: true,
    detail: `استعادة التصميم الافتراضي لـ${DOCUMENT_LABELS[doc]}`,
  });
  revalidatePath("/admin/reports/design");
  return { ok: true };
}

export async function testPrintReportTemplate(
  document: string,
  json: string,
  printerId: number,
): Promise<PrintResult> {
  const session = await assertAdmin();
  const doc = toDocument(document);
  if (!doc) return { error: "نوع التقرير غير معروف" };

  const parsed = parseReportTemplateJson(json, doc);
  if (!parsed.ok) return { error: parsed.errors.join("\n") };

  const printer = db
    .select()
    .from(printers)
    .where(eq(printers.id, printerId))
    .get();
  if (!printer || !printer.active) {
    return { error: "الطابعة غير موجودة أو معطّلة" };
  }

  try {
    const data = await buildSampleEscPos(doc, parsed.template);
    if (printer.connectionType === "local") {
      await printRawToWindowsPrinter(printer.host, data);
    } else {
      await printToPrinter({
        host: printer.host,
        port: printer.port,
        data,
      });
    }
    recordSessionAudit(session, {
      venueId: printer.venueId,
      kind: "test",
      printerName: printer.name,
      success: true,
      detail: `معاينة ${DOCUMENT_LABELS[doc]} على ${printer.name}`,
    });
    return {
      ok: true,
      message: `تم إرسال معاينة التصميم إلى ${printer.name}`,
    };
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : `تعذر الاتصال بالطابعة ${printer.name}`;
    recordSessionAudit(session, {
      venueId: printer.venueId,
      kind: "test",
      printerName: printer.name,
      success: false,
      detail,
    });
    return { error: detail };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/actions/report-templates.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 9: Report-design admin page and structured editor

**Files:**
- Create: `app/admin/(panel)/reports/design/page.tsx`
- Create: `components/admin/report-design/ReportDesignAdmin.tsx`
- Create: `components/admin/report-design/TemplateTree.tsx`
- Create: `components/admin/report-design/TemplateProperties.tsx`
- Create: `components/admin/report-design/ReportPreview.tsx`
- Modify: `components/AdminNav.tsx`
- Test: `components/admin/report-design/ReportDesignAdmin.test.tsx`

**Interfaces:**
- Consumes: `getReportTemplateJson`, `loadReportTemplate` (Task 7); `DEFAULT_REPORT_TEMPLATES` (Task 2); `buildSampleDocuments` (Task 5); `saveReportTemplate`, `resetReportTemplate`, `testPrintReportTemplate` (Task 8); `getBrandDetails`, `getReceiptFooterMessage` (`@/lib/settings`); `db`, `printers` (`@/lib/db`).
- Produces: a client `ReportDesignAdmin` component with props:
  ```ts
  type ReportDesignAdminProps = {
    document: ReportDocument;
    documents: ReportDocument[];
    template: ReportTemplate;
    templateJson: string;
    isDefault: boolean;
    sample: DocumentData;
    printers: Array<{ id: number; name: string; connectionType: "local" | "network" }>;
  };
  ```
  The page owns document selection through the `?doc=` search param; the client component switches documents by `router.push("/admin/reports/design?doc=<doc>")`.

- [ ] **Step 1: Write the failing component test**

Create `components/admin/report-design/ReportDesignAdmin.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";
import {
  buildSampleDocuments,
  sampleSettings,
} from "@/lib/print/templates/sample";
import { ReportDesignAdmin } from "./ReportDesignAdmin";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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
const sample = buildSampleDocuments(sampleSettings)[document];

function renderAdmin() {
  render(
    <ReportDesignAdmin
      document={document}
      documents={["receipt", "kitchen", "shift", "items", "sales"]}
      template={DEFAULT_REPORT_TEMPLATES[document]}
      templateJson={JSON.stringify(DEFAULT_REPORT_TEMPLATES[document], null, 2)}
      isDefault
      sample={sample}
      printers={[
        { id: 4, name: "كاشير", connectionType: "local" },
        { id: 5, name: "شبكة", connectionType: "network" },
      ]}
    />,
  );
}

describe("ReportDesignAdmin", () => {
  it("renders the tree, properties, and preview for the receipt", () => {
    renderAdmin();
    expect(screen.getByText("شجرة التصميم")).toBeTruthy();
    expect(screen.getByText(/الخصائص/)).toBeTruthy();
    expect(screen.getByText("معاينة")).toBeTruthy();
    expect(screen.getByText("الصنف")).toBeTruthy();
    expect(screen.getByText("الكمية")).toBeTruthy();
  });

  it("edits a header line label and saves the template", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "الترويسة" }));
    const input = screen.getByLabelText("نص السطر 1");
    fireEvent.change(input, { target: { value: "مرحباً" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ التصميم" }));

    expect(actions.saveReportTemplate).toHaveBeenCalledTimes(1);
    const [doc, json] = actions.saveReportTemplate.mock.calls[0]!;
    expect(doc).toBe("receipt");
    expect(JSON.parse(json as string).header.lines[0].text).toBe("مرحباً");
  });

  it("blocks saving when the raw JSON is invalid", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("tab", { name: "JSON" }));
    fireEvent.change(screen.getByLabelText("محرر JSON"), {
      target: { value: "{" },
    });
    fireEvent.click(screen.getByRole("button", { name: "تطبيق JSON" }));

    expect(screen.getByText("ملف التصميم ليس JSON صالحاً")).toBeTruthy();
    expect(actions.saveReportTemplate).not.toHaveBeenCalled();
  });

  it("imports a .fprep file into the editor", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("tab", { name: "JSON" }));
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
    expect(actions.saveReportTemplate).not.toHaveBeenCalled();
  });

  it("confirms before resetting the design", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "استعادة الافتراضي" }));
    expect(screen.getByText("استعادة التصميم الافتراضي؟")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الاستعادة" }));
    expect(actions.resetReportTemplate).toHaveBeenCalledWith("receipt");
  });

  it("sends the selected printer to the test print action", async () => {
    renderAdmin();
    fireEvent.change(screen.getByLabelText("طابعة الاختبار"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "طباعة تجريبية" }));

    expect(actions.testPrintReportTemplate).toHaveBeenCalledWith(
      "receipt",
      expect.any(String),
      5,
    );
    await screen.findByText("تم الإرسال");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/admin/report-design/ReportDesignAdmin.test.tsx`
Expected: FAIL — `Failed to resolve import "./ReportDesignAdmin"`.

- [ ] **Step 3: Build the page shell**

Create `app/admin/(panel)/reports/design/page.tsx`:

```tsx
import { asc, eq } from "drizzle-orm";
import { FileText } from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import { ReportDesignAdmin } from "@/components/admin/report-design/ReportDesignAdmin";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
import { buildSampleDocuments } from "@/lib/print/templates/sample";
import { getReportTemplateJson, loadReportTemplate } from "@/lib/print/templates/store";
import {
  DEFAULT_REPORT_TEMPLATES,
} from "@/lib/print/templates/defaults";
import {
  isReportDocument,
  REPORT_DOCUMENTS,
  type ReportDocument,
} from "@/lib/print/templates/types";
import { getBrandDetails, getReceiptFooterMessage } from "@/lib/settings";

export default async function ReportDesignPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const document: ReportDocument = isReportDocument(params.doc)
    ? params.doc
    : "receipt";

  const brand = getBrandDetails();
  const settings = {
    venueName: "فاست بوس",
    brandName: brand.name,
    brandPhone: brand.phone,
    brandAddress: brand.address,
    footer: getReceiptFooterMessage(),
    logoAvailable: true,
  };
  const sample = buildSampleDocuments(settings)[document];
  const template = loadReportTemplate(document);
  const isDefault =
    JSON.stringify(template) ===
    JSON.stringify(DEFAULT_REPORT_TEMPLATES[document]);

  const rows = db
    .select()
    .from(printers)
    .where(eq(printers.active, true))
    .orderBy(asc(printers.name), asc(printers.id))
    .all();

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <FileText className="size-6" />
        </span>
        <div>
          <h2 className="text-2xl font-black sm:text-3xl">تصميم التقارير</h2>
          <p className="text-sm text-base-content/45">
            خصّص الإيصالات والتقارير المطبوعة دون تغيير الكود
          </p>
        </div>
      </div>

      <ReportDesignAdmin
        document={document}
        documents={[...REPORT_DOCUMENTS]}
        template={template}
        templateJson={getReportTemplateJson(document)}
        isDefault={isDefault}
        sample={sample}
        printers={rows.map((row) => ({
          id: row.id,
          name: row.name,
          connectionType: row.connectionType,
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 4: Create `components/admin/report-design/ReportDesignAdmin.tsx`**

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  resetReportTemplate,
  saveReportTemplate,
  testPrintReportTemplate,
} from "@/app/actions/report-templates";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";
import { parseReportTemplateJson } from "@/lib/print/templates/schema";
import {
  REPORT_DOCUMENTS,
  type DocumentData,
  type ReportDocument,
  type ReportTemplate,
} from "@/lib/print/templates/types";
import { ReportPreview } from "./ReportPreview";
import { TemplateProperties } from "./TemplateProperties";
import { TemplateTree } from "./TemplateTree";

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

const DOCUMENT_LABELS: Record<ReportDocument, string> = {
  receipt: "إيصال الدفع",
  kitchen: "تذكرة المطبخ",
  shift: "تقرير الوردية",
  items: "تذكرة الأصناف",
  sales: "تقرير المبيعات",
};

const DOCUMENT_TABS = REPORT_DOCUMENTS;

export function ReportDesignAdmin(props: ReportDesignAdminProps) {
  const router = useRouter();
  const [template, setTemplate] = useState(() =>
    structuredClone(props.template),
  );
  const [tab, setTab] = useState<"design" | "json">("design");
  const [selected, setSelected] = useState("header");
  const [jsonText, setJsonText] = useState(props.templateJson);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [printerId, setPrinterId] = useState(props.printers[0]?.id ?? 0);
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty = useMemo(
    () => JSON.stringify(template) !== JSON.stringify(props.template),
    [template, props.template],
  );

  function update(next: ReportTemplate) {
    setTemplate(next);
    setError(null);
  }

  function applyJson() {
    const result = parseReportTemplateJson(jsonText, props.document);
    if (!result.ok) {
      setError(result.errors.join("\n"));
      return;
    }
    setTemplate(result.template);
    setError(null);
    setMessage("تم تطبيق التصميم من JSON");
  }

  function changeDocument(next: ReportDocument) {
    if (dirty && !window.confirm("توجد تغييرات غير محفوظة. هل تريد تجاهلها؟")) {
      return;
    }
    router.push(`/admin/reports/design?doc=${next}`);
  }

  async function save() {
    const result = await saveReportTemplate(
      props.document,
      JSON.stringify(template),
    );
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setMessage("تم حفظ التصميم");
    router.refresh();
  }

  async function reset() {
    const result = await resetReportTemplate(props.document);
    setConfirmReset(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const fallback = structuredClone(
      DEFAULT_REPORT_TEMPLATES[props.document],
    );
    setTemplate(fallback);
    setJsonText(JSON.stringify(fallback, null, 2));
    setError(null);
    setMessage("تمت استعادة التصميم الافتراضي");
    router.refresh();
  }

  async function testPrint() {
    if (!printerId) {
      setError("اختر طابعة أولاً");
      return;
    }
    const result = await testPrintReportTemplate(
      props.document,
      JSON.stringify(template),
      printerId,
    );
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setMessage(result.message);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const result = parseReportTemplateJson(text, props.document);
    if (!result.ok) {
      setError(result.errors.join("\n"));
      return;
    }
    setTemplate(result.template);
    setJsonText(JSON.stringify(result.template, null, 2));
    setTab("json");
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
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div role="tablist" className="tabs tabs-boxed w-fit">
        {DOCUMENT_TABS.filter((doc) => props.documents.includes(doc)).map(
          (doc) => (
            <button
              key={doc}
              type="button"
              role="tab"
              className={`tab ${doc === props.document ? "tab-active" : ""}`}
              onClick={() => changeDocument(doc)}
            >
              {DOCUMENT_LABELS[doc]}
            </button>
          ),
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={save}>
          حفظ التصميم
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setConfirmReset(true)}
        >
          استعادة الافتراضي
        </button>
        <button
          type="button"
          className="btn btn-sm"
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
          onChange={(event) => importFile(event.target.files?.[0])}
        />
        <button type="button" className="btn btn-sm" onClick={exportFile}>
          تصدير .fprep
        </button>
        <div className="join">
          <select
            className="select select-bordered join-item select-sm"
            aria-label="طابعة الاختبار"
            value={printerId}
            onChange={(event) => setPrinterId(Number(event.target.value))}
          >
            {props.printers.length === 0 && <option value={0}>لا طابعات</option>}
            {props.printers.map((printer) => (
              <option key={printer.id} value={printer.id}>
                {printer.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary join-item btn-sm"
            onClick={testPrint}
          >
            طباعة تجريبية
          </button>
        </div>
        {dirty && (
          <span className="badge badge-warning badge-sm">تغييرات غير محفوظة</span>
        )}
        {props.isDefault && (
          <span className="badge badge-ghost badge-sm">التصميم الافتراضي</span>
        )}
      </div>

      {error && (
        <div className="alert alert-error whitespace-pre-line text-sm">{error}</div>
      )}
      {message && <div className="alert alert-success text-sm">{message}</div>}

      <div className="grid gap-5 xl:grid-cols-[260px_1fr_340px]">
        <TemplateTree
          template={template}
          selected={selected}
          onSelect={setSelected}
        />

        <div className="space-y-4">
          <div role="tablist" className="tabs tabs-boxed w-fit">
            <button
              type="button"
              role="tab"
              className={`tab ${tab === "design" ? "tab-active" : ""}`}
              onClick={() => setTab("design")}
            >
              خصائص
            </button>
            <button
              type="button"
              role="tab"
              className={`tab ${tab === "json" ? "tab-active" : ""}`}
              onClick={() => {
                setJsonText(JSON.stringify(template, null, 2));
                setTab("json");
              }}
            >
              JSON
            </button>
          </div>

          {tab === "design" ? (
            <TemplateProperties
              template={template}
              selected={selected}
              onChange={update}
            />
          ) : (
            <div className="space-y-2">
              <textarea
                aria-label="محرر JSON"
                className="textarea textarea-bordered min-h-96 w-full font-mono text-xs"
                dir="ltr"
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={applyJson}
              >
                تطبيق JSON
              </button>
            </div>
          )}
        </div>

        <ReportPreview template={template} sample={props.sample} />
      </div>

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
                className="btn btn-sm"
                onClick={() => setConfirmReset(false)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-error btn-sm"
                onClick={reset}
              >
                تأكيد الاستعادة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `components/admin/report-design/TemplateTree.tsx`**

```tsx
"use client";

import type { ReportTemplate } from "@/lib/print/templates/types";

type TemplateTreeProps = {
  template: ReportTemplate;
  selected: string;
  onSelect: (id: string) => void;
};

export function TemplateTree({ template, selected, onSelect }: TemplateTreeProps) {
  const nodes = [
    { id: "header", label: "الترويسة" },
    { id: "fields", label: "البيانات" },
    { id: "items", label: "الأصناف" },
    ...template.sections.map((section) => ({
      id: `section.${section.id}`,
      label: section.title,
    })),
    { id: "summary", label: "الإجمالي" },
    { id: "footer", label: "التذييل" },
  ];

  return (
    <aside className="rounded-2xl border border-base-300 bg-base-100 p-3">
      <h3 className="mb-3 text-sm font-black">شجرة التصميم</h3>
      <ul className="space-y-1">
        {nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              onClick={() => onSelect(node.id)}
              className={`w-full rounded-lg px-3 py-2 text-right text-sm font-bold ${
                selected === node.id
                  ? "bg-primary text-primary-content"
                  : "text-base-content/60 hover:bg-base-200"
              }`}
            >
              {node.label}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 6: Create `components/admin/report-design/TemplateProperties.tsx`**

```tsx
"use client";

import type {
  ReportTemplate,
  TemplateColumn,
  TemplateLine,
} from "@/lib/print/templates/types";

type TemplatePropertiesProps = {
  template: ReportTemplate;
  selected: string;
  onChange: (template: ReportTemplate) => void;
};

function clone(template: ReportTemplate): ReportTemplate {
  return JSON.parse(JSON.stringify(template)) as ReportTemplate;
}

export function TemplateProperties({
  template,
  selected,
  onChange,
}: TemplatePropertiesProps) {
  function updateLine(
    lines: TemplateLine[],
    index: number,
    patch: Partial<TemplateLine>,
  ) {
    const next = clone(template);
    const target = lines === template.header.lines
      ? next.header.lines
      : next.footer.lines;
    target[index] = { ...target[index]!, ...patch };
    onChange(next);
  }

  function updateColumn(index: number, patch: Partial<TemplateColumn>) {
    const next = clone(template);
    next.items.columns[index] = {
      ...next.items.columns[index]!,
      ...patch,
    };
    onChange(next);
  }

  if (selected === "header") {
    return (
      <section className="space-y-3 rounded-2xl border border-base-300 bg-base-100 p-4">
        <h3 className="text-sm font-black">الخصائص — الترويسة</h3>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={template.header.logo.show}
            onChange={(event) => {
              const next = clone(template);
              next.header.logo.show = event.target.checked;
              onChange(next);
            }}
          />
          إظهار الشعار
        </label>
        {template.header.lines.map((line, index) => (
          <label key={index} className="block space-y-1 text-sm font-bold">
            <span>نص السطر {index + 1}</span>
            <input
              className="input input-bordered input-sm w-full"
              value={line.text}
              onChange={(event) =>
                updateLine(template.header.lines, index, {
                  text: event.target.value,
                })
              }
            />
          </label>
        ))}
      </section>
    );
  }

  if (selected === "fields") {
    return (
      <section className="space-y-3 rounded-2xl border border-base-300 bg-base-100 p-4">
        <h3 className="text-sm font-black">الخصائص — البيانات</h3>
        {Object.entries(template.labels).map(([key, label]) => (
          <label key={key} className="block space-y-1 text-sm font-bold">
            <span>{key}</span>
            <input
              className="input input-bordered input-sm w-full"
              value={label}
              onChange={(event) => {
                const next = clone(template);
                next.labels[key] = event.target.value;
                onChange(next);
              }}
            />
          </label>
        ))}
      </section>
    );
  }

  if (selected === "items") {
    return (
      <section className="space-y-3 rounded-2xl border border-base-300 bg-base-100 p-4">
        <h3 className="text-sm font-black">الخصائص — الأصناف</h3>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={template.items.header}
            onChange={(event) => {
              const next = clone(template);
              next.items.header = event.target.checked;
              onChange(next);
            }}
          />
          إظهار صف العناوين
        </label>
        {template.items.columns.map((column, index) => (
          <div key={column.key} className="grid grid-cols-[1fr_5rem] gap-2">
            <input
              aria-label={`عنوان العمود ${index + 1}`}
              className="input input-bordered input-sm w-full"
              value={column.label}
              onChange={(event) =>
                updateColumn(index, { label: event.target.value })
              }
            />
            <input
              aria-label={`عرض العمود ${index + 1}`}
              type="number"
              min={1}
              max={30}
              className="input input-bordered input-sm w-full"
              value={column.width}
              onChange={(event) =>
                updateColumn(index, { width: Number(event.target.value) || 1 })
              }
            />
          </div>
        ))}
      </section>
    );
  }

  if (selected === "summary") {
    return (
      <section className="space-y-3 rounded-2xl border border-base-300 bg-base-100 p-4">
        <h3 className="text-sm font-black">الخصائص — الإجمالي</h3>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={template.summary.show}
            onChange={(event) => {
              const next = clone(template);
              next.summary.show = event.target.checked;
              onChange(next);
            }}
          />
          إظهار الإجمالي
        </label>
        <label className="block space-y-1 text-sm font-bold">
          <span>العنوان</span>
          <input
            className="input input-bordered input-sm w-full"
            value={template.summary.label}
            onChange={(event) => {
              const next = clone(template);
              next.summary.label = event.target.value;
              onChange(next);
            }}
          />
        </label>
      </section>
    );
  }

  if (selected === "footer") {
    return (
      <section className="space-y-3 rounded-2xl border border-base-300 bg-base-100 p-4">
        <h3 className="text-sm font-black">الخصائص — التذييل</h3>
        {template.footer.lines.map((line, index) => (
          <label key={index} className="block space-y-1 text-sm font-bold">
            <span>نص السطر {index + 1}</span>
            <input
              className="input input-bordered input-sm w-full"
              value={line.text}
              onChange={(event) =>
                updateLine(template.footer.lines, index, {
                  text: event.target.value,
                })
              }
            />
          </label>
        ))}
      </section>
    );
  }

  const section = template.sections.find(
    (item) => `section.${item.id}` === selected,
  );
  if (!section) {
    return (
      <section className="rounded-2xl border border-base-300 bg-base-100 p-4 text-sm text-base-content/50">
        اختر عنصراً من شجرة التصميم.
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-base-300 bg-base-100 p-4">
      <h3 className="text-sm font-black">الخصائص — {section.title}</h3>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={section.show}
          onChange={(event) => {
            const next = clone(template);
            const target = next.sections.find((item) => item.id === section.id)!;
            target.show = event.target.checked;
            onChange(next);
          }}
        />
        إظهار القسم
      </label>
      <label className="block space-y-1 text-sm font-bold">
        <span>العنوان</span>
        <input
          className="input input-bordered input-sm w-full"
          value={section.title}
          onChange={(event) => {
            const next = clone(template);
            const target = next.sections.find((item) => item.id === section.id)!;
            target.title = event.target.value;
            onChange(next);
          }}
        />
      </label>
      {(section.columns ?? []).map((column, index) => (
        <label key={column.key} className="block space-y-1 text-sm font-bold">
          <span>{column.key}</span>
          <input
            className="input input-bordered input-sm w-full"
            value={column.label}
            onChange={(event) => {
              const next = clone(template);
              const target = next.sections.find(
                (item) => item.id === section.id,
              )!;
              target.columns![index] = {
                ...target.columns![index]!,
                label: event.target.value,
              };
              onChange(next);
            }}
          />
        </label>
      ))}
    </section>
  );
}
```

- [ ] **Step 7: Create `components/admin/report-design/ReportPreview.tsx`**

```tsx
"use client";

import { layoutTemplate } from "@/lib/print/templates/layout";
import type {
  DocumentData,
  ReportTemplate,
  TextSize,
} from "@/lib/print/templates/types";

type ReportPreviewProps = {
  template: ReportTemplate;
  sample: DocumentData;
};

const TEXT_SIZE: Record<TextSize, number> = {
  small: 11,
  normal: 12,
  large: 14,
  xlarge: 16,
};

export function ReportPreview({ template, sample }: ReportPreviewProps) {
  const lines = layoutTemplate(template, sample);

  return (
    <aside className="rounded-2xl border border-base-300 bg-base-100 p-3">
      <h3 className="mb-3 text-sm font-black">معاينة</h3>
      <div
        dir="rtl"
        className="mx-auto w-full max-w-72 rounded-xl bg-white p-3 text-black shadow"
      >
        {lines.map((line, index) => {
          if (line.kind === "separator") {
            return (
              <hr
                key={index}
                className="my-1 border-dashed border-neutral-400"
              />
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
              <div key={index} className="flex flex-row-reverse gap-1">
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
    </aside>
  );
}
```

- [ ] **Step 8: Add the nav entry**

In `components/AdminNav.tsx`, add `FileText` to the `lucide-react` import and insert **after** the existing `التقارير` entry:

```tsx
  { href: "/admin/reports", label: "التقارير", icon: BarChart3 },
  { href: "/admin/reports/design", label: "تصميم التقارير", icon: FileText },
```

- [ ] **Step 9: Run the component test**

Run: `npx vitest run components/admin/report-design/ReportDesignAdmin.test.tsx`
Expected: PASS (9 tests).

> Implementation note (post-review): the test file shipped with three stronger
> assertions than the Step 1 block above: (a) the invalid-JSON test now saves and
> checks the unapplied default is what gets stored, (b) an invalid `.fprep` import
> is covered, (c) document switching with unsaved changes is covered via a hoisted
> router mock and a `window.confirm` spy. It also asserts the reset restores the
> default header text, the test print receives the current design JSON and printer,
> and test print refuses with no printer. Task 10 appends 2 guard tests → 11 total,
> not 8.

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `File | undefined` in `importFile` complains under `exactOptionalPropertyTypes`, keep the parameter as `file: File | undefined`; the plan already does.

---

### Task 10: Unsaved-change guard

**Files:**
- Modify: `components/admin/report-design/ReportDesignAdmin.tsx`
- Test: `components/admin/report-design/ReportDesignAdmin.test.tsx`

**Interfaces:**
- Consumes the Task 9 component.
- Produces: a `beforeunload` listener registered while `dirty` is true, so a browser close or reload prompts before losing edits.

- [ ] **Step 1: Add the failing guard tests**

Append to `components/admin/report-design/ReportDesignAdmin.test.tsx`:

```tsx
describe("ReportDesignAdmin guards", () => {
  it("warns before leaving with unsaved changes", () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "الترويسة" }));
    fireEvent.change(screen.getByLabelText("نص السطر 1"), {
      target: { value: "مرحباً" },
    });

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

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/admin/report-design/ReportDesignAdmin.test.tsx`
Expected: FAIL — the `beforeunload` event is not prevented while the design is dirty.

- [ ] **Step 3: Register the guard in `ReportDesignAdmin.tsx`**

Change the React import to include `useEffect`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
```

Add this effect immediately after the `dirty` memo:

```tsx
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run components/admin/report-design/ReportDesignAdmin.test.tsx`
Expected: PASS (11 tests — 9 from Task 9 after its review round, plus 2 guards).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 11: Full verification and installed-build check

**Files:**
- No new files.
- Verify: the whole repository and the installed app.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS. Any failure in the pre-existing print suite means Task 6 or Task 7 diverged from the ported tests.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors. React Compiler warnings are allowed (they are configured as warnings).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds. The standalone output must not import `node:fs` from a `"use client"` module; if it does, `ReportPreview` or `ReportDesignAdmin` is importing a node-only helper.

- [ ] **Step 5: Browser check**

Start the dev server with `npm run dev`, log in as the owner (the user enters credentials; never type them), and verify:

1. `/admin/reports/design` opens on إيصال الدفع.
2. The preview shows الصنف / الكمية / السعر / الإجمالي and the sample rows.
3. Editing a header line updates the preview after `حفظ التصميم`.
4. Switching to `JSON` and applying `{` shows `ملف التصميم ليس JSON صالحاً` and does not save.
5. `تصدير .fprep` downloads `fastpos-receipt.fprep`; re-importing it restores the edited label.
6. `استعادة الافتراضي` asks for confirmation, then the preview returns to the default labels.
7. `طباعة تجريبية` prints the sample to the selected printer.
8. The five tabs switch documents and `تغييرات غير محفوظة` appears after an edit.

- [ ] **Step 6: Installer build and install**

Run `npm run build`, then:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -SkipNpm
```

Install the produced EXE on the owner's machine (the owner approves UAC), then repeat checks 1–3 and 7 on the installed app against the real printers. Timed printing behavior must be verified on this installed build, not in the browser.

---

### Task 12: Documentation, worklog, and memory

**Files:**
- Modify: `README.md`
- Modify: `PROJECT_INDEX.md`
- Create: `docs/worklog/2026-10-31-report-designs.md`
- Create: `C:\Users\zakaria\.qoder\projects\C--Users-zakaria-fast-pos\memory\report-designs.md`
- Modify: `C:\Users\zakaria\.qoder\projects\C--Users-zakaria-fast-pos\memory\MEMORY.md`

- [ ] **Step 1: Document the feature in `README.md`**

Add a short section (match the existing heading level and tone):

```markdown
## تصميم التقارير

يفتح المدير **تصميم التقارير** من لوحة الإدارة لتخصيص الإيصالات والتقارير الخمسة
(إيصال الدفع، تذكرة المطبخ، تقرير الوردية، تذكرة الأصناف، تقرير المبيعات).

- التصميم يُحفظ في قاعدة البيانات (`report_template.<document>`) ولا يتأثر بتحديث التطبيق.
- الزر **استعادة الافتراضي** يحذف التخصيص ويعود إلى القالب المدمج.
- **استيراد/تصدير .fprep** ينقل التصميم بين الأجهزة.
- **طباعة تجريبية** ترسل معاينة بالبيانات الوهمية إلى الطابعة المختارة.
```

- [ ] **Step 2: Add the file map to `PROJECT_INDEX.md`**

Add the new paths beside the existing print entries:

```markdown
- `lib/print/templates/` — أنواع القوالب، التحقق، القوالب الافتراضية، محرك التخطيط، التصدير إلى ESC/POS، والتخزين.
- `app/actions/report-templates.ts` — إجراءات حفظ/استعادة/طباعة تجريبية (مدير فقط، مع تدقيق).
- `app/admin/(panel)/reports/design/` + `components/admin/report-design/` — صفحة تصميم التقارير.
```

- [ ] **Step 3: Write the worklog**

Create `docs/worklog/2026-10-31-report-designs.md`:

```markdown
# تصميم التقارير — 2026-10-31

## ما تم

- قالب `.fprep` (JSON v1) لخمسة مستندات: receipt، kitchen، shift، items، sales.
- تصميم إيصال الدفع بأربعة أعمدة: الصنف | الكمية | السعر | الإجمالي.
- محرك تخطيط نقي (isomorphic) + مصفوفة أعمدة ESC/POS بعرض 384 بكسل.
- تخزين التصميم في `app_settings` بمفتاح `report_template.<document>` مع رجوع إلى الافتراضي.
- صفحة إدارة `/admin/reports/design` مع شجرة تصميم، خصائص، معاينة، JSON، استيراد/تصدير، وطباعة تجريبية.
- إجراءات خادم محمية بـ `assertAdmin` ومسجلة في سجل التدقيق (`settings` / `test`).

## قرارات مقفلة

- كل القوالب تُحفظ في قاعدة البيانات، لا ملفات على القرص، حتى لا يمسحها تحديث التطبيق.
- التصميم السيئ لا يوقف الطباعة: `loadReportTemplate` يعود للافتراضي ويطبع تحذيراً واحداً لكل مستند.
- لا مسار طباعة من المتصفح؛ الطباعة التجريبية تستخدم نفس مسار ESC/POS المباشر.
- عرض الأعمدة محرفي (sums to paper.columns) ويُحول إلى 384 بكسل عند العرض.

## التحقق

- `npx vitest run` — نجاح.
- `npx tsc --noEmit` — بلا أخطاء.
- `npm run lint` — بلا أخطاء جديدة.
- `npm run build` — نجاح.
- بناء المثبّت وتجربته على جهاز المالك: صفحة التصميم، معاينة، حفظ، استعادة، وطباعة تجريبية.
```

- [ ] **Step 4: Save project memory**

Create `C:\Users\zakaria\.qoder\projects\C--Users-zakaria-fast-pos\memory\report-designs.md`:

```markdown
---
name: report-designs
description: Report design templates (.fprep) stored in app_settings, admin designer page, four-column receipt, default fallback
metadata:
  type: project
---

Report designs are `.fprep` JSON v1 templates for five documents (`receipt`, `kitchen`, `shift`, `items`, `sales`), edited at `/admin/reports/design` and stored under `report_template.<document>` in `app_settings`; missing or invalid templates fall back to built-in defaults (one warning per document).

**Why:** The owner wanted DevExpress-style design customization without shipping new builds for every layout tweak, and upgrades must never overwrite saved designs.

**How to apply:** Read `lib/print/templates/` before touching print layout; `loadReportTemplate` is the only read path. Tests must pass a template override so they never hit the live DB. Do not add a browser print path — previews and test prints use direct ESC/POS.
```

- [ ] **Step 5: Index the memory**

Add to `MEMORY.md`:

```markdown
- [Report designs](report-designs.md) — `.fprep` templates for five documents; DB-stored, admin designer page, default fallback.
```

- [ ] **Step 6: Verify the docs build is unaffected**

Run: `npx tsc --noEmit`
Expected: no errors.
