import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { PNG } from "pngjs";
import { pngToEscPosRaster } from "./logo";
import { normalizePrinterText, hasArabicText } from "./encoding";

export const TEXT_RASTER_WIDTH = 384;
export const TEXT_RASTER_PAD = 8;
export const FONT_FAMILY = 'Tahoma, "Segoe UI", Arial, sans-serif';

function fontFor(fontSize: number, bold?: boolean) {
  return `${bold ? "bold " : ""}${fontSize}px ${FONT_FAMILY}`;
}

function wrapMeasured(
  ctx: { measureText: (text: string) => { width: number } },
  text: string,
  maxWidth: number,
): string[] {
  const value = text.trim();
  if (!value) return [""];
  if (ctx.measureText(value).width <= maxWidth) return [value];

  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  const pushHard = (chunk: string) => {
    let rest = chunk;
    while (rest && ctx.measureText(rest).width > maxWidth) {
      let cut = rest.length;
      while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > maxWidth) {
        cut -= 1;
      }
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest) lines.push(rest);
  };

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
    } else {
      pushHard(word);
      current = "";
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [value];
}

export function wrapTextRows(
  text: string,
  options: {
    bold?: boolean;
    fontSize: number;
    maxWidth?: number;
  },
): string[] {
  const maxWidth =
    options.maxWidth ?? TEXT_RASTER_WIDTH - TEXT_RASTER_PAD * 2;
  const measureCanvas = createCanvas(TEXT_RASTER_WIDTH, options.fontSize + 10);
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.font = fontFor(options.fontSize, options.bold);
  return wrapMeasured(
    measureCtx,
    normalizePrinterText(text),
    maxWidth,
  );
}

export function drawTextRows(
  ctx: SKRSContext2D | CanvasRenderingContext2D,
  rows: string[],
  options: {
    bold?: boolean;
    fontSize: number;
    align: "right" | "center" | "left";
    y: number;
  },
): number {
  const lineHeight = options.fontSize + 10;
  ctx.fillStyle = "#000000";
  ctx.font = fontFor(options.fontSize, options.bold);
  ctx.textAlign = options.align;
  ctx.textBaseline = "middle";

  const x =
    options.align === "center"
      ? TEXT_RASTER_WIDTH / 2
      : options.align === "left"
        ? TEXT_RASTER_PAD
        : TEXT_RASTER_WIDTH - TEXT_RASTER_PAD;
  rows.forEach((row, index) => {
    ctx.fillText(row, x, options.y + index * lineHeight + lineHeight / 2);
  });
  return rows.length * lineHeight;
}

export function textToEscPosRaster(
  text: string,
  options: {
    bold?: boolean;
    fontSize?: number;
    align?: "right" | "center" | "left";
  } = {},
): Uint8Array {
  const fontSize = options.fontSize ?? (options.bold ? 30 : 26);
  const align = options.align ?? "right";
  const rows = wrapTextRows(text, { bold: options.bold, fontSize });
  const lineHeight = fontSize + 10;
  const height = Math.max(lineHeight, rows.length * lineHeight);
  const canvas = createCanvas(TEXT_RASTER_WIDTH, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, TEXT_RASTER_WIDTH, height);
  drawTextRows(ctx, rows, { bold: options.bold, fontSize, align, y: 0 });

  const png = PNG.sync.read(canvas.toBuffer("image/png"));
  return pngToEscPosRaster(png, TEXT_RASTER_WIDTH);
}

export type ColumnCell = {
  text: string;
  align: "left" | "center" | "right";
  bold?: boolean;
  fontSize?: number;
};

function fitCell(
  text: string,
  width: number,
  align: "left" | "center" | "right",
): string {
  if (width <= 0) return "";
  const value =
    text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text;
  const pad = Math.max(0, width - value.length);
  if (align === "left") return value + " ".repeat(pad);
  if (align === "center") {
    const left = Math.floor(pad / 2);
    return " ".repeat(left) + value + " ".repeat(pad - left);
  }
  return " ".repeat(pad) + value;
}

/** Text fallback: the first template column is printed at the right edge. */
export function columnsToText(
  cells: Array<{ text: string; align?: "left" | "center" | "right" }>,
  widths: number[],
): string {
  let line = "";
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    const cell = cells[index]!;
    line += fitCell(cell.text, widths[index] ?? 0, cell.align ?? "right");
  }
  return line;
}

/**
 * Draws one table row at logical 384-px coordinates. The first column sits at
 * the right edge, matching the ESC/POS output. Returns the row height.
 */
export function drawColumnCells(
  ctx: SKRSContext2D | CanvasRenderingContext2D,
  cells: ColumnCell[],
  widths: number[],
  y: number,
): number {
  const largest = Math.max(...cells.map((cell) => cell.fontSize ?? 26), 20);
  const lineHeight = largest + 10;

  ctx.fillStyle = "#000000";
  ctx.textBaseline = "middle";

  const bounds: Array<{ left: number; right: number; width: number }> = [];
  let offset = 0;
  for (const width of widths) {
    const right = Math.min(
      TEXT_RASTER_WIDTH,
      Math.max(0, TEXT_RASTER_WIDTH - offset),
    );
    offset += width;
    const left = Math.min(right, Math.max(0, right - width));
    bounds.push({ left, right, width: Math.max(0, right - left) });
  }

  cells.forEach((cell, index) => {
    const bound = bounds[index];
    if (!bound || bound.width <= 0) return;

    const alignMode = cell.align ?? "right";
    let fontSize = Math.max(20, cell.fontSize ?? 26);
    let text = normalizePrinterText(cell.text);
    const font = () => fontFor(fontSize, cell.bold);

    ctx.font = font();
    while (fontSize > 20 && ctx.measureText(text).width > bound.width - 4) {
      fontSize -= 2;
      ctx.font = font();
    }
    if (ctx.measureText(text).width > bound.width) {
      while (
        text.length > 1 &&
        ctx.measureText(`${text}…`).width > bound.width
      ) {
        text = text.slice(0, -1);
      }
      text = `${text}…`;
    }

    ctx.direction = hasArabicText(text) ? "rtl" : "ltr";
    ctx.textAlign = alignMode;
    const x = Math.min(
      TEXT_RASTER_WIDTH,
      Math.max(
        0,
        alignMode === "left"
          ? bound.left + 2
          : alignMode === "center"
            ? bound.left + bound.width / 2
            : bound.right - 2,
      ),
    );
    ctx.fillText(text, x, y + lineHeight / 2);
  });

  return lineHeight;
}

export function columnsToEscPos(
  cells: ColumnCell[],
  widths: number[],
): Uint8Array {
  const largest = Math.max(...cells.map((cell) => cell.fontSize ?? 26), 20);
  const lineHeight = largest + 10;
  const canvas = createCanvas(TEXT_RASTER_WIDTH, lineHeight);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, TEXT_RASTER_WIDTH, lineHeight);
  drawColumnCells(ctx, cells, widths, 0);

  const png = PNG.sync.read(canvas.toBuffer("image/png"));
  return pngToEscPosRaster(png, TEXT_RASTER_WIDTH);
}
