// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

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
}));

import { buildKitchenEscPos } from "./escpos";

beforeEach(() => {
  captured.length = 0;
});

describe("kitchen ticket font size", () => {
  it("prints item names larger than the old 30px with 30px notes", () => {
    buildKitchenEscPos({
      venueName: "مطعم",
      orderId: 12,
      tableName: "T1",
      waiterName: "سارة",
      createdAt: "12:30",
      kind: "order",
      lines: [{ name: "بيتزا تن كبيرة", qty: 2, note: "بدون بصل" }],
    });

    const item = captured.find((line) => line.text.includes("بيتزا تن كبيرة"));
    const note = captured.find((line) => line.text.includes("بدون بصل"));
    const meta = captured.find((line) => line.text.includes("12:30"));

    expect(item).toMatchObject({ fontSize: 34, bold: true });
    expect(note).toMatchObject({ fontSize: 30 });
    expect(meta).toMatchObject({ fontSize: 30 });
  });
});
