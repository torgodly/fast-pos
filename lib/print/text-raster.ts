import { createCanvas } from "@napi-rs/canvas";
import { PNG } from "pngjs";
import { pngToEscPosRaster } from "./logo";
import { normalizePrinterText, hasArabicText } from "./encoding";

const RASTER_WIDTH = 384;
const SIDE_PAD = 8;

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

export function textToEscPosRaster(
  text: string,
  options: {
    bold?: boolean;
    fontSize?: number;
    align?: "right" | "center" | "left";
  } = {},
): Uint8Array {
  const value = normalizePrinterText(text);
  const fontSize = options.fontSize ?? (options.bold ? 30 : 26);
  const lineHeight = fontSize + 10;
  const align = options.align ?? "right";
  const maxWidth = RASTER_WIDTH - SIDE_PAD * 2;

  const measureCanvas = createCanvas(RASTER_WIDTH, lineHeight);
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.font = `${options.bold ? "bold " : ""}${fontSize}px Tahoma, "Segoe UI", Arial, sans-serif`;

  const rows = wrapMeasured(measureCtx, value, maxWidth);
  const height = Math.max(lineHeight, rows.length * lineHeight);
  const canvas = createCanvas(RASTER_WIDTH, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, RASTER_WIDTH, height);
  ctx.fillStyle = "#000000";
  ctx.font = `${options.bold ? "bold " : ""}${fontSize}px Tahoma, "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";

  const x =
    align === "center"
      ? RASTER_WIDTH / 2
      : align === "left"
        ? SIDE_PAD
        : RASTER_WIDTH - SIDE_PAD;
  rows.forEach((row, index) => {
    ctx.fillText(row, x, index * lineHeight + lineHeight / 2);
  });

  const png = PNG.sync.read(canvas.toBuffer("image/png"));
  return pngToEscPosRaster(png, RASTER_WIDTH);
}

export type ColumnCell = {
  text: string;
  align: "left" | "center" | "right";
  bold?: boolean;
  fontSize?: number;
};

const COLUMN_FONT_FAMILY = 'Tahoma, "Segoe UI", Arial, sans-serif';

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

export function columnsToEscPos(
  cells: ColumnCell[],
  widths: number[],
): Uint8Array {
  const largest = Math.max(...cells.map((cell) => cell.fontSize ?? 26), 20);
  const lineHeight = largest + 10;
  const canvas = createCanvas(RASTER_WIDTH, lineHeight);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, RASTER_WIDTH, lineHeight);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "middle";

  const bounds: Array<{ left: number; right: number; width: number }> = [];
  let offset = 0;
  for (const width of widths) {
    const right = Math.min(RASTER_WIDTH, Math.max(0, RASTER_WIDTH - offset));
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
    const font = () =>
      `${cell.bold ? "bold " : ""}${fontSize}px ${COLUMN_FONT_FAMILY}`;

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
      RASTER_WIDTH,
      Math.max(
        0,
        alignMode === "left"
          ? bound.left + 2
          : alignMode === "center"
            ? bound.left + bound.width / 2
            : bound.right - 2,
      ),
    );
    ctx.fillText(text, x, lineHeight / 2);
  });

  const png = PNG.sync.read(canvas.toBuffer("image/png"));
  return pngToEscPosRaster(png, RASTER_WIDTH);
}
