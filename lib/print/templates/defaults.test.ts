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
