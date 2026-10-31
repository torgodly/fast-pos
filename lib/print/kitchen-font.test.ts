// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/settings", () => ({
  getSettingValue: () => null,
  setSettingValue: () => {},
  deleteSettingValue: () => {},
  getBrandDetails: () => ({ name: "", phone: "", address: "" }),
  getReceiptFooterMessage: () => "",
}));

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
