import {
  createCanvas,
  loadImage,
  type Image,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import {
  TEXT_RASTER_PAD,
  TEXT_RASTER_WIDTH,
  drawColumnCells,
  drawTextRows,
  wrapTextRows,
} from "../text-raster";
import { pixelWidths } from "../templates/columns";
import { qrMatrix } from "../templates/qr";
import { TEXT_SIZE_PX } from "../templates/render";
import type { LayoutLine } from "../templates/types";

export const PAGE_WIDTH = TEXT_RASTER_WIDTH;
export const PAGE_SCALE = 2;
export const PAGE_MARGIN = 6;

const SEPARATOR_HEIGHT = 8;
const IMAGE_GAP = 4;

export type PageRenderOptions = {
  logoPng?: Uint8Array | null;
};

export type RenderedPage = {
  width: number;
  height: number;
  rgb: Uint8Array;
};

type Plan = {
  height: number;
  draw: (ctx: SKRSContext2D, y: number) => void;
};

function logoWidth(line: Extract<LayoutLine, { kind: "logo" }>, image: Image) {
  return Math.min(line.maxWidth ?? image.width, image.width);
}

function planLogo(
  line: Extract<LayoutLine, { kind: "logo" }>,
  image: Image | null,
): Plan | null {
  if (!image) return null;
  const width = logoWidth(line, image);
  const height = (image.height * width) / image.width;
  return {
    height: height + IMAGE_GAP,
    draw: (ctx, y) => {
      const x =
        line.offsetPx !== undefined
          ? line.offsetPx
          : line.align === "center"
            ? (PAGE_WIDTH - width) / 2
            : line.align === "left"
              ? TEXT_RASTER_PAD
              : PAGE_WIDTH - TEXT_RASTER_PAD - width;
      ctx.drawImage(image, x, y, width, height);
    },
  };
}

function planQr(line: Extract<LayoutLine, { kind: "qr" }>): Plan {
  const matrix = qrMatrix(line.payload);
  const modules = matrix.count + 8;
  const moduleSize = Math.max(1, Math.floor(line.sizePx / modules));
  const width = modules * moduleSize;
  return {
    height: width + IMAGE_GAP,
    draw: (ctx, y) => {
      ctx.fillStyle = "#000000";
      const x0 = line.offsetPx;
      for (let row = 0; row < matrix.count; row += 1) {
        for (let col = 0; col < matrix.count; col += 1) {
          if (!matrix.isDark(row, col)) continue;
          ctx.fillRect(
            x0 + (col + 4) * moduleSize,
            y + (row + 4) * moduleSize,
            moduleSize,
            moduleSize,
          );
        }
      }
    },
  };
}

function buildPlans(lines: LayoutLine[], logo: Image | null): Plan[] {
  const plans: Plan[] = [];

  for (const line of lines) {
    if (line.kind === "separator") {
      plans.push({
        height: SEPARATOR_HEIGHT,
        draw: (ctx, y) => {
          ctx.fillStyle = "#000000";
          ctx.fillRect(TEXT_RASTER_PAD, y + 3, PAGE_WIDTH - TEXT_RASTER_PAD * 2, 1);
        },
      });
      continue;
    }
    if (line.kind === "logo") {
      const plan = planLogo(line, logo);
      if (plan) plans.push(plan);
      continue;
    }
    if (line.kind === "qr") {
      plans.push(planQr(line));
      continue;
    }
    if (line.kind === "columns") {
      const fontSize = Math.max(
        ...line.cells.map((cell) => TEXT_SIZE_PX[cell.size]),
        20,
      );
      const cells = line.cells.map((cell) => ({
        text: cell.text,
        align: cell.align,
        bold: cell.bold,
        fontSize: TEXT_SIZE_PX[cell.size],
      }));
      const widths = pixelWidths(line.widths, PAGE_WIDTH);
      plans.push({
        height: fontSize + 10,
        draw: (ctx, y) => {
          drawColumnCells(ctx, cells, widths, y);
        },
      });
      continue;
    }

    const fontSize = TEXT_SIZE_PX[line.size];
    const rows = wrapTextRows(line.text, { bold: line.bold, fontSize });
    plans.push({
      height: rows.length * (fontSize + 10),
      draw: (ctx, y) => {
        drawTextRows(ctx, rows, {
          bold: line.bold,
          fontSize,
          align: line.align,
          y,
        });
      },
    });
  }

  return plans;
}

/**
 * Draws the printer layout to a bitmap: logical 384-px coordinates at 2x,
 * so the result maps cleanly onto an 80 mm PDF page.
 */
export async function renderLayoutPage(
  lines: LayoutLine[],
  options: PageRenderOptions = {},
): Promise<RenderedPage> {
  const needsLogo = lines.some((line) => line.kind === "logo");
  const logo =
    needsLogo && options.logoPng
      ? await loadImage(Buffer.from(options.logoPng))
      : null;

  const plans = buildPlans(lines, logo);
  const contentHeight = plans.reduce((sum, plan) => sum + plan.height, 0);
  const logicalHeight = Math.max(1, contentHeight + PAGE_MARGIN * 2);
  const width = PAGE_WIDTH * PAGE_SCALE;
  const height = Math.ceil(logicalHeight * PAGE_SCALE);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.scale(PAGE_SCALE, PAGE_SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_WIDTH, logicalHeight);
  ctx.textBaseline = "middle";

  let y = PAGE_MARGIN;
  for (const plan of plans) {
    plan.draw(ctx, y);
    y += plan.height;
  }

  const rgba = ctx.getImageData(0, 0, width, height).data;
  const rgb = new Uint8Array(width * height * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4) {
    rgb[target] = rgba[source]!;
    rgb[target + 1] = rgba[source + 1]!;
    rgb[target + 2] = rgba[source + 2]!;
    target += 3;
  }

  return { width, height, rgb };
}
