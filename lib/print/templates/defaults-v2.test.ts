import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES_V1 } from "./defaults-v1";
import { DEFAULT_REPORT_TEMPLATES_V2 } from "./defaults-v2";
import { DOCUMENT_SPECS } from "./document-specs";
import { validateReportTemplateV2 } from "./schema-v2";
import { REPORT_DOCUMENTS } from "./types";

describe("DEFAULT_REPORT_TEMPLATES_V2", () => {
  it.each(REPORT_DOCUMENTS)("is a valid v2 template for %s", (document) => {
    const template = DEFAULT_REPORT_TEMPLATES_V2[document];
    expect(validateReportTemplateV2(template, document).ok).toBe(true);
    // No shipped default prints a QR: the designer adds one explicitly.
    expect(template.elements.some((element) => element.type === "qr")).toBe(false);
  });

  it("exposes the invoice id as a kitchen binding", () => {
    expect(DOCUMENT_SPECS.kitchen.fields).toContain("invoiceId");
  });

  it("labels every kitchen field so the designer can add it", () => {
    for (const field of DOCUMENT_SPECS.kitchen.fields) {
      expect(DEFAULT_REPORT_TEMPLATES_V2.kitchen.labels[field]).toBeTruthy();
    }
  });

  it("keeps the v1 labels and adds no extra elements", () => {
    expect(DEFAULT_REPORT_TEMPLATES_V2.kitchen.labels.waiter).toBe("السفرادجي");
    expect(DEFAULT_REPORT_TEMPLATES_V2.sales.elements.some((element) => element.type === "itemTable")).toBe(false);
  });

  it("does not share the migrated item columns with the v1 default", () => {
    const itemTable = DEFAULT_REPORT_TEMPLATES_V2.receipt.elements.find(
      (element) => element.type === "itemTable",
    );
    if (itemTable?.type !== "itemTable") {
      throw new Error("the receipt default has no item table element");
    }
    expect(itemTable.columns).not.toBe(DEFAULT_REPORT_TEMPLATES_V1.receipt.items.columns);
  });
});
