import fs from "fs";
import path from "path";
import { PNG } from "pngjs";
import { restorePrinterTextMode } from "./encoding";

const MAX_WIDTH = 384;
const LOGO_PATHS = [
  path.join(process.cwd(), "data", "receipt-logo.png"),
  path.join(process.cwd(), "public", "receipt-logo.png"),
];

const escposCache = new Map<string, Uint8Array | null>();

/** Raw PNG bytes of the receipt logo, for vector/report export paths. */
export function readReceiptLogoPng(): Uint8Array | null {
  for (const logoPath of LOGO_PATHS) {
    try {
      if (!fs.existsSync(/*turbopackIgnore: true*/ logoPath)) continue;
      const buffer = fs.readFileSync(/*turbopackIgnore: true*/ logoPath);
      if (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      ) {
        return new Uint8Array(buffer);
      }
    } catch {
      // Ignore unreadable logo files and keep looking.
    }
  }
  return null;
}

function getLogoCacheKey(): string {
  for (const logoPath of LOGO_PATHS) {
    if (!fs.existsSync(/*turbopackIgnore: true*/ logoPath)) continue;
    const stats = fs.statSync(/*turbopackIgnore: true*/ logoPath);
    return `${logoPath}:${stats.mtimeMs}:${stats.size}`;
  }
  return "missing";
}

function readLogoPixels(): PNG | null {
  for (const logoPath of LOGO_PATHS) {
    if (!fs.existsSync(/*turbopackIgnore: true*/ logoPath)) continue;
    const buffer = fs.readFileSync(/*turbopackIgnore: true*/ logoPath);
    if (
      buffer.length < 8 ||
      buffer[0] !== 0x89 ||
      buffer[1] !== 0x50 ||
      buffer[2] !== 0x4e ||
      buffer[3] !== 0x47
    ) {
      continue;
    }
    try {
      return PNG.sync.read(buffer);
    } catch {
      continue;
    }
  }
  return null;
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
  escposCache.clear();
}

export async function getReceiptLogoEscPos(
  maxWidth = MAX_WIDTH,
): Promise<Uint8Array | null> {
  const cacheKey = `${getLogoCacheKey()}:${maxWidth}`;
  if (escposCache.has(cacheKey)) return escposCache.get(cacheKey) ?? null;

  try {
    const png = readLogoPixels();
    if (!png) {
      escposCache.set(cacheKey, null);
      return null;
    }
    const bytes = pngToEscPosRaster(png, maxWidth);
    escposCache.set(cacheKey, bytes);
    return bytes;
  } catch {
    escposCache.set(cacheKey, null);
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

export function appendLogo(
  parts: Uint8Array[],
  logo: Uint8Array | null,
  align: "left" | "center" | "right" = "center",
) {
  if (!logo) return;
  const ESC = 0x1b;
  const mode = align === "left" ? 0 : align === "center" ? 1 : 2;

  parts.push(new Uint8Array([ESC, 0x61, mode]));
  parts.push(logo);
  parts.push(new Uint8Array([0x0a]));
  parts.push(restorePrinterTextMode("right"));
}

export function shiftRaster(
  raster: Uint8Array,
  offsetPx: number,
  paperPx = 384,
): Uint8Array {
  if (offsetPx <= 0) return raster;
  const bytesPerRow = raster[4]! | (raster[5]! << 8);
  const height = raster[6]! | (raster[7]! << 8);
  const rowBytes = Math.ceil(paperPx / 8);
  const out = new Uint8Array(8 + rowBytes * height);
  out[0] = 0x1d;
  out[1] = 0x76;
  out[2] = 0x30;
  out[3] = 0x00;
  out[4] = rowBytes & 0xff;
  out[5] = (rowBytes >> 8) & 0xff;
  out[6] = height & 0xff;
  out[7] = (height >> 8) & 0xff;
  const byteShift = offsetPx >> 3;
  const bitShift = offsetPx & 7;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < bytesPerRow; x += 1) {
      const value = raster[8 + y * bytesPerRow + x]!;
      if (value === 0) continue;
      const base = 8 + y * rowBytes + byteShift + x;
      if (base >= 8 + (y + 1) * rowBytes) continue;
      if (bitShift === 0) {
        out[base] = out[base]! | value;
      } else {
        out[base] = out[base]! | (value >> bitShift);
        const next = base + 1;
        if (next < 8 + (y + 1) * rowBytes) {
          out[next] = out[next]! | ((value << (8 - bitShift)) & 0xff);
        }
      }
    }
  }
  return out;
}
