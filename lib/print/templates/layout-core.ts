import { charWidths } from "./columns";
import type {
  Align,
  DocumentData,
  LayoutLine,
  TemplateColumn,
  TextSize,
} from "./types";

export type TextOptions = {
  align?: Align;
  bold?: boolean;
  size?: TextSize;
};

export type ColumnsLine = Extract<LayoutLine, { kind: "columns" }>;

export function textLine(text: string, options: TextOptions = {}): LayoutLine {
  return {
    kind: "text",
    text,
    align: options.align ?? "right",
    bold: options.bold ?? false,
    size: options.size ?? "normal",
  };
}

export function expandPlaceholders(text: string, data: DocumentData): string {
  const withGlobals = text
    .replace(/\{\{\s*title\s*\}\}/g, data.title)
    .replace(/\{\{\s*subtitle\s*\}\}/g, data.subtitle)
    .replace(/\{\{\s*venue\s*\}\}/g, data.venue)
    .replace(/\{\{\s*brand\.phone\s*\}\}/g, data.brandPhone)
    .replace(/\{\{\s*brand\.address\s*\}\}/g, data.brandAddress)
    .replace(/\{\{\s*footer\s*\}\}/g, data.footer)
    .replace(/\{\{\s*status\s*\}\}/g, data.status);
  return withGlobals
    .replace(/\{\{\s*field\.([A-Za-z][A-Za-z0-9]*)\s*\}\}/g, (_, fieldId: string) =>
      data.fields[fieldId]?.trim() ?? "",
    )
    .trim();
}

export function wrapWords(value: string, limit: number): string[] {
  const text = value.trim();
  if (!text) return [""];
  if (!Number.isFinite(limit) || limit < 1) return [text];
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    let rest = word;
    while (rest.length > limit) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    const next = current ? `${current} ${rest}` : rest;
    if (next.length <= limit) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = rest;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

export function columnCells(
  columns: TemplateColumn[],
  row: Record<string, string>,
  header = false,
): ColumnsLine {
  return {
    kind: "columns",
    widths: [],
    cells: columns.map((column) => ({
      text: row[column.key] ?? "",
      align: column.align ?? "right",
      bold: header ? true : (column.bold ?? false),
      size: column.size ?? "normal",
    })),
  };
}

/**
 * A table column may never be narrower than its own label: the header row
 * prints those labels verbatim, so a weight that cannot hold them would
 * truncate the header (e.g. "الكمية" in a 4-character quantity column).
 * Reserve the label widths first, then share the remaining paper width by
 * the extra weight each column requested.
 */
export function tableWidths(columns: TemplateColumn[], paper: number): number[] {
  const minimums = columns.map((column) => column.label.length);
  const minimumTotal = minimums.reduce((sum, value) => sum + value, 0);
  if (minimumTotal === 0) {
    return charWidths(columns.map((column) => column.width), paper);
  }
  if (minimumTotal >= paper) {
    return charWidths(minimums, paper);
  }

  const extras = columns.map((column, index) =>
    Math.max(0, column.width - minimums[index]!),
  );
  const extraTotal = extras.reduce((sum, value) => sum + value, 0);
  const extra = charWidths(
    extraTotal > 0 ? extras : columns.map((column) => column.width),
    paper - minimumTotal,
  );
  return minimums.map((minimum, index) => minimum + (extra[index] ?? 0));
}
