import iconv from "iconv-lite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { LayoutLine } from "./types";

type RenderFn = typeof import("./render").renderLayout;
let renderLayout: RenderFn;

const columnsLine: LayoutLine = {
  kind: "columns",
  widths: [10, 6, 6, 10],
  cells: [
    { text: "الصنف", align: "right", bold: true, size: "normal" },
    { text: "الكمية", align: "center", bold: true, size: "normal" },
    { text: "السعر", align: "center", bold: true, size: "normal" },
    { text: "الإجمالي", align: "center", bold: true, size: "normal" },
  ],
};

const itemLine: LayoutLine = {
  kind: "columns",
  widths: [10, 6, 6, 10],
  cells: [
    { text: "شاي", align: "right", bold: false, size: "normal" },
    { text: "2", align: "center", bold: false, size: "normal" },
    { text: "5.00", align: "center", bold: false, size: "normal" },
    { text: "10.00", align: "center", bold: false, size: "normal" },
  ],
};

const lines: LayoutLine[] = [
  { kind: "text", text: "Acme Corner", align: "center", bold: true, size: "xlarge" },
  { kind: "separator" },
  columnsLine,
  itemLine,
];

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  ({ renderLayout } = await import("./render"));
});

afterAll(() => {
  delete process.env.PRINTER_ARABIC_RASTER;
});

function decode(bytes: Uint8Array) {
  return iconv.decode(Buffer.from(bytes), "win1256");
}

function lastCut(bytes: Uint8Array) {
  for (let index = bytes.length - 3; index >= 0; index -= 1) {
    if (
      bytes[index] === 0x1d &&
      bytes[index + 1] === 0x56 &&
      bytes[index + 2] === 0x00
    ) {
      let feed = 0;
      for (let position = index - 1; position >= 0; position -= 1) {
        if (bytes[position] !== 0x0a) break;
        feed += 1;
      }
      return { index, feed };
    }
  }
  return null;
}

function contains(bytes: Uint8Array, sequence: number[]) {
  return bytes.some((_, index) =>
    sequence.every((value, offset) => bytes[index + offset] === value),
  );
}

describe("renderLayout", () => {
  it("renders the four column labels and padded amounts without x/= item lines", () => {
    const text = decode(renderLayout(lines));
    expect(text).toContain("الصنف");
    expect(text).toContain("الكمية");
    expect(text).toContain("السعر");
    expect(text).toContain("الإجمالي");
    expect(text).toContain("10.00");
    expect(text).not.toMatch(/\d+ x /);
    expect(text).toContain("-".repeat(32));
  });

  it("starts with init and ends with an eight-line cut feed", () => {
    const bytes = renderLayout(lines);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
    const cut = lastCut(bytes);
    expect(cut).not.toBeNull();
    expect(cut!.feed).toBeGreaterThanOrEqual(8);
  });

  it("sets bold and double size for xlarge lines", () => {
    const bytes = renderLayout([
      { kind: "text", text: "Acme", align: "center", bold: true, size: "xlarge" },
    ]);
    expect(contains(bytes, [0x1d, 0x21, 0x11])).toBe(true);
    expect(contains(bytes, [0x1b, 0x45, 0x01])).toBe(true);
  });

  it("only emits a centered logo when one is supplied", () => {
    const line: LayoutLine = { kind: "logo", align: "center", maxWidth: 256 };
    const logo = new Uint8Array([
      0x1d, 0x76, 0x30, 0x00, 0x01, 0x00, 0x01, 0x00, 0xff,
    ]);
    const withLogo = renderLayout([line], { logo });
    expect(contains(withLogo, [0x1b, 0x61, 0x01])).toBe(true);
    expect(renderLayout([line], { logo: null }).length).toBe(
      renderLayout([]).length,
    );
  });

  it("left-aligns a narrow logo placed at column zero", () => {
    const logo = new Uint8Array([
      0x1d, 0x76, 0x30, 0x00, 0x01, 0x00, 0x01, 0x00, 0xff,
    ]);
    const zeroOffset = renderLayout(
      [{ kind: "logo", align: "center", maxWidth: 256, offsetPx: 0 }],
      { logo },
    );
    // offsetPx 0 still means "positioned at column 0": the padded raster path
    // with left alignment, never the full-width centre path.
    expect(contains(zeroOffset, [0x1b, 0x61, 0x00])).toBe(true);
    expect(contains(zeroOffset, [0x1b, 0x61, 0x01])).toBe(false);
    expect(Array.from(zeroOffset)).toEqual(
      Array.from(
        renderLayout([{ kind: "logo", align: "left", maxWidth: 256 }], { logo }),
      ),
    );
    // The raster itself is unchanged (shiftRaster is a no-op at offset 0).
    expect(contains(zeroOffset, Array.from(logo))).toBe(true);
  });

  it("renders a QR line as a raster at the requested position", () => {
    const bytes = renderLayout([
      { kind: "qr", payload: "INV-1|2.00|now", sizePx: 96, offsetPx: 30, columns: 32 },
    ]);
    expect(contains(bytes, [0x1d, 0x76, 0x30, 0x00])).toBe(true);
    expect(contains(bytes, [0x1d, 0x76, 0x30, 0x00, 0x30, 0x00])).toBe(true);
  });

  it("emits a raster block per column row when raster mode is enabled", async () => {
    process.env.PRINTER_ARABIC_RASTER = "1";
    vi.resetModules();
    const { renderLayout: rasterRender } = await import("./render");
    const bytes = rasterRender([itemLine]);
    expect(contains(bytes, [0x1d, 0x76, 0x30, 0x00])).toBe(true);
    process.env.PRINTER_ARABIC_RASTER = "0";
  });
});
