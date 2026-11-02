import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES_V2 } from "./defaults-v2";
import { MAX_ELEMENTS, MAX_ROWS, MAX_SEPARATOR_REFS } from "./elements";
import { validateReportTemplateV2 } from "./schema-v2";
import {
  REPORT_DOCUMENTS,
  type ReportDocument,
  type ReportTemplateV2,
  type TemplateElement,
} from "./types";

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

  it("rejects prototype keys as the document instead of throwing", () => {
    const value = { ...validReceipt(), document: "constructor" };
    expect(() => validateReportTemplateV2(value, "receipt")).not.toThrow();
    const result = validateReportTemplateV2(value, "receipt");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("document غير معروف");
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

// The design spec §9 requires a failing case per v2 rule. These fixtures clone
// the shipped receipt default and mutate it, so the table never drifts from the
// real template shape.
function defaultReceipt(): ReportTemplateV2 {
  return structuredClone(DEFAULT_REPORT_TEMPLATES_V2.receipt);
}

function freeRow(value: ReportTemplateV2): number {
  return Math.max(-1, ...value.elements.map((element) => element.row)) + 1;
}

function pushText(
  value: ReportTemplateV2,
  patch: Partial<Extract<TemplateElement, { type: "text" }>>,
) {
  value.elements.push({
    id: `el_added_${value.elements.length}`,
    type: "text",
    row: freeRow(value),
    col: 0,
    width: 32,
    visible: true,
    text: "x",
    ...patch,
  });
}

function findElement<T extends TemplateElement["type"]>(
  value: ReportTemplateV2,
  type: T,
): Extract<TemplateElement, { type: T }> {
  const element = value.elements.find(
    (entry): entry is Extract<TemplateElement, { type: T }> => entry.type === type,
  );
  if (!element) throw new Error(`the receipt default has no ${type} element`);
  return element;
}

// The migrated defaults carry no QR element, so size-bounds cases add one.
function pushQr(value: ReportTemplateV2, sizePx: number) {
  value.elements.push({
    id: `el_added_qr_${value.elements.length}`,
    type: "qr",
    row: freeRow(value),
    col: 12,
    width: 8,
    visible: true,
    sizePx,
  });
}

type InvalidCase = {
  name: string;
  mutate: (value: ReportTemplateV2) => void;
  message: string;
};

const invalidCases: InvalidCase[] = [
  {
    name: `more than ${MAX_ELEMENTS} elements`,
    mutate: (value) => {
      while (value.elements.length <= MAX_ELEMENTS) pushText(value, {});
    },
    message: `elements يتجاوز ${MAX_ELEMENTS} عنصراً`,
  },
  {
    name: `a row at or past ${MAX_ROWS}`,
    mutate: (value) => pushText(value, { row: MAX_ROWS }),
    message: ".row غير صالح",
  },
  {
    name: "a non-integer row",
    mutate: (value) => pushText(value, { row: 1.5 }),
    message: ".row غير صالح",
  },
  {
    name: "a negative col",
    mutate: (value) => pushText(value, { col: -1 }),
    message: ".col غير صالح",
  },
  {
    name: "a zero width",
    mutate: (value) => pushText(value, { width: 0 }),
    message: ".width غير صالح",
  },
  {
    name: "a non-integer width",
    mutate: (value) => pushText(value, { width: 2.5 }),
    message: ".width غير صالح",
  },
  {
    name: "col + width past the paper",
    mutate: (value) => pushText(value, { col: 28, width: 8 }),
    message: "col + width يتجاوز العرض",
  },
  {
    name: "an element id outside the pattern",
    mutate: (value) => pushText(value, { id: "bad_id" }),
    message: ".id غير صالح",
  },
  {
    name: "a duplicate element id",
    mutate: (value) => {
      const first = value.elements[0]!;
      value.elements.push({ ...first, row: freeRow(value) });
    },
    message: "id مكرر",
  },
  {
    name: "a QR below the minimum size",
    mutate: (value) => pushQr(value, 95),
    message: ".sizePx غير صالح",
  },
  {
    name: "a QR above the maximum size",
    mutate: (value) => pushQr(value, 500),
    message: ".sizePx غير صالح",
  },
  {
    name: `more than ${MAX_SEPARATOR_REFS} separator references`,
    mutate: (value) => {
      const refs = value.elements
        .filter((element) => element.type !== "separator")
        .map((element) => element.id)
        .slice(0, MAX_SEPARATOR_REFS + 1);
      expect(refs).toHaveLength(MAX_SEPARATOR_REFS + 1);
      findElement(value, "separator").hideWhenEmptyOf = refs;
    },
    message: `hideWhenEmptyOf يتجاوز ${MAX_SEPARATOR_REFS}`,
  },
];

describe("validateReportTemplateV2 rule coverage", () => {
  it.each(invalidCases)("rejects $name", ({ mutate, message }) => {
    const value = defaultReceipt();
    mutate(value);
    const result = validateReportTemplateV2(value, "receipt");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.includes(message))).toBe(true);
  });

  it.each(REPORT_DOCUMENTS)("accepts the shipped %s default", (doc: ReportDocument) => {
    const result = validateReportTemplateV2(DEFAULT_REPORT_TEMPLATES_V2[doc], doc);
    expect(result.ok).toBe(true);
  });
});
