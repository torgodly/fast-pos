import iconv from "iconv-lite";

const ESC = 0x1b;
const GS = 0x1d;

export type PrinterProfile = {
  id: string;
  label: string;
  codePage: number;
  charset: string;
  /** Render Arabic as bitmap — required on POS Flex and many 80mm clones. */
  arabicRaster: boolean;
};

/** POS Flex / Epson-standard: WPC1256 Arabic = code page 50 (NOT 46 — that is Cyrillic). */
const PROFILES: Record<string, PrinterProfile> = {
  posflex: {
    id: "posflex",
    label: "POS Flex / Epson",
    codePage: 50,
    charset: "win1256",
    arabicRaster: true,
  },
  xprinter: {
    id: "xprinter",
    label: "XPrinter clone",
    codePage: 46,
    charset: "win1256",
    arabicRaster: false,
  },
  pc864: {
    id: "pc864",
    label: "PC864 Arabic",
    codePage: 37,
    charset: "iso-8859-6",
    arabicRaster: false,
  },
};

export function getPrinterProfile(): PrinterProfile {
  const key = (process.env.PRINTER_PROFILE ?? "posflex").toLowerCase();
  const base = PROFILES[key] ?? PROFILES.posflex;

  if (process.env.PRINTER_CODE_PAGE) {
    return {
      ...base,
      codePage: Number(process.env.PRINTER_CODE_PAGE),
    };
  }
  if (process.env.PRINTER_CHARSET) {
    return { ...base, charset: process.env.PRINTER_CHARSET };
  }
  if (process.env.PRINTER_ARABIC_RASTER === "0") {
    return { ...base, arabicRaster: false };
  }
  if (process.env.PRINTER_ARABIC_RASTER === "1") {
    return { ...base, arabicRaster: true };
  }

  return base;
}

export const printerProfile = getPrinterProfile();
export const PRINTER_CODE_PAGE = printerProfile.codePage;
export const PRINTER_CHARSET = printerProfile.charset;

export function useArabicRaster() {
  return printerProfile.arabicRaster;
}

export function hasArabicText(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

/** Strip bidi marks that confuse some firmware. */
export function normalizePrinterText(value: string) {
  return value.normalize("NFC").replace(/[\u200e\u200f\u061c]/g, "").trim();
}

export function encodePrinterText(value: string): Uint8Array {
  return new Uint8Array(
    iconv.encode(normalizePrinterText(value), PRINTER_CHARSET),
  );
}

/** Restore text mode after raster image. */
export function restorePrinterTextMode(
  align: "left" | "center" | "right" = "right",
): Uint8Array {
  const alignCode = align === "left" ? 0 : align === "center" ? 1 : 2;
  return new Uint8Array([
    GS,
    0x21,
    0x00,
    ESC,
    0x45,
    0x00,
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
    0x40,
    ESC,
    0x74,
    PRINTER_CODE_PAGE,
    ESC,
    0x61,
    2,
  ]);
}
