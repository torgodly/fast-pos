import {
  columnCells,
  expandPlaceholders,
  tableWidths,
  textLine,
  wrapWords,
} from "./layout-core";
import { orderedBlockIds } from "./schema-common";
import type {
  DocumentData,
  LayoutLine,
  ReportTemplateV1,
  TemplateLine,
} from "./types";

function renderLines(lines: TemplateLine[], data: DocumentData): LayoutLine[] {
  const out: LayoutLine[] = [];
  for (const line of lines) {
    const value = expandPlaceholders(line.text, data);
    if (!value) continue;
    out.push(textLine(value, line));
  }
  return out;
}

export function layoutHeaderV1(
  template: ReportTemplateV1,
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

export function layoutFieldsV1(
  template: ReportTemplateV1,
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

export function layoutItemsV1(
  template: ReportTemplateV1,
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

export function layoutSectionV1(
  template: ReportTemplateV1,
  section: ReportTemplateV1["sections"][number],
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

export function layoutSummaryV1(
  template: ReportTemplateV1,
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

export function layoutFooterV1(
  template: ReportTemplateV1,
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

export function layoutTemplateV1(
  template: ReportTemplateV1,
  data: DocumentData,
): LayoutLine[] {
  const out: LayoutLine[] = [];
  for (const id of orderedBlockIds(template)) {
    if (id === "header") {
      out.push(...layoutHeaderV1(template, data));
    } else if (id === "fields") {
      out.push(...layoutFieldsV1(template, data));
    } else if (id === "items") {
      out.push(...layoutItemsV1(template, data));
    } else if (id === "summary") {
      out.push(...layoutSummaryV1(template, data));
    } else if (id === "footer") {
      out.push(...layoutFooterV1(template, data));
    } else {
      const section = template.sections.find(
        (entry) => `section:${entry.id}` === id,
      );
      if (section) out.push(...layoutSectionV1(template, section, data));
    }
  }
  return out;
}
