import { isArabicRasterEnabled, restorePrinterTextMode } from "../encoding";
import { appendLogo } from "../logo";
import {
  align,
  concat,
  cut,
  init,
  printLine,
  separator,
  textLine,
} from "../primitives";
import { columnsToEscPos, columnsToText } from "../text-raster";
import { pixelWidths } from "./columns";
import type { LayoutLine, TextSize } from "./types";

export const TEXT_SIZE_PX: Record<TextSize, number> = {
  small: 22,
  normal: 26,
  large: 30,
  xlarge: 34,
};

export type RenderOptions = { logo?: Uint8Array | null };

function renderColumns(
  parts: Uint8Array[],
  line: Extract<LayoutLine, { kind: "columns" }>,
) {
  const cells = line.cells.map((cell) => ({
    text: cell.text,
    align: cell.align,
    bold: cell.bold,
    fontSize: TEXT_SIZE_PX[cell.size],
  }));

  if (isArabicRasterEnabled()) {
    parts.push(align("right"));
    parts.push(columnsToEscPos(cells, pixelWidths(line.widths, 384)));
    parts.push(restorePrinterTextMode("right"));
    return;
  }

  parts.push(align("right"), textLine(columnsToText(cells, line.widths)));
}

export function renderLayout(
  lines: LayoutLine[],
  options: RenderOptions = {},
): Uint8Array {
  const parts: Uint8Array[] = [init()];

  for (const line of lines) {
    if (line.kind === "separator") {
      parts.push(align("right"), separator());
      continue;
    }
    if (line.kind === "logo") {
      appendLogo(parts, options.logo ?? null, line.align);
      continue;
    }
    if (line.kind === "columns") {
      renderColumns(parts, line);
      continue;
    }
    printLine(parts, line.text, {
      bold: line.bold,
      align: line.align,
      fontSize: TEXT_SIZE_PX[line.size],
    });
  }

  parts.push(cut());
  return concat(...parts);
}
