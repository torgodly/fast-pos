// @vitest-environment node
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import type { LayoutLine } from "../templates/types";
import { PAGE_SCALE, PAGE_WIDTH, renderLayoutPage } from "./render-page";

function darkPixels(rgb: Uint8Array) {
  let dark = 0;
  for (let index = 0; index < rgb.length; index += 3) {
    if (rgb[index]! < 128) dark += 1;
  }
  return dark;
}

const text: LayoutLine = {
  kind: "text",
  text: "فاتورة رقم 12",
  align: "center",
  bold: true,
  size: "xlarge",
};

const columns: LayoutLine = {
  kind: "columns",
  widths: [11, 4, 7, 10],
  cells: [
    { text: "شاي", align: "right", bold: false, size: "normal" },
    { text: "2", align: "center", bold: false, size: "normal" },
    { text: "10.00", align: "center", bold: false, size: "normal" },
    { text: "20.00", align: "center", bold: false, size: "normal" },
  ],
};

describe("renderLayoutPage", () => {
  it("renders an 80 mm wide bitmap and reports its pixel size", async () => {
    const page = await renderLayoutPage([text, columns]);
    expect(page.width).toBe(PAGE_WIDTH * PAGE_SCALE);
    expect(page.height).toBeGreaterThan(0);
    expect(page.rgb).toHaveLength(page.width * page.height * 3);
    expect(darkPixels(page.rgb)).toBeGreaterThan(0);
  });

  it("keeps blank lines but draws nothing on them", async () => {
    const blank: LayoutLine = {
      kind: "text",
      text: "",
      align: "right",
      bold: false,
      size: "normal",
    };
    const withBlank = await renderLayoutPage([blank]);
    expect(withBlank.height).toBe((36 + 2 * 6) * PAGE_SCALE);
    expect(darkPixels(withBlank.rgb)).toBe(0);
  });

  it("draws separators and grows the page", async () => {
    const plain = await renderLayoutPage([text]);
    const separated = await renderLayoutPage([
      text,
      { kind: "separator" },
      text,
    ]);
    expect(separated.height).toBeGreaterThan(plain.height);
    expect(darkPixels(separated.rgb)).toBeGreaterThan(darkPixels(plain.rgb));
  });

  it("draws the logo when PNG bytes are supplied and skips it otherwise", async () => {
    const logo: LayoutLine = { kind: "logo", align: "center", maxWidth: 192 };
    const withoutLogo = await renderLayoutPage([logo]);
    expect(withoutLogo.height).toBe(2 * 6 * PAGE_SCALE);

    const canvas = createCanvas(80, 40);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 80, 40);

    const withLogo = await renderLayoutPage([logo], {
      logoPng: canvas.toBuffer("image/png"),
    });
    expect(withLogo.height).toBeGreaterThan(withoutLogo.height);
    expect(darkPixels(withLogo.rgb)).toBeGreaterThan(0);
  });

  it("draws QR modules with their quiet zone", async () => {
    const qr: LayoutLine = {
      kind: "qr",
      payload: "https://example.com/invoice/12",
      sizePx: 120,
      offsetPx: 0,
      columns: 1,
    };
    const page = await renderLayoutPage([qr]);
    expect(page.height).toBeGreaterThan(100 * PAGE_SCALE);
    expect(darkPixels(page.rgb)).toBeGreaterThan(0);
  });
});
