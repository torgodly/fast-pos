import qrcode from "qrcode-generator";
import { PNG } from "pngjs";
import { pngToEscPosRaster } from "../logo";

const QUIET_MODULES = 4;
const CACHE_LIMIT = 64;
const cache = new Map<string, Uint8Array>();

// The library's default encoder truncates each code unit with `& 0xff` (Latin-1),
// which turns the Arabic currency text in the receipt payload ("38.00 د.ل") into
// garbage. Encode as UTF-8 bytes so the scanned payload matches `receiptQrPayload`.
qrcode.stringToBytes = (value) => Array.from(new TextEncoder().encode(value));

function makeQr(payload: string) {
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();
  return qr;
}

export type QrMatrix = {
  count: number;
  isDark: (row: number, col: number) => boolean;
};

/** The module grid behind `qrPng`, for vector drawing (PDF pages). */
export function qrMatrix(payload: string): QrMatrix {
  const qr = makeQr(payload);
  return {
    count: qr.getModuleCount(),
    isDark: (row, col) => qr.isDark(row, col),
  };
}

export function qrPng(payload: string, sizePx: number): PNG {
  const qr = makeQr(payload);
  const count = qr.getModuleCount();
  const modules = count + QUIET_MODULES * 2;
  const scale = Math.max(1, Math.floor(sizePx / modules));
  const width = modules * scale;
  const png = new PNG({ width, height: width });
  png.data.fill(255);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const moduleX = Math.floor(x / scale) - QUIET_MODULES;
      const moduleY = Math.floor(y / scale) - QUIET_MODULES;
      if (moduleX < 0 || moduleY < 0 || moduleX >= count || moduleY >= count) continue;
      if (!qr.isDark(moduleY, moduleX)) continue;
      const index = (width * y + x) << 2;
      png.data[index] = 0;
      png.data[index + 1] = 0;
      png.data[index + 2] = 0;
    }
  }
  return png;
}

export function qrRaster(payload: string, sizePx: number): Uint8Array {
  const key = `${payload}|${sizePx}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const bytes = pngToEscPosRaster(qrPng(payload, sizePx), 384);
  cache.set(key, bytes);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return bytes;
}

export function qrCacheSize(): number {
  return cache.size;
}

export function clearQrCache(): void {
  cache.clear();
}
