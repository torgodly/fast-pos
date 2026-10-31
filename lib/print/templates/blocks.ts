import { charWidths } from "./columns";
import type { DocumentData, ReportTemplate, TemplateColumn } from "./types";

export type BlockId =
  | "header"
  | "fields"
  | "items"
  | `section:${string}`
  | "summary"
  | "footer";

export type TemplateCommit = (
  next: ReportTemplate,
  options?: { coalesceKey?: string },
) => void;

export const MAX_LINES = 6;

export function canonicalBlockIds(sectionIds: readonly string[]): BlockId[] {
  return [
    "header",
    "fields",
    "items",
    ...sectionIds.map((id): BlockId => `section:${id}`),
    "summary",
    "footer",
  ];
}

export function orderedBlockIds(template: ReportTemplate): BlockId[] {
  const canonical = canonicalBlockIds(
    template.sections.map((section) => section.id),
  );
  if (!template.order) return canonical;
  const known = new Set<string>(canonical);
  const seen = new Set<string>();
  const ordered: BlockId[] = [];
  for (const id of template.order) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id as BlockId);
  }
  for (const id of canonical) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

export function blockLabel(template: ReportTemplate, id: BlockId): string {
  if (id === "header") return "الترويسة";
  if (id === "fields") return "البيانات";
  if (id === "items") return "الأصناف";
  if (id === "summary") return "الإجمالي";
  if (id === "footer") return "التذييل";
  const section = template.sections.find(
    (entry) => `section:${entry.id}` === id,
  );
  return section?.title.trim() || "قسم";
}

export function blockVisible(template: ReportTemplate, id: BlockId): boolean {
  if (id === "header") return template.header.show !== false;
  if (id === "fields") return template.fields.visible !== false;
  if (id === "items") return template.items.show;
  if (id === "summary") return template.summary.show;
  if (id === "footer") return template.footer.show !== false;
  const section = template.sections.find(
    (entry) => `section:${entry.id}` === id,
  );
  return section?.show ?? false;
}

export function moveBlock(
  template: ReportTemplate,
  id: BlockId,
  toIndex: number,
): ReportTemplate {
  const order = orderedBlockIds(template);
  if (!order.includes(id)) return template;
  const rest = order.filter((entry) => entry !== id);
  const index = Math.max(0, Math.min(Math.trunc(toIndex), rest.length));
  rest.splice(index, 0, id);
  return { ...template, order: rest };
}

export function setBlockVisible(
  template: ReportTemplate,
  id: BlockId,
  visible: boolean,
): ReportTemplate {
  if (id === "header") {
    return { ...template, header: { ...template.header, show: visible } };
  }
  if (id === "fields") {
    return { ...template, fields: { ...template.fields, visible } };
  }
  if (id === "items") {
    return { ...template, items: { ...template.items, show: visible } };
  }
  if (id === "summary") {
    return { ...template, summary: { ...template.summary, show: visible } };
  }
  if (id === "footer") {
    return { ...template, footer: { ...template.footer, show: visible } };
  }
  return {
    ...template,
    sections: template.sections.map((section) =>
      `section:${section.id}` === id ? { ...section, show: visible } : section,
    ),
  };
}

export function addHeaderLine(template: ReportTemplate): ReportTemplate {
  if (template.header.lines.length >= MAX_LINES) return template;
  return {
    ...template,
    header: {
      ...template.header,
      lines: [...template.header.lines, { text: "" }],
    },
  };
}

export function addFooterLine(template: ReportTemplate): ReportTemplate {
  if (template.footer.lines.length >= MAX_LINES) return template;
  return {
    ...template,
    footer: {
      ...template.footer,
      lines: [...template.footer.lines, { text: "" }],
    },
  };
}

/**
 * `tableWidths` reserves each column's label width and shares the remaining
 * paper width by the `width` extras, treating a zero extra as weight 1. A zero
 * extra is therefore not representable: the effective minimum is
 * `label.length + 1`. This helper clamps and normalizes the requested widths so
 * the stored extras are each at least one character and sum to the paper
 * capacity, which makes `tableWidths` reproduce them exactly. When the paper
 * cannot hold one extra per column, the helper stores label-only widths as a
 * reproducible fallback instead.
 */
export function resizeColumns(
  columns: TemplateColumn[],
  targetCharWidths: number[],
  paper: number,
): TemplateColumn[] {
  if (columns.length === 0) return columns;
  const minimums = columns.map((column) => column.label.length);
  const minimumTotal = minimums.reduce((sum, value) => sum + value, 0);
  if (minimumTotal >= paper) {
    const fallback = charWidths(minimums, paper);
    return columns.map((column, index) => ({
      ...column,
      width: Math.max(1, Math.min(64, fallback[index] ?? minimums[index]!)),
    }));
  }
  const capacity = paper - minimumTotal;
  const remaining = capacity - columns.length;
  if (minimumTotal + columns.length >= paper) {
    return columns.map((column) => ({
      ...column,
      width: Math.max(1, Math.min(64, column.label.length)),
    }));
  }
  const requested = columns.map((column, index) => {
    const target = targetCharWidths[index];
    const value = Number.isFinite(target) ? Math.round(target!) : column.width;
    return Math.max(0, value - (minimums[index]! + 1));
  });
  const requestedTotal = requested.reduce((sum, value) => sum + value, 0);
  const shares =
    requestedTotal === remaining
      ? requested
      : requestedTotal === 0
        ? charWidths(new Array<number>(columns.length).fill(1), remaining)
        : allocateShares(requested, remaining);
  return columns.map((column, index) => ({
    ...column,
    width: Math.max(
      1,
      Math.min(64, minimums[index]! + 1 + (shares[index] ?? 0)),
    ),
  }));
}

/**
 * Largest-remainder split of `total` over the positive weights only. A zero
 * weight never receives a share, because `tableWidths` would re-treat it as 1
 * and render a width the stored extras do not describe.
 */
function allocateShares(weights: number[], total: number): number[] {
  const shares = weights.map(() => 0);
  const sum = weights.reduce((accumulator, weight) => accumulator + weight, 0);
  if (sum <= 0 || total <= 0) return shares;
  const exact = weights.map((weight) => (weight / sum) * total);
  exact.forEach((value, index) => {
    shares[index] = Math.floor(value);
  });
  let remainder =
    total - shares.reduce((accumulator, value) => accumulator + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .filter((entry) => weights[entry.index]! > 0)
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    shares[order[cursor % order.length]!.index] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return shares;
}

export function blankSample(sample: DocumentData): DocumentData {
  return {
    ...sample,
    status: "",
    fields: Object.fromEntries(
      Object.keys(sample.fields).map((key) => [key, null]),
    ),
    items: [],
    itemNotes: [],
    sections: {},
    summary: null,
  };
}
