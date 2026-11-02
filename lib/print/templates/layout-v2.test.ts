import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES_V1 } from "./defaults-v1";
import { layoutTemplateV2 } from "./layout-v2";
import { migrateReportTemplate } from "./migrate";
import { buildSampleDocuments, sampleSettings } from "./sample";
import type { LayoutLine, ReportTemplateV2, TemplateElement } from "./types";

const samples = buildSampleDocuments(sampleSettings);
const receipt = migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.receipt);
const kitchen = migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.kitchen);
const shift = migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.shift);

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

function text(lines: LayoutLine[]): string[] {
  return lines
    .filter((line): line is Extract<LayoutLine, { kind: "text" }> => line.kind === "text")
    .map((line) => line.text);
}

describe("layoutTemplateV2", () => {
  it("renders the migrated receipt with the same block order", () => {
    const lines = layoutTemplateV2(receipt, samples.receipt);
    const values = text(lines);
    expect(values[0]).toBe("REST");
    expect(
      lines.some(
        (line) =>
          line.kind === "columns" &&
          line.cells.some((cell) => cell.text === "الصنف"),
      ),
    ).toBe(true);
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
    // Item header + three items + the note line for the second item.
    expect(afterIndex).toBe(5);
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

  it("places a narrow logo at column zero with a zero pixel offset", () => {
    const narrow = base([
      { id: "el_logo", type: "logo", row: 0, col: 0, width: 8, visible: true },
    ]);
    expect(layoutTemplateV2(narrow, samples.receipt)[0]).toMatchObject({
      kind: "logo",
      offsetPx: 0,
    });

    const full = base([
      { id: "el_logo", type: "logo", row: 0, col: 0, width: 32, visible: true },
    ]);
    // Full-width logos keep the v1 byte path, so they carry no explicit offset.
    const [fullLine] = layoutTemplateV2(full, samples.receipt);
    expect(fullLine).toMatchObject({ kind: "logo" });
    expect((fullLine as { offsetPx?: number }).offsetPx).toBeUndefined();
  });

  describe("QR offsets", () => {
    function qrOffset(element: Extract<TemplateElement, { type: "qr" }>): number {
      const template: ReportTemplateV2 = {
        ...base([]),
        paper: { columns: 48 },
        elements: [element],
      };
      const [line] = layoutTemplateV2(template, samples.receipt);
      if (!line || line.kind !== "qr") throw new Error("expected a QR line");
      expect(line.offsetPx + element.sizePx).toBeLessThanOrEqual(384);
      return line.offsetPx;
    }

    it("centres a QR inside a region that fits", () => {
      expect(
        qrOffset({ id: "el_qr", type: "qr", row: 0, col: 6, width: 6, visible: true, sizePx: 256 }),
      ).toBe(48);
    });

    it("clamps a QR that would run past the paper edge", () => {
      // Unclamped centring would be 192 px → a 448 px raster.
      expect(
        qrOffset({ id: "el_qr", type: "qr", row: 0, col: 24, width: 6, visible: true, sizePx: 256 }),
      ).toBe(128);
    });

    it("clamps a full-paper QR to offset zero", () => {
      expect(
        qrOffset({ id: "el_qr", type: "qr", row: 0, col: 24, width: 6, visible: true, sizePx: 384 }),
      ).toBe(0);
    });

    it("keeps the previous centred offset for an in-region QR", () => {
      const template = base([
        { id: "el_qr", type: "qr", row: 0, col: 12, width: 8, visible: true, sizePx: 192 },
      ]);
      expect(layoutTemplateV2(template, samples.receipt)[0]).toMatchObject({
        kind: "qr",
        offsetPx: 144,
      });
    });
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

  it("prints a non-empty summary label verbatim", () => {
    const template = base([
      { id: "el_summary", type: "summary", row: 0, col: 0, width: 32, visible: true, label: "  الإجمالي  " },
    ]);
    expect(text(layoutTemplateV2(template, samples.receipt))[0]).toBe("  الإجمالي  : 38.00 د.ل");
  });

  it("prints the total alone when the summary label is empty", () => {
    const template = base([
      { id: "el_summary", type: "summary", row: 0, col: 0, width: 32, visible: true, label: "" },
    ]);
    expect(text(layoutTemplateV2(template, samples.receipt))[0]).toBe("38.00 د.ل");
  });

  it("prints a padded section title verbatim", () => {
    const collection = shift.elements.find(
      (element): element is Extract<TemplateElement, { type: "section" }> =>
        element.type === "section" && element.sectionId === "collection",
    );
    expect(collection).toBeDefined();
    const template: ReportTemplateV2 = {
      ...shift,
      elements: [{ ...collection!, row: 0, visible: true, title: "  التحصيل  " }],
    };
    const values = text(layoutTemplateV2(template, samples.shift));
    expect(values[0]).toBe("  التحصيل  ");
    expect(values[1]).toBe("الفواتير: 12");
  });
});
