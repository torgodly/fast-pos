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
    // toMatchObject compares arrays by length, so assert the element itself.
    expect(updateElement(value, "el_a", { text: "مرحباً" }).elements[0]).toMatchObject({
      id: "el_a",
      text: "مرحباً",
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
    const switched = changeField(value, "el_field_orderno", "waiter", {
      waiter: "السفرادجي",
    });
    expect(switched.labels.waiter).toBe("السفرادجي");
    expect(switched.elements[0]).toMatchObject({ fieldId: "waiter" });
  });

  it("treats a rejected field switch as a no-op", () => {
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
        {
          id: "el_field_waiter",
          type: "field",
          row: 1,
          col: 0,
          width: 32,
          visible: true,
          fieldId: "waiter",
        },
      ],
      { orderNo: "رقم الطلب" },
    );
    expect(changeField(value, "el_field_orderno", "waiter")).toBe(value);
    // `waiter` has no label yet, so changeField forks the labels; the rejected
    // switch must still return the original template (not the forked candidate).
    expect(
      changeField(value, "el_field_orderno", "waiter", { waiter: "السفرادجي" }),
    ).toBe(value);
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
