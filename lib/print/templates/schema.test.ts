import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import {
  parseReportTemplateJson,
  templatesEqual,
  validateReportTemplate,
} from "./schema";
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

  it("rejects prototype section ids without throwing", () => {
    for (const id of ["__proto__", "constructor", "toString"]) {
      const shift = JSON.parse(
        JSON.stringify(DEFAULT_REPORT_TEMPLATES.shift),
      ) as ReportTemplate;
      shift.sections = [{ id, title: "", show: true }];
      expect(() => validateReportTemplate(shift, "shift"), id).not.toThrow();
      expect(validateReportTemplate(shift, "shift"), id).toMatchObject({
        ok: false,
        errors: expect.arrayContaining([
          expect.stringContaining("sections[0].id غير معروف"),
        ]),
      });
      expect(
        parseReportTemplateJson(JSON.stringify(shift), "shift"),
        id,
      ).toMatchObject({ ok: false });
    }
  });
});

describe("templatesEqual", () => {
  it("ignores object key order", () => {
    const reordered = {
      ...validReceipt,
      header: {
        separator: validReceipt.header.separator,
        logo: validReceipt.header.logo,
        lines: validReceipt.header.lines,
      },
    };
    expect(templatesEqual(validReceipt, reordered)).toBe(true);
  });

  it("detects real differences", () => {
    const changed = clone(validReceipt);
    changed.footer.lines[0]!.text = "{{brand.phone}}";
    expect(templatesEqual(validReceipt, changed)).toBe(false);
  });
});

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
