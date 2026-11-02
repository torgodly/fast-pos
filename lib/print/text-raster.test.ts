// @vitest-environment node
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import {
  TEXT_RASTER_WIDTH,
  columnsToEscPos,
  columnsToText,
  drawColumnCells,
  drawTextRows,
  wrapTextRows,
} from "./text-raster";

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

function inkPixelCount(
  width: number,
  height: number,
  draw: (ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>) => void,
) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  draw(ctx);
  const data = ctx.getImageData(0, 0, width, height).data;
  let dark = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index]! < 128) dark += 1;
  }
  return dark;
}

describe("shared drawing helpers", () => {
  it("keeps short printer text on one row", () => {
    expect(wrapTextRows("شاي", { fontSize: 26 })).toEqual(["شاي"]);
  });

  it("wraps long text to the raster width", () => {
    const rows = wrapTextRows(
      "قهوة عربية مع هيل وزعفران ومكسرات لجميع الضيوف",
      { fontSize: 26 },
    );
    expect(rows.length).toBeGreaterThan(1);
  });

  it("draws text rows and reports their height", () => {
    const height = 200;
    let drawn = 0;
    const ink = inkPixelCount(TEXT_RASTER_WIDTH, height, (ctx) => {
      drawn = drawTextRows(ctx, ["شاي", "قهوة"], {
        fontSize: 26,
        align: "right",
        y: 0,
      });
    });
    expect(drawn).toBe(72);
    expect(ink).toBeGreaterThan(0);
  });

  it("draws column cells and reports the tallest row height", () => {
    let drawn = 0;
    const ink = inkPixelCount(TEXT_RASTER_WIDTH, 48, (ctx) => {
      drawn = drawColumnCells(
        ctx,
        [
          { text: "برجر", align: "right", fontSize: 26 },
          { text: "2", align: "center", fontSize: 32 },
        ],
        [200, 184],
        0,
      );
    });
    expect(drawn).toBe(42);
    expect(ink).toBeGreaterThan(0);
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
