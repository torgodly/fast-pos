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
    expect(ids.indexOf("el_sep_footer")).toBe(ids.indexOf("el_footer_0") - 1);

    // shift forbids a summary in v2 (no summaryAllowed), so the summary
    // ordering is asserted on a document that permits one.
    const withSummary = migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.items);
    const summaryIds = withSummary.elements.map((element) => element.id);
    expect(summaryIds.indexOf("el_sep_summary")).toBe(
      summaryIds.indexOf("el_summary") - 1,
    );
  });
});
