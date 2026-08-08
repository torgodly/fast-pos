import { createCanvas } from "@napi-rs/canvas";
import { PNG } from "pngjs";
import { pngToEscPosRaster } from "./logo";
import { normalizePrinterText } from "./encoding";

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
    align?: "right" | "center";
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

  const x = align === "center" ? RASTER_WIDTH / 2 : RASTER_WIDTH - SIDE_PAD;
  rows.forEach((row, index) => {
    ctx.fillText(row, x, index * lineHeight + lineHeight / 2);
  });

  const png = PNG.sync.read(canvas.toBuffer("image/png"));
  return pngToEscPosRaster(png, RASTER_WIDTH);
}
