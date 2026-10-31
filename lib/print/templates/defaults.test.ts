import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import { templatesEqual, validateReportTemplate } from "./schema";
import { REPORT_DOCUMENTS } from "./types";

describe("default report templates", () => {
  it("every default validates for its own document", () => {
    for (const doc of REPORT_DOCUMENTS) {
      const result = validateReportTemplate(DEFAULT_REPORT_TEMPLATES[doc], doc);
      expect(result.ok, `${doc}: ${result.ok ? "" : result.errors.join(" · ")}`).toBe(true);
    }
  });

  it("every default survives a save round-trip unchanged", () => {
    for (const doc of REPORT_DOCUMENTS) {
      const result = validateReportTemplate(DEFAULT_REPORT_TEMPLATES[doc], doc);
      expect(result.ok, doc).toBe(true);
      if (!result.ok) continue;
      expect(
        templatesEqual(result.template, DEFAULT_REPORT_TEMPLATES[doc]),
        doc,
      ).toBe(true);
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
    expect(receipt.header.lines.map((line) => line.text)).toContain("{{subtitle}}");
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

    const salesSections = DEFAULT_REPORT_TEMPLATES.sales.sections;
    expect(salesSections.map((section) => section.id)).toEqual([
      "totals",
      "categories",
      "itemsList",
    ]);

    const columnsOf = (id: string) =>
      salesSections.find((section) => section.id === id)?.columns?.map((column) => [
        column.key,
        column.width,
      ]);
    expect(columnsOf("categories")).toEqual([
      ["index", 3],
      ["name", 17],
      ["qty", 5],
      ["revenue", 9],
    ]);
    expect(columnsOf("itemsList")).toEqual([
      ["index", 3],
      ["name", 17],
      ["qty", 5],
      ["revenue", 9],
    ]);
  });
});

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
