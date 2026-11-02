import { describe, expect, it } from "vitest";
import { receiptQrPayload } from "./qr-payload";
import {
  qrCacheSize,
  qrMatrix,
  qrPng,
  qrRaster,
  clearQrCache,
} from "./qr";
import { shiftRaster } from "../logo";
import { buildSampleDocuments, sampleSettings } from "./sample";

const data = buildSampleDocuments(sampleSettings).receipt;

describe("receiptQrPayload", () => {
  it("builds the invoice payload from existing fields", () => {
    expect(receiptQrPayload(data)).toBe("INV-148|38.00 د.ل|2026-10-31 14:05");
  });

  it("returns null when the invoice, total, or time is missing", () => {
    expect(receiptQrPayload({ ...data, summary: null })).toBeNull();
    expect(receiptQrPayload({ ...data, fields: { ...data.fields, time: null } })).toBeNull();
    expect(receiptQrPayload({ ...data, fields: { ...data.fields, invoiceId: "—" } })).toBeNull();
  });
});

describe("qrRaster", () => {
  it("renders a square PNG and a GS v 0 raster", () => {
    const png = qrPng("hello", 192);
    expect(png.width).toBe(png.height);
    expect(png.width).toBeLessThanOrEqual(192);
    const raster = qrRaster("hello", 192);
    expect([...raster.slice(0, 4)]).toEqual([0x1d, 0x76, 0x30, 0x00]);
    expect(raster[4]! | (raster[5]! << 8)).toBe(Math.ceil(qrPng("hello", 192).width / 8));
  });

  it("encodes payload bytes as UTF-8, not Latin-1", () => {
    // "د" (U+062F) and "/" (U+002F) collide under the library's default
    // `charCodeAt & 0xff` truncation, so their QR modules would be identical.
    const arabic = qrPng("د", 192);
    const ascii = qrPng("/", 192);
    expect(arabic.width).toBe(ascii.width);
    expect(Buffer.from(arabic.data).equals(Buffer.from(ascii.data))).toBe(false);
  });

  it("exposes the same module matrix the raster draws", () => {
    const matrix = qrMatrix("hello");
    expect(matrix.count).toBeGreaterThanOrEqual(21);
    expect(matrix.isDark(0, 0)).toBe(true);
    expect(matrix.isDark(matrix.count - 1, 0)).toBe(true);
    expect(matrix.isDark(0, matrix.count - 1)).toBe(true);

    const png = qrPng("hello", 192);
    const modules = matrix.count + 8;
    const scale = Math.floor(192 / modules);
    const at = (row: number, col: number) => {
      const x = (4 + col) * scale + Math.floor(scale / 2);
      const y = (4 + row) * scale + Math.floor(scale / 2);
      return png.data[(png.width * y + x) << 2]! < 128;
    };
    for (const [row, col] of [
      [0, 0],
      [3, 2],
      [7, 10],
      [matrix.count - 1, matrix.count - 1],
    ]) {
      expect(at(row!, col!)).toBe(matrix.isDark(row!, col!));
    }
  });

  it("caches bounded by 64 entries", () => {
    clearQrCache();
    for (let index = 0; index < 70; index += 1) qrRaster(`payload-${index}`, 96);
    expect(qrCacheSize()).toBe(64);
  });
});

describe("shiftRaster", () => {
  it("shifts a 1-byte row right by a non-byte offset", () => {
    const raster = new Uint8Array([0x1d, 0x76, 0x30, 0x00, 1, 0, 1, 0, 0x80]);
    const shifted = shiftRaster(raster, 4);
    expect(shifted[4]! | (shifted[5]! << 8)).toBe(48);
    expect(shifted[8]).toBe(0x08);
  });
});
