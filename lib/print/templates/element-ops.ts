import { DOCUMENT_SPECS } from "./document-specs";
import {
  MAX_ELEMENTS,
  MAX_ROWS,
  MAX_SEPARATOR_REFS,
  newElementId,
} from "./elements";
import { validateReportTemplateV2 } from "./schema-v2";
import type {
  DocumentData,
  ElementType,
  ReportTemplateV2,
  TemplateElement,
} from "./types";

export type TemplateCommit = (
  next: ReportTemplateV2,
  options?: { coalesceKey?: string },
) => void;

export type ElementPatch = {
  [T in ElementType]: Partial<
    Omit<Extract<TemplateElement, { type: T }>, "type">
  >;
}[ElementType];

export function isBlockType(type: ElementType): boolean {
  return type !== "text" && type !== "field";
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

function commit(
  template: ReportTemplateV2,
  elements: TemplateElement[],
): ReportTemplateV2 | null {
  const next = { ...template, elements };
  return validateReportTemplateV2(next, template.document).ok ? next : null;
}

export function canPlace(
  template: ReportTemplateV2,
  candidate: Pick<TemplateElement, "id" | "type" | "row" | "col" | "width">,
): boolean {
  if (candidate.row < 0 || candidate.row >= MAX_ROWS) return false;
  if (
    candidate.col < 0 ||
    candidate.width < 1 ||
    candidate.col + candidate.width > template.paper.columns
  ) {
    return false;
  }
  const sameRow = template.elements.filter(
    (element) => element.id !== candidate.id && element.row === candidate.row,
  );
  if (
    sameRow.length > 0 &&
    (isBlockType(candidate.type) ||
      sameRow.some((element) => isBlockType(element.type)))
  ) {
    return false;
  }
  const end = candidate.col + candidate.width;
  return sameRow.every(
    (element) => element.col + element.width <= candidate.col || element.col >= end,
  );
}

export function findFreeSlot(
  template: ReportTemplateV2,
  width: number,
  options: { block?: boolean; rowStart?: number; ignoreId?: string } = {},
): { row: number; col: number } | null {
  const paper = template.paper.columns;
  const block = options.block ?? false;
  if (width < 1 || width > paper) return null;
  for (let row = options.rowStart ?? 0; row < MAX_ROWS; row += 1) {
    const occupied = template.elements
      .filter(
        (element) => element.row === row && element.id !== options.ignoreId,
      )
      .sort((a, b) => a.col - b.col);
    if (block) {
      if (occupied.length === 0) return { row, col: 0 };
      continue;
    }
    if (occupied.some((element) => isBlockType(element.type))) continue;
    let col = 0;
    for (const element of occupied) {
      if (col + width <= element.col) return { row, col };
      col = Math.max(col, element.col + element.width);
    }
    if (col + width <= paper) return { row, col };
  }
  return null;
}

export function createElement(
  template: ReportTemplateV2,
  draft: TemplateElement,
  options: { labelDefaults?: Record<string, string> } = {},
): ReportTemplateV2 | null {
  if (template.elements.length >= MAX_ELEMENTS) return null;
  const block = isBlockType(draft.type);
  const slot = findFreeSlot(template, draft.width, { block });
  if (!slot) return null;

  let labels = template.labels;
  const defaults = options.labelDefaults;
  if (defaults && (draft.type === "field" || draft.type === "section")) {
    const ids =
      draft.type === "field"
        ? [draft.fieldId]
        : (DOCUMENT_SPECS[template.document].sections[draft.sectionId]?.rowIds ?? []);
    for (const id of ids) {
      if (!labels[id] && defaults[id]) {
        labels = { ...labels, [id]: defaults[id] };
      }
    }
  }

  const col = block
    ? Math.max(0, Math.min(draft.col, template.paper.columns - draft.width))
    : slot.col;
  return commit({ ...template, labels }, [
    ...template.elements,
    { ...draft, row: slot.row, col } as TemplateElement,
  ]);
}

export function updateElement(
  template: ReportTemplateV2,
  id: string,
  patch: ElementPatch,
): ReportTemplateV2 {
  const target = template.elements.find((element) => element.id === id);
  if (!target) return template;
  const merged = {
    ...target,
    ...patch,
    id: target.id,
    type: target.type,
  } as TemplateElement;
  if (!canPlace(template, merged)) return template;
  return (
    commit(
      template,
      template.elements.map((element) => (element.id === id ? merged : element)),
    ) ?? template
  );
}

export function removeElement(
  template: ReportTemplateV2,
  id: string,
): ReportTemplateV2 {
  if (!template.elements.some((element) => element.id === id)) return template;
  const elements = template.elements
    .filter((element) => element.id !== id)
    .map((element) => {
      if (element.type !== "separator" || !element.hideWhenEmptyOf?.includes(id)) {
        return element;
      }
      const refs = element.hideWhenEmptyOf.filter((ref) => ref !== id);
      return {
        ...element,
        hideWhenEmptyOf: refs.length > 0 ? refs : undefined,
      };
    });
  return commit(template, elements) ?? template;
}

export function moveElement(
  template: ReportTemplateV2,
  id: string,
  row: number,
  col: number,
): ReportTemplateV2 {
  const target = template.elements.find((element) => element.id === id);
  if (!target) return template;
  return updateElement(template, id, { row, col });
}

export function nudgeElement(
  template: ReportTemplateV2,
  id: string,
  dRow: number,
  dCol: number,
): ReportTemplateV2 {
  const target = template.elements.find((element) => element.id === id);
  if (!target) return template;
  return moveElement(template, id, target.row + dRow, target.col + dCol);
}

export function setElementVisible(
  template: ReportTemplateV2,
  id: string,
  visible: boolean,
): ReportTemplateV2 {
  return updateElement(template, id, { visible });
}

export function updateLabel(
  template: ReportTemplateV2,
  fieldId: string,
  label: string,
): ReportTemplateV2 {
  const text = label.trim();
  if (!text || template.labels[fieldId] === text) return template;
  return (
    commit({ ...template, labels: { ...template.labels, [fieldId]: text } }, template.elements) ??
    template
  );
}

export function changeField(
  template: ReportTemplateV2,
  id: string,
  fieldId: string,
  labelDefaults: Record<string, string> = {},
): ReportTemplateV2 {
  const target = template.elements.find((element) => element.id === id);
  if (!target || target.type !== "field" || target.fieldId === fieldId) {
    return template;
  }
  let labels = template.labels;
  if (!labels[fieldId] && labelDefaults[fieldId]) {
    labels = { ...labels, [fieldId]: labelDefaults[fieldId] };
  }
  const candidate = labels === template.labels ? template : { ...template, labels };
  const next = updateElement(candidate, id, { fieldId });
  return next === candidate ? template : next;
}

export function setSeparatorRefs(
  template: ReportTemplateV2,
  id: string,
  refs: string[],
): ReportTemplateV2 {
  const target = template.elements.find((element) => element.id === id);
  if (!target || target.type !== "separator") return template;
  const allowed = [...new Set(refs)]
    .filter(
      (ref) =>
        ref !== id &&
        template.elements.some(
          (element) => element.id === ref && element.type !== "separator",
        ),
    )
    .slice(0, MAX_SEPARATOR_REFS);
  return updateElement(template, id, {
    hideWhenEmptyOf: allowed.length > 0 ? allowed : undefined,
  });
}

export function duplicateElement(
  template: ReportTemplateV2,
  id: string,
): ReportTemplateV2 | null {
  const source = template.elements.find((element) => element.id === id);
  if (!source || (source.type !== "text" && source.type !== "separator")) {
    return null;
  }
  if (template.elements.length >= MAX_ELEMENTS) return null;
  const draft = {
    ...(JSON.parse(JSON.stringify(source)) as TemplateElement),
    id: newElementId(),
  } as TemplateElement;
  const block = draft.type === "separator";
  const slot = findFreeSlot(template, draft.width, {
    block,
    rowStart: source.row,
  });
  if (!slot) return null;
  return commit(template, [
    ...template.elements,
    { ...draft, row: slot.row, col: block ? 0 : slot.col } as TemplateElement,
  ]);
}

export function canAddUnique(
  template: ReportTemplateV2,
  type: "logo" | "qr" | "itemTable" | "summary",
): boolean {
  const spec = DOCUMENT_SPECS[template.document];
  if (template.elements.length >= MAX_ELEMENTS) return false;
  if (type === "qr" && !spec.qr) return false;
  if (type === "itemTable" && spec.itemColumns.length === 0) return false;
  if (type === "summary" && !spec.summaryAllowed) return false;
  return !template.elements.some((element) => element.type === type);
}

export function unusedFieldIds(template: ReportTemplateV2): string[] {
  const used = new Set(
    template.elements.flatMap((element) =>
      element.type === "field" ? [element.fieldId] : [],
    ),
  );
  return DOCUMENT_SPECS[template.document].fields.filter((id) => !used.has(id));
}

export function unusedSectionIds(template: ReportTemplateV2): string[] {
  const used = new Set(
    template.elements.flatMap((element) =>
      element.type === "section" ? [element.sectionId] : [],
    ),
  );
  return Object.keys(DOCUMENT_SPECS[template.document].sections).filter(
    (id) => !used.has(id),
  );
}
