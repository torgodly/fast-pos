import type { DocumentSpec } from "./document-specs";
import type {
  Align,
  ReportTemplateV1,
  TemplateColumn,
  TextSize,
} from "./types";

export const MAX_TEXT = 200;
export const MAX_COLUMNS = 6;
export const ALIGNS: readonly Align[] = ["right", "center", "left"];
export const SIZES: readonly TextSize[] = ["small", "normal", "large", "xlarge"];
export const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function clean(value: string): string {
  return value.replace(CONTROL_CHARS, "").trim();
}

export function checkKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${path}.${key} غير معروف`);
  }
}

export function readString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  options: { required?: boolean; max?: number } = {},
): string {
  const required = options.required ?? true;
  const max = options.max ?? MAX_TEXT;
  const raw = value[key];
  if (raw === undefined || raw === null) {
    if (required) errors.push(`${path} مطلوب`);
    return "";
  }
  if (typeof raw !== "string") {
    errors.push(`${path} يجب أن يكون نصاً`);
    return "";
  }
  const text = clean(raw);
  if (required && !text) errors.push(`${path} مطلوب`);
  if (text.length > max) errors.push(`${path} أطول من ${max} حرفاً`);
  return text;
}

export function readBool(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  fallback: boolean,
): boolean {
  const raw = value[key];
  if (raw === undefined) return fallback;
  if (typeof raw !== "boolean") {
    errors.push(`${path} يجب أن يكون true أو false`);
    return fallback;
  }
  return raw;
}

export function readAlign(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): Align | undefined {
  const raw = value[key];
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !ALIGNS.includes(raw as Align)) {
    errors.push(`${path} غير صالح`);
    return undefined;
  }
  return raw as Align;
}

export function readSize(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): TextSize | undefined {
  const raw = value[key];
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !SIZES.includes(raw as TextSize)) {
    errors.push(`${path} غير صالح`);
    return undefined;
  }
  return raw as TextSize;
}

export function checkPlaceholders(
  text: string,
  spec: DocumentSpec,
  path: string,
  errors: string[],
  options: { fieldTokens?: boolean } = {},
) {
  for (const match of text.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)) {
    const token = match[1]!;
    if (token.startsWith("field.")) {
      const fieldId = token.slice("field.".length);
      if (!options.fieldTokens) {
        errors.push(`${path}: {{${token}}} غير مدعوم في هذا التقرير`);
      } else if (!spec.fields.includes(fieldId)) {
        errors.push(`${path}: {{${token}}} غير معروف في هذا التقرير`);
      }
      continue;
    }
    if (!spec.placeholders.includes(token)) {
      errors.push(`${path}: {{${token}}} غير مدعوم في هذا التقرير`);
    }
  }
  const leftovers = text.replace(/\{\{\s*[^}\s]+\s*\}\}/g, "");
  if (/[{}]/.test(leftovers)) errors.push(`${path}: أقواس غير صالحة`);
}

function readWidth(
  value: Record<string, unknown>,
  path: string,
  errors: string[],
): number {
  const raw = value.width;
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > 64
  ) {
    errors.push(`${path}.width غير صالح`);
    return 1;
  }
  return raw;
}

export function readColumns(
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
  errors: string[],
): TemplateColumn[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} مطلوب`);
    return [];
  }
  if (value.length > MAX_COLUMNS) {
    errors.push(`${path} يتجاوز ${MAX_COLUMNS} أعمدة`);
  }
  const seen = new Set<string>();
  return value.slice(0, MAX_COLUMNS).map((entry, index) => {
    const at = `${path}[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${at} غير صالح`);
      return { key: "", label: "", width: 1 };
    }
    checkKeys(entry, ["key", "label", "width", "align", "bold", "size"], at, errors);
    const key = readString(entry, "key", `${at}.key`, errors);
    if (key && !allowedKeys.includes(key)) {
      errors.push(`${at}.key غير معروف`);
    }
    if (key && seen.has(key)) errors.push(`${at}.key مكرر`);
    seen.add(key);
    const label = readString(entry, "label", `${at}.label`, errors);
    const width = readWidth(entry, at, errors);
    const column: TemplateColumn = { key, label, width };
    const align = readAlign(entry, "align", `${at}.align`, errors);
    if (align) column.align = align;
    if (entry.bold !== undefined) {
      column.bold = readBool(entry, "bold", `${at}.bold`, errors, false);
    }
    const size = readSize(entry, "size", `${at}.size`, errors);
    if (size) column.size = size;
    return column;
  });
}

// The v1 block vocabulary. It lives here (rather than in the deleted
// `blocks.ts`) because both the v1 validator and the v1 layout read it, and
// `schema-v2` does not need it. `ReportTemplateV1` is a type-only import, so
// there is no runtime cycle.
export type BlockId =
  | "header"
  | "fields"
  | "items"
  | `section:${string}`
  | "summary"
  | "footer";

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

export function orderedBlockIds(template: ReportTemplateV1): BlockId[] {
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
