import type {
  ElementType,
  LogoElement,
  ReportTemplateV2,
  TemplateElement,
} from "./types";
import { ELEMENT_TYPES } from "./types";

export const MAX_ELEMENTS = 64;
export const MAX_ROWS = 60;
export const MAX_TABLE_COLUMNS = 6;
export const MAX_ELEMENT_TEXT = 200;
export const MIN_LOGO_WIDTH = 64;
export const MAX_LOGO_WIDTH = 384;
export const DEFAULT_LOGO_WIDTH = 256;
export const MIN_QR_SIZE = 96;
export const MAX_QR_SIZE = 384;
export const DEFAULT_QR_SIZE = 192;
export const DEFAULT_QR_WIDTH = 8;
export const MAX_SEPARATOR_REFS = 12;
export const ELEMENT_ID_PATTERN = /^el_[a-z0-9_]{1,40}$/;

export function isElementType(value: unknown): value is ElementType {
  return typeof value === "string" && (ELEMENT_TYPES as readonly string[]).includes(value);
}

export function newElementId(): string {
  return `el_${Math.random().toString(36).slice(2, 10)}`;
}

export function slugElementId(kind: string, value: string): string {
  return `el_${kind}_${value.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

export function sortElements(elements: TemplateElement[]): TemplateElement[] {
  return [...elements].sort(
    (a, b) => a.row - b.row || a.col - b.col || a.id.localeCompare(b.id),
  );
}

export function elementsByRow(
  elements: TemplateElement[],
): Map<number, TemplateElement[]> {
  const rows = new Map<number, TemplateElement[]>();
  for (const element of sortElements(elements)) {
    const list = rows.get(element.row);
    if (list) list.push(element);
    else rows.set(element.row, [element]);
  }
  return rows;
}

export function maxElementRow(elements: TemplateElement[]): number {
  return elements.reduce((max, element) => Math.max(max, element.row), -1);
}

export function logoElement(template: ReportTemplateV2): LogoElement | null {
  return (
    template.elements.find(
      (element): element is LogoElement => element.type === "logo",
    ) ?? null
  );
}
