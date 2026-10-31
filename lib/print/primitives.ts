import {
  encodePrinterText,
  hasArabicText,
  isArabicRasterEnabled,
  normalizePrinterText,
  printerInitBytes,
  restorePrinterTextMode,
} from "./encoding";
import { textToEscPosRaster } from "./text-raster";

export const ESC = 0x1b;
export const GS = 0x1d;
export const LINE_WIDTH = 32;

export function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function cmd(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

export function textLine(value = ""): Uint8Array {
  return concat(encodePrinterText(value), new Uint8Array([0x0a]));
}

export function money(amount: number): string {
  return `${amount.toFixed(2)} د.ل`;
}

export function init(): Uint8Array {
  return printerInitBytes();
}

export function align(mode: "left" | "center" | "right"): Uint8Array {
  const value = mode === "left" ? 0 : mode === "center" ? 1 : 2;
  return cmd(ESC, 0x61, value);
}

export function bold(on: boolean): Uint8Array {
  return cmd(ESC, 0x45, on ? 1 : 0);
}

export function doubleSize(on: boolean): Uint8Array {
  return cmd(GS, 0x21, on ? 0x11 : 0x00);
}

/** Blank feed before cutting: the cutter sits ~30mm past the print head. */
export const CUT_FEED_LINES = 8;

export function cut(): Uint8Array {
  return concat(
    ...Array.from({ length: CUT_FEED_LINES }, () => textLine()),
    cmd(GS, 0x56, 0x00),
  );
}

export function separator(): Uint8Array {
  return textLine("--------------------------------");
}

export type PrintLineOptions = {
  bold?: boolean;
  align?: "left" | "center" | "right";
  fontSize?: number;
};

export function printLine(
  parts: Uint8Array[],
  value: string,
  options: PrintLineOptions = {},
): void {
  const normalized = normalizePrinterText(value);
  if (!normalized) {
    parts.push(textLine(""));
    return;
  }

  const alignMode = options.align ?? "right";

  if (isArabicRasterEnabled() && hasArabicText(normalized)) {
    parts.push(align(alignMode));
    parts.push(
      textToEscPosRaster(normalized, {
        bold: options.bold,
        fontSize: options.fontSize,
        align: alignMode,
      }),
    );
    parts.push(restorePrinterTextMode(alignMode));
    return;
  }

  if (alignMode !== "right") parts.push(align(alignMode));
  if (options.bold) parts.push(bold(true));
  if (options.fontSize && options.fontSize >= 32) parts.push(doubleSize(true));
  parts.push(textLine(normalized));
  if (options.fontSize && options.fontSize >= 32) parts.push(doubleSize(false));
  if (options.bold) parts.push(bold(false));
  if (alignMode !== "right") parts.push(align("right"));
}
