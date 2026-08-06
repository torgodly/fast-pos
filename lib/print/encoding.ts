import iconv from "iconv-lite";

const ESC = 0x1b;
const GS = 0x1d;

/** ESC/POS code page — 46 = WPC1256 on most XPrinters. Override via PRINTER_CODE_PAGE. */
export const PRINTER_CODE_PAGE = Number(process.env.PRINTER_CODE_PAGE ?? 46);
export const PRINTER_CHARSET = process.env.PRINTER_CHARSET ?? "win1256";

/** Strip bidi marks that confuse some firmware. */
export function normalizePrinterText(value: string) {
  return value.normalize("NFC").replace(/[\u200e\u200f\u061c]/g, "").trim();
}

export function encodePrinterText(value: string): Uint8Array {
  return new Uint8Array(
    iconv.encode(normalizePrinterText(value), PRINTER_CHARSET),
  );
}

/** Restore text mode after raster logo — do NOT send FS & (breaks Arabic on many XPrinters). */
export function restorePrinterTextMode(
  align: "left" | "center" | "right" = "right",
): Uint8Array {
  const alignCode = align === "left" ? 0 : align === "center" ? 1 : 2;
  return new Uint8Array([
    GS,
    0x21,
    0x00, // normal char size
    ESC,
    0x45,
    0x00, // bold off
    ESC,
    0x74,
    PRINTER_CODE_PAGE,
    ESC,
    0x61,
    alignCode,
  ]);
}

export function printerInitBytes(): Uint8Array {
  return new Uint8Array([
    ESC,
    0x40, // reset
    ESC,
    0x74,
    PRINTER_CODE_PAGE,
    ESC,
    0x61,
    2, // right — correct for Arabic RTL on 80mm
  ]);
}
