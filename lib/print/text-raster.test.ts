// @vitest-environment node
import { describe, expect, it } from "vitest";
import { columnsToEscPos, columnsToText } from "./text-raster";

const cells = [
  { text: "Burger", align: "right" as const, fontSize: 26 },
  { text: "2", align: "center" as const, fontSize: 26 },
  { text: "12.00", align: "center" as const, fontSize: 26 },
  { text: "24.00", align: "center" as const, fontSize: 26 },
];

describe("columnsToText", () => {
  it("reverses cells so the first template column sits at the right edge", () => {
    const line = columnsToText(cells, [11, 4, 7, 10]);
    expect(line).toHaveLength(32);
    expect(line.endsWith("Burger")).toBe(true);
    expect(line.indexOf("24.00")).toBeLessThan(line.indexOf("Burger"));
  });

  it("truncates only when a cell cannot fit", () => {
    const line = columnsToText(
      [{ text: "123456789", align: "right", fontSize: 26 }],
      [4],
    );
    expect(line).toHaveLength(4);
    expect(line.endsWith("…")).toBe(true);
  });

  it("pads left, center, and right cells and skips zero widths", () => {
    const line = columnsToText(
      [
        { text: "L", align: "left" },
        { text: "C", align: "center" },
        { text: "R", align: "right" },
        { text: "gone", align: "right" },
      ],
      [4, 4, 4, 0],
    );
    expect(line).toBe("   R C  L   ");
  });
});

describe("columnsToEscPos", () => {
  it("emits one 384 px raster block", () => {
    const bytes = columnsToEscPos(
      [
        { text: "برجر", align: "right", fontSize: 26 },
        { text: "2", align: "center", fontSize: 26 },
      ],
      [48, 336],
    );
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x1d, 0x76, 0x30, 0x00]);
    const bytesPerRow = bytes[4]! | (bytes[5]! << 8);
    expect(bytesPerRow).toBe(48);
  });

  it("keeps the raster at 384 px for left/center cells and zero widths", () => {
    const bytes = columnsToEscPos(
      [
        { text: "Menu", align: "left", fontSize: 26 },
        { text: "وسط", align: "center", fontSize: 32 },
        { text: "", align: "right", fontSize: 26 },
        { text: "5.00", align: "right", fontSize: 26 },
      ],
      [0, 400, 20, 0],
    );
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x1d, 0x76, 0x30, 0x00]);
    const bytesPerRow = bytes[4]! | (bytes[5]! << 8);
    expect(bytesPerRow).toBe(48);
  });
});
