import { charWidths } from "./columns";
import { orderedBlockIds } from "./blocks";
import type {
  Align,
  DocumentData,
  LayoutLine,
  ReportTemplate,
  TemplateColumn,
  TemplateLine,
  TextSize,
} from "./types";

type TextOptions = {
  align?: Align;
  bold?: boolean;
  size?: TextSize;
};

type ColumnsLine = Extract<LayoutLine, { kind: "columns" }>;

function textLine(text: string, options: TextOptions = {}): LayoutLine {
  return {
    kind: "text",
    text,
    align: options.align ?? "right",
    bold: options.bold ?? false,
    size: options.size ?? "normal",
  };
}

export function expandPlaceholders(text: string, data: DocumentData): string {
  return text
    .replace(/\{\{\s*title\s*\}\}/g, data.title)
    .replace(/\{\{\s*subtitle\s*\}\}/g, data.subtitle)
    .replace(/\{\{\s*venue\s*\}\}/g, data.venue)
    .replace(/\{\{\s*brand\.phone\s*\}\}/g, data.brandPhone)
    .replace(/\{\{\s*brand\.address\s*\}\}/g, data.brandAddress)
    .replace(/\{\{\s*footer\s*\}\}/g, data.footer)
    .replace(/\{\{\s*status\s*\}\}/g, data.status)
    .trim();
}

function renderLines(lines: TemplateLine[], data: DocumentData): LayoutLine[] {
  const out: LayoutLine[] = [];
  for (const line of lines) {
    const value = expandPlaceholders(line.text, data);
    if (!value) continue;
    out.push(textLine(value, line));
  }
  return out;
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

function columnCells(
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

export function layoutHeader(
  template: ReportTemplate,
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  if (template.header.show === false) return out;
  if (template.header.logo.show && data.logoAvailable) {
    out.push({
      kind: "logo",
      align: template.header.logo.align ?? "center",
      maxWidth: template.header.logo.maxWidth ?? 256,
    });
  }
  out.push(...renderLines(template.header.lines, data));
  if (template.header.separator !== false && out.length > 0) {
    out.push({ kind: "separator" });
  }
  return out;
}

export function layoutFields(
  template: ReportTemplate,
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  if (template.fields.visible === false) return out;
  const fieldRows = template.fields.show
    .map((id) => ({ id, value: data.fields[id]?.trim() ?? "" }))
    .filter((row) => row.value.length > 0);
  if (fieldRows.length === 0) return out;
  for (const field of fieldRows) {
    out.push(textLine(`${template.labels[field.id] ?? field.id}: ${field.value}`));
  }
  if (template.fields.separator !== false) out.push({ kind: "separator" });
  return out;
}

export function layoutItems(
  template: ReportTemplate,
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  const paper = template.paper.columns;
  if (
    !template.items.show ||
    data.items.length === 0 ||
    template.items.columns.length === 0
  ) {
    return out;
  }
  const title = (template.items.title ?? "").trim();
  if (title) out.push(textLine(expandPlaceholders(title, data), { bold: true }));
  const columns = template.items.columns;
  const widths = tableWidths(columns, paper);
  const header = columnCells(
    columns,
    Object.fromEntries(columns.map((column) => [column.key, column.label])),
    true,
  );
  if (template.items.header !== false) {
    out.push({ ...header, widths });
  }
  const nameIndex = columns.findIndex((column) => column.key === "name");
  data.items.forEach((item, index) => {
    out.push({ ...columnCells(columns, item), widths });
    if (nameIndex >= 0) {
      const column = columns[nameIndex]!;
      const name = item.name ?? "";
      const limit = Math.max(4, widths[nameIndex]! - 1);
      for (const continuation of wrapWords(name, limit).slice(1)) {
        out.push(
          textLine(continuation, {
            align: column.align ?? "right",
            bold: column.bold,
            size: column.size,
          }),
        );
      }
    }
    const note = data.itemNotes[index]?.trim();
    if (template.items.showNote !== false && note) {
      out.push(textLine(`• ${note}`, { size: "small" }));
    }
  });
  if (template.items.separator !== false) out.push({ kind: "separator" });
  return out;
}

export function layoutSection(
  template: ReportTemplate,
  section: ReportTemplate["sections"][number],
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  const paper = template.paper.columns;
  if (!section.show) return out;
  const sectionData = Object.hasOwn(data.sections, section.id)
    ? data.sections[section.id]
    : undefined;
  if (!sectionData) return out;
  const rendered: LayoutLine[] = [];
  if (section.title.trim()) {
    rendered.push(textLine(section.title, { bold: true }));
  }
  if (sectionData.kind === "kv") {
    for (const row of sectionData.rows) {
      const label =
        row.label ?? template.labels[row.labelId ?? ""] ?? row.labelId ?? "";
      rendered.push(
        textLine(row.value ? `${label}: ${row.value}` : label, {
          bold: row.bold,
        }),
      );
    }
    if (sectionData.rows.length === 0) {
      if (sectionData.emptyText) {
        rendered.push(textLine(sectionData.emptyText, { align: "center" }));
      } else {
        return out;
      }
    }
  } else if (sectionData.kind === "table") {
    const columns = section.columns ?? [];
    const widths = tableWidths(columns, paper);
    rendered.push({
      ...columnCells(
        columns,
        Object.fromEntries(columns.map((column) => [column.key, column.label])),
        true,
      ),
      widths,
    });
    for (const row of sectionData.table ?? []) {
      rendered.push({ ...columnCells(columns, row), widths });
    }
    if ((sectionData.table ?? []).length === 0) {
      if (!sectionData.emptyText) return out;
      rendered.length = section.title.trim() ? 1 : 0;
      rendered.push(textLine(sectionData.emptyText, { align: "center" }));
    }
  } else {
    const columns = section.columns ?? [];
    const widths = tableWidths(columns, paper);
    const groups = sectionData.groups ?? [];
    if (groups.length === 0) {
      if (!sectionData.emptyText) return out;
      rendered.push(textLine(sectionData.emptyText, { align: "center" }));
    } else {
      groups.forEach((group, index) => {
        if (index > 0) rendered.push({ kind: "separator" });
        rendered.push(
          textLine(`— ${group.label} —`, {
            align: "center",
            bold: true,
            size: "large",
          }),
        );
        for (const row of group.rows) {
          rendered.push({ ...columnCells(columns, row), widths });
        }
        rendered.push(
          textLine(
            `${template.labels.groupTotal ?? "الإجمالي"}: ${group.total}`,
          ),
        );
      });
    }
  }
  if (rendered.length === 0) return out;
  if (section.separator !== false) out.push({ kind: "separator" });
  out.push(...rendered);
  return out;
}

export function layoutSummary(
  template: ReportTemplate,
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  if (!template.summary.show || !data.summary) return out;
  if (template.summary.separator !== false) out.push({ kind: "separator" });
  out.push(
    textLine(`${template.summary.label}: ${data.summary}`, {
      bold: true,
      size: "xlarge",
    }),
  );
  return out;
}

export function layoutFooter(
  template: ReportTemplate,
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  if (template.footer.show === false) return out;
  const footer = renderLines(template.footer.lines, data);
  if (footer.length === 0) return out;
  if (template.footer.separator !== false) out.push({ kind: "separator" });
  out.push(...footer);
  return out;
}

export function layoutTemplate(
  template: ReportTemplate,
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  for (const id of orderedBlockIds(template)) {
    if (id === "header") {
      out.push(...layoutHeader(template, data));
    } else if (id === "fields") {
      out.push(...layoutFields(template, data));
    } else if (id === "items") {
      out.push(...layoutItems(template, data));
    } else if (id === "summary") {
      out.push(...layoutSummary(template, data));
    } else if (id === "footer") {
      out.push(...layoutFooter(template, data));
    } else {
      const section = template.sections.find(
        (entry) => `section:${entry.id}` === id,
      );
      if (section) out.push(...layoutSection(template, section, data));
    }
  }
  return out;
}
