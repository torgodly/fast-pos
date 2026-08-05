import fs from "fs";
import path from "path";
import { PNG } from "pngjs";

const MAX_WIDTH = 384;

let cachedLogo: Uint8Array | null | undefined;

/** ESC/POS raster bitmap for the receipt logo (cached). */
export async function getReceiptLogoEscPos(): Promise<Uint8Array | null> {
  if (cachedLogo !== undefined) return cachedLogo;

  const logoPath = path.join(process.cwd(), "public", "receipt-logo.png");
  if (!fs.existsSync(logoPath)) {
    cachedLogo = null;
    return null;
  }

  try {
    const buffer = fs.readFileSync(logoPath);
    const png = PNG.sync.read(buffer);
    cachedLogo = pngToEscPosRaster(png, MAX_WIDTH);
    return cachedLogo;
  } catch {
    cachedLogo = null;
    return null;
  }
}

function pngToEscPosRaster(png: PNG, maxWidth: number): Uint8Array {
  const scale = png.width > maxWidth ? maxWidth / png.width : 1;
  const targetW = Math.max(1, Math.round(png.width * scale));
  const targetH = Math.max(1, Math.round(png.height * scale));
  const bytesPerRow = Math.ceil(targetW / 8);

  const raster = new Uint8Array(bytesPerRow * targetH);

  for (let y = 0; y < targetH; y += 1) {
    const srcY = Math.min(png.height - 1, Math.floor(y / scale));
    for (let x = 0; x < targetW; x += 1) {
      const srcX = Math.min(png.width - 1, Math.floor(x / scale));
      const idx = (png.width * srcY + srcX) << 2;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const a = png.data[idx + 3];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const ink = a > 40 && lum < 210;

      if (ink) {
        const byteIndex = y * bytesPerRow + (x >> 3);
        raster[byteIndex] |= 0x80 >> (x & 7);
      }
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
  parts.push(logo, new Uint8Array([0x0a]));
}
