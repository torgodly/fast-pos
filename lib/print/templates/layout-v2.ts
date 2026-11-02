import { elementsByRow, maxElementRow, sortElements } from "./elements";
import {
  columnCells,
  expandPlaceholders,
  tableWidths,
  textLine,
  wrapWords,
} from "./layout-core";
import { receiptQrPayload } from "./qr-payload";
import type {
  DocumentData,
  LayoutLine,
  ReportTemplateV2,
  TemplateElement,
} from "./types";

const BLANK: LayoutLine = {
  kind: "text",
  text: "",
  align: "right",
  bold: false,
  size: "normal",
};

function renderText(
  element: Extract<TemplateElement, { type: "text" }>,
  data: DocumentData,
): LayoutLine[] {
  const value = expandPlaceholders(element.text, data);
  if (!value && element.hideWhenEmpty !== false) return [];
  return [
    textLine(value, {
      align: element.align,
      bold: element.bold,
      size: element.size,
    }),
  ];
}

function renderField(
  element: Extract<TemplateElement, { type: "field" }>,
  template: ReportTemplateV2,
  data: DocumentData,
): LayoutLine[] {
  const value = data.fields[element.fieldId]?.trim() ?? "";
  if (!value && element.hideWhenEmpty !== false) return [];
  const label = template.labels[element.fieldId] ?? element.fieldId;
  return [
    textLine(value ? `${label}: ${value}` : `${label}:`, {
      align: element.align,
      bold: element.bold,
      size: element.size,
    }),
  ];
}

function renderItems(
  element: Extract<TemplateElement, { type: "itemTable" }>,
  data: DocumentData,
): LayoutLine[] {
  if (data.items.length === 0 || element.columns.length === 0) return [];
  const out: LayoutLine[] = [];
  const title = (element.title ?? "").trim();
  if (title) out.push(textLine(expandPlaceholders(title, data), { bold: true }));
  const widths = tableWidths(element.columns, element.width);
  if (element.showHeader !== false) {
    out.push({
      ...columnCells(
        element.columns,
        Object.fromEntries(element.columns.map((column) => [column.key, column.label])),
        true,
      ),
      widths,
    });
  }
  const nameIndex = element.columns.findIndex((column) => column.key === "name");
  data.items.forEach((item, index) => {
    out.push({ ...columnCells(element.columns, item), widths });
    if (nameIndex >= 0) {
      const column = element.columns[nameIndex]!;
      const limit = Math.max(4, widths[nameIndex]! - 1);
      for (const continuation of wrapWords(item.name ?? "", limit).slice(1)) {
        out.push(
          textLine(continuation, {
            align: column.align,
            bold: column.bold,
            size: column.size,
          }),
        );
      }
    }
    const note = data.itemNotes[index]?.trim();
    if (element.showNotes !== false && note) {
      out.push(textLine(`• ${note}`, { size: "small" }));
    }
  });
  return out;
}

function renderSection(
  element: Extract<TemplateElement, { type: "section" }>,
  template: ReportTemplateV2,
  data: DocumentData,
): LayoutLine[] {
  const sectionData = Object.hasOwn(data.sections, element.sectionId)
    ? data.sections[element.sectionId]
    : undefined;
  if (!sectionData) return [];
  const out: LayoutLine[] = [];
  const hasTitle = (element.title ?? "").trim().length > 0;
  if (hasTitle) out.push(textLine(element.title ?? "", { bold: true }));
  if (sectionData.kind === "kv") {
    for (const row of sectionData.rows) {
      const label = row.label ?? template.labels[row.labelId ?? ""] ?? row.labelId ?? "";
      out.push(textLine(row.value ? `${label}: ${row.value}` : label, { bold: row.bold }));
    }
    if (sectionData.rows.length === 0) {
      if (!sectionData.emptyText) return [];
      out.push(textLine(sectionData.emptyText, { align: "center" }));
    }
  } else if (sectionData.kind === "table") {
    const columns = element.columns ?? [];
    const widths = tableWidths(columns, element.width);
    out.push({
      ...columnCells(
        columns,
        Object.fromEntries(columns.map((column) => [column.key, column.label])),
        true,
      ),
      widths,
    });
    for (const row of sectionData.table ?? []) {
      out.push({ ...columnCells(columns, row), widths });
    }
    if ((sectionData.table ?? []).length === 0) {
      if (!sectionData.emptyText) return [];
      out.length = hasTitle ? 1 : 0;
      out.push(textLine(sectionData.emptyText, { align: "center" }));
    }
  } else {
    const columns = element.columns ?? [];
    const widths = tableWidths(columns, element.width);
    const groups = sectionData.groups ?? [];
    if (groups.length === 0) {
      if (!sectionData.emptyText) return [];
      out.push(textLine(sectionData.emptyText, { align: "center" }));
    } else {
      groups.forEach((group, index) => {
        if (index > 0) out.push({ kind: "separator" });
        out.push(textLine(`— ${group.label} —`, { align: "center", bold: true, size: "large" }));
        for (const row of group.rows) {
          out.push({ ...columnCells(columns, row), widths });
        }
        out.push(textLine(`${template.labels.groupTotal ?? "الإجمالي"}: ${group.total}`));
      });
    }
  }
  return out;
}

function renderSummary(
  element: Extract<TemplateElement, { type: "summary" }>,
  data: DocumentData,
): LayoutLine[] {
  if (!data.summary) return [];
  // An empty label prints the total alone (spec §3.2); but a non-empty label is
  // emitted verbatim, as v1 did (`${label}: ${total}` with no trimming).
  const hasLabel = element.label.trim().length > 0;
  return [
    textLine(hasLabel ? `${element.label}: ${data.summary}` : data.summary, {
      bold: true,
      size: "xlarge",
    }),
  ];
}

function renderQr(
  element: Extract<TemplateElement, { type: "qr" }>,
  template: ReportTemplateV2,
  data: DocumentData,
): LayoutLine[] {
  const payload = receiptQrPayload(data);
  if (!payload) return [];
  const paperPx = 384;
  const regionLeft = Math.round((element.col * paperPx) / template.paper.columns);
  const regionWidth = Math.round((element.width * paperPx) / template.paper.columns);
  const centred =
    regionLeft + Math.max(0, Math.floor((regionWidth - element.sizePx) / 2));
  // A QR wider than its region must still fit the paper: `shiftRaster` drops
  // pixels past the 384-px raster, which would print an unscannable code.
  const offsetPx = Math.max(0, Math.min(centred, paperPx - element.sizePx));
  return [{ kind: "qr", payload, sizePx: element.sizePx, offsetPx, columns: template.paper.columns }];
}

function renderElement(
  element: TemplateElement,
  template: ReportTemplateV2,
  data: DocumentData,
): LayoutLine[] {
  if (!element.visible) return [];
  if (element.type === "text") return renderText(element, data);
  if (element.type === "field") return renderField(element, template, data);
  if (element.type === "logo") {
    if (!data.logoAvailable) return [];
    const fullWidth = element.col === 0 && element.width === template.paper.columns;
    const offsetPx = fullWidth
      ? undefined
      : Math.round((element.col * 384) / template.paper.columns);
    return [{
      kind: "logo",
      align: element.align ?? "center",
      maxWidth: element.maxWidth ?? 256,
      offsetPx,
    }];
  }
  if (element.type === "itemTable") return renderItems(element, data);
  if (element.type === "section") return renderSection(element, template, data);
  if (element.type === "summary") return renderSummary(element, data);
  if (element.type === "qr") return renderQr(element, template, data);
  return [];
}

function composeTextRow(
  elements: TemplateElement[],
  rendered: Map<string, LayoutLine[]>,
  paper: number,
): LayoutLine[] {
  if (elements.length === 1) {
    const element = elements[0]!;
    const lines = rendered.get(element.id) ?? [];
    if (lines.length === 0) return [];
    if (element.col === 0 && element.width === paper) return lines;
    const line = lines[0]!;
    if (line.kind !== "text") return lines;
    const widths: number[] = [];
    const cells: Extract<LayoutLine, { kind: "columns" }>["cells"] = [];
    if (element.col > 0) {
      widths.push(element.col);
      cells.push({ text: "", align: "right", bold: false, size: "normal" });
    }
    widths.push(element.width);
    cells.push({ text: line.text, align: line.align, bold: line.bold, size: line.size });
    if (element.col + element.width < paper) {
      widths.push(paper - element.col - element.width);
      cells.push({ text: "", align: "right", bold: false, size: "normal" });
    }
    return [{ kind: "columns", widths, cells }];
  }

  const widths: number[] = [];
  const cells: Extract<LayoutLine, { kind: "columns" }>["cells"] = [];
  let cursor = 0;
  let hasContent = false;
  for (const element of elements) {
    if (element.col > cursor) {
      widths.push(element.col - cursor);
      cells.push({ text: "", align: "right", bold: false, size: "normal" });
    }
    const line = rendered.get(element.id)?.[0];
    if (line?.kind === "text" && line.text) hasContent = true;
    widths.push(element.width);
    cells.push(
      line?.kind === "text"
        ? { text: line.text, align: line.align, bold: line.bold, size: line.size }
        : { text: "", align: "right", bold: false, size: "normal" },
    );
    cursor = element.col + element.width;
  }
  if (cursor < paper) {
    widths.push(paper - cursor);
    cells.push({ text: "", align: "right", bold: false, size: "normal" });
  }
  return hasContent ? [{ kind: "columns", widths, cells }] : [];
}

export function layoutTemplateV2(
  template: ReportTemplateV2,
  data: DocumentData,
): LayoutLine[] {
  const rendered = new Map<string, LayoutLine[]>();
  for (const element of template.elements) {
    if (element.type === "separator") continue;
    rendered.set(element.id, renderElement(element, template, data));
  }
  for (const element of template.elements) {
    if (element.type !== "separator" || !element.visible) continue;
    const refs = element.hideWhenEmptyOf ?? [];
    const visible =
      refs.length === 0 ||
      refs.some((id) => (rendered.get(id)?.length ?? 0) > 0);
    rendered.set(element.id, visible ? [{ kind: "separator" }] : []);
  }

  const rows = elementsByRow(template.elements);
  const lastRow = maxElementRow(template.elements);
  const out: LayoutLine[] = [];
  for (let row = 0; row <= lastRow; row += 1) {
    const rowElements = rows.get(row) ?? [];
    if (rowElements.length === 0) {
      out.push(BLANK);
      continue;
    }
    const visible = sortElements(rowElements.filter((element) => element.visible));
    if (visible.length === 0) continue;
    const textOnly = visible.every(
      (element) => element.type === "text" || element.type === "field",
    );
    if (textOnly) {
      out.push(...composeTextRow(visible, rendered, template.paper.columns));
      continue;
    }
    const blocks = visible
      .map((element) => rendered.get(element.id) ?? [])
      .filter((lines) => lines.length > 0);
    if (blocks.length === 0) continue;
    out.push(...blocks[0]!);
  }
  return out;
}
