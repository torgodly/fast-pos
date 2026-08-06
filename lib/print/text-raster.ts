import { createCanvas } from "@napi-rs/canvas";
import { PNG } from "pngjs";
import { pngToEscPosRaster } from "./logo";
import { normalizePrinterText } from "./encoding";

const RASTER_WIDTH = 384;

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
  const lineHeight = fontSize + 12;
  const canvas = createCanvas(RASTER_WIDTH, lineHeight);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, RASTER_WIDTH, lineHeight);
  ctx.fillStyle = "#000000";
  ctx.font = `${options.bold ? "bold " : ""}${fontSize}px Tahoma, "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = options.align ?? "right";
  ctx.textBaseline = "middle";

  const x =
    options.align === "center" ? RASTER_WIDTH / 2 : RASTER_WIDTH - 6;
  ctx.fillText(value, x, lineHeight / 2);

  const png = PNG.sync.read(canvas.toBuffer("image/png"));
  return pngToEscPosRaster(png, RASTER_WIDTH);
}
