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
