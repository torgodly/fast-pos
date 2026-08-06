import fs from "fs";
import path from "path";
import { PNG } from "pngjs";
import { restorePrinterTextMode } from "./encoding";

const MAX_WIDTH = 384;
const PRINT_MAX_WIDTH = 320;
const LOGO_PATH = path.join(process.cwd(), "public", "receipt-logo.png");

let cachedLogo: Uint8Array | null | undefined;
let cachedPrintDataUrl: string | null | undefined;

function readLogoPixels(): PNG | null {
  if (!fs.existsSync(LOGO_PATH)) return null;

  const buffer = fs.readFileSync(LOGO_PATH);
  if (buffer.length < 8) return null;

  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;

  if (!isPng) return null;

  try {
    return PNG.sync.read(buffer);
  } catch {
    return null;
  }
}

function lumAt(png: PNG, x: number, y: number) {
  const idx = (png.width * y + x) << 2;
  return (
    0.299 * png.data[idx] +
    0.587 * png.data[idx + 1] +
    0.114 * png.data[idx + 2]
  );
}

function alphaAt(png: PNG, x: number, y: number) {
  return png.data[((png.width * y + x) << 2) + 3];
}

function detectBackgroundLum(png: PNG) {
  const corners = [
    [0, 0],
    [png.width - 1, 0],
    [0, png.height - 1],
    [png.width - 1, png.height - 1],
  ];
  let bgSum = 0;
  let bgN = 0;
  for (const [cx, cy] of corners) {
    if (alphaAt(png, cx, cy) > 40) {
      bgSum += lumAt(png, cx, cy);
      bgN += 1;
    }
  }
  return bgN ? bgSum / bgN : 255;
}

function isInkPixel(
  png: PNG,
  x: number,
  y: number,
  bgLum: number,
  contrastThreshold = 18,
) {
  const a = alphaAt(png, x, y);
  if (a <= 40) return false;
  return Math.abs(lumAt(png, x, y) - bgLum) >= contrastThreshold;
}

export function clearReceiptLogoCache() {
  cachedLogo = undefined;
  cachedPrintDataUrl = undefined;
}

export async function getReceiptLogoEscPos(): Promise<Uint8Array | null> {
  if (cachedLogo !== undefined) return cachedLogo;

  try {
    const png = readLogoPixels();
    if (!png) {
      cachedLogo = null;
      return null;
    }
    cachedLogo = pngToEscPosRaster(png, MAX_WIDTH);
    return cachedLogo;
  } catch {
    cachedLogo = null;
    return null;
  }
}

/** White background + black ink — same logic as ESC/POS, safe for Chrome print. */
export function getReceiptLogoPrintDataUrl(
  maxWidth = PRINT_MAX_WIDTH,
): string | null {
  if (cachedPrintDataUrl !== undefined) return cachedPrintDataUrl;

  try {
    const png = readLogoPixels();
    if (!png) {
      cachedPrintDataUrl = null;
      return null;
    }

    const scale = png.width > maxWidth ? maxWidth / png.width : 1;
    const targetW = Math.max(1, Math.round(png.width * scale));
    const targetH = Math.max(1, Math.round(png.height * scale));
    const bgLum = detectBackgroundLum(png);
    const out = new PNG({ width: targetW, height: targetH });

    for (let i = 0; i < out.data.length; i += 4) {
      out.data[i] = 255;
      out.data[i + 1] = 255;
      out.data[i + 2] = 255;
      out.data[i + 3] = 255;
    }

    for (let y = 0; y < targetH; y += 1) {
      const srcY = Math.min(png.height - 1, Math.floor(y / scale));
      for (let x = 0; x < targetW; x += 1) {
        const srcX = Math.min(png.width - 1, Math.floor(x / scale));
        if (!isInkPixel(png, srcX, srcY, bgLum)) continue;
        const idx = (targetW * y + x) << 2;
        out.data[idx] = 0;
        out.data[idx + 1] = 0;
        out.data[idx + 2] = 0;
        out.data[idx + 3] = 255;
      }
    }

    const buffer = PNG.sync.write(out);
    cachedPrintDataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
    return cachedPrintDataUrl;
  } catch {
    cachedPrintDataUrl = null;
    return null;
  }
}

export function pngToEscPosRaster(png: PNG, maxWidth: number): Uint8Array {
  const scale = png.width > maxWidth ? maxWidth / png.width : 1;
  const targetW = Math.max(1, Math.round(png.width * scale));
  const targetH = Math.max(1, Math.round(png.height * scale));
  const bytesPerRow = Math.ceil(targetW / 8);
  const bgLum = detectBackgroundLum(png);
  const raster = new Uint8Array(bytesPerRow * targetH);

  for (let y = 0; y < targetH; y += 1) {
    const srcY = Math.min(png.height - 1, Math.floor(y / scale));
    for (let x = 0; x < targetW; x += 1) {
      const srcX = Math.min(png.width - 1, Math.floor(x / scale));
      if (!isInkPixel(png, srcX, srcY, bgLum)) continue;
      const byteIndex = y * bytesPerRow + (x >> 3);
      raster[byteIndex] |= 0x80 >> (x & 7);
    }
  }

  const GS = 0x1d;
  const header = new Uint8Array([
    GS,
    0x76,
    0x30,
    0x00,
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    targetH & 0xff,
    (targetH >> 8) & 0xff,
  ]);

  const out = new Uint8Array(header.length + raster.length);
  out.set(header, 0);
  out.set(raster, header.length);
  return out;
}

export function appendLogo(parts: Uint8Array[], logo: Uint8Array | null) {
  if (!logo) return;
  const ESC = 0x1b;

  parts.push(new Uint8Array([ESC, 0x61, 0x01])); // center logo
  parts.push(logo);
  parts.push(new Uint8Array([0x0a]));
  parts.push(restorePrinterTextMode("right"));
}
