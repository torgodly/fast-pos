// @vitest-environment node
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDF_PAGE_WIDTH_PT, imagePdf, pageHeightPt } from "./image-pdf";

function rgb(width: number, height: number, fill = 255) {
  return new Uint8Array(width * height * 3).fill(fill);
}

function text(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("latin1");
}

function streamAfter(pdf: string, marker: string): Buffer {
  const start = pdf.indexOf(marker);
  if (start < 0) throw new Error(`missing ${marker}`);
  const streamStart = pdf.indexOf("stream\n", start) + "stream\n".length;
  const length = Number(/\/Length (\d+)/.exec(pdf.slice(start, streamStart))![1]);
  return Buffer.from(pdf.slice(streamStart, streamStart + length), "latin1");
}

describe("pageHeightPt", () => {
  it("keeps the 80 mm width and grows with the image", () => {
    expect(PDF_PAGE_WIDTH_PT).toBeCloseTo(226.77, 2);
    expect(pageHeightPt(768, 1536)).toBeCloseTo(453.54, 2);
    expect(pageHeightPt(768, 768)).toBeCloseTo(226.77, 2);
  });
});

describe("imagePdf", () => {
  const page = {
    width: 4,
    height: 3,
    rgb: new Uint8Array([
      255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255,
      0, 0, 0, 128, 128, 128, 255, 255, 0, 0, 255, 255,
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
    ]),
  };

  it("writes a valid one-page PDF shell", () => {
    const pdf = text(imagePdf(page));
    expect(pdf.startsWith("%PDF-1.7\n")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/Type /Catalog");
    expect(pdf).toContain("/Type /Pages /Kids [3 0 R] /Count 1");
    expect(pdf).toContain("/Type /Page");
    expect(pdf).toContain(
      `/MediaBox [0 0 226.77 ${pageHeightPt(4, 3).toFixed(2)}]`,
    );
    expect(pdf).toContain("/Subtype /Image");
    expect(pdf).toContain("/ColorSpace /DeviceRGB");
    expect(pdf).toContain("/BitsPerComponent 8");
    expect(pdf).toContain("/Filter /FlateDecode");
  });

  it("stores the pixels losslessly", () => {
    const pdf = text(imagePdf(page));
    const imageStream = streamAfter(pdf, "/Subtype /Image");
    expect(inflateSync(imageStream)).toEqual(Buffer.from(page.rgb));

    const content = inflateSync(streamAfter(pdf, "4 0 obj")).toString("latin1");
    expect(content).toContain("226.77 0 0 170.08 0 0 cm");
    expect(content).toContain("/Im0 Do");
  });

  it("writes an xref table whose offsets reach every object", () => {
    const pdf = text(imagePdf(page));
    const startXref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(startXref, startXref + 4)).toBe("xref");
    const xref = pdf.slice(startXref).split("\n");
    expect(xref[1]).toBe("0 6");
    expect(xref[2]).toBe("0000000000 65535 f ");
    for (let object = 1; object <= 5; object += 1) {
      const offset = Number(xref[2 + object]!.slice(0, 10));
      expect(pdf.slice(offset, offset + `${object} 0 obj`.length)).toBe(
        `${object} 0 obj`,
      );
    }
  });

  it("rejects empty or mismatched images", () => {
    expect(() => imagePdf({ width: 0, height: 3, rgb: new Uint8Array() })).toThrow(
      /width and height/,
    );
    expect(() => imagePdf({ width: 4, height: 3, rgb: rgb(4, 2) })).toThrow(
      /pixel data/,
    );
  });
});
