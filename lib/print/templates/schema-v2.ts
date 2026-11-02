import { DOCUMENT_SPECS } from "./document-specs";
import type { DocumentSpec } from "./document-specs";
import {
  DEFAULT_LOGO_WIDTH,
  DEFAULT_QR_SIZE,
  ELEMENT_ID_PATTERN,
  MAX_ELEMENTS,
  MAX_LOGO_WIDTH,
  MAX_QR_SIZE,
  MAX_ROWS,
  MAX_SEPARATOR_REFS,
  MIN_LOGO_WIDTH,
  MIN_QR_SIZE,
  isElementType,
} from "./elements";
import {
  checkKeys,
  checkPlaceholders,
  isPlainObject,
  readAlign,
  readBool,
  readColumns,
  readSize,
  readString,
} from "./schema-common";
import { isReportDocument } from "./types";
import type {
  ReportDocument,
  ReportTemplateV2,
  TemplateElement,
} from "./types";

export type ValidationResultV2 =
  | { ok: true; template: ReportTemplateV2 }
  | { ok: false; errors: string[] };

const MAX_TITLE = 200;
const MAX_LABEL = 200;

type Context = {
  errors: string[];
  spec: DocumentSpec;
  paper: number;
};

function elementKeys(type: string): string[] {
  const common = ["id", "type", "row", "col", "width", "visible"];
  if (type === "text") return [...common, "text", "align", "bold", "size", "hideWhenEmpty"];
  if (type === "field") return [...common, "fieldId", "align", "bold", "size", "hideWhenEmpty"];
  if (type === "logo") return [...common, "align", "maxWidth"];
  if (type === "qr") return [...common, "sizePx"];
  if (type === "separator") return [...common, "hideWhenEmptyOf"];
  if (type === "itemTable") return [...common, "title", "showHeader", "showNotes", "columns"];
  if (type === "section") return [...common, "sectionId", "title", "columns"];
  return [...common, "label"];
}

function readInt(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  min: number,
  max: number,
): number {
  const raw = value[key];
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max) {
    errors.push(`${path}.${key} غير صالح`);
    return min;
  }
  return raw;
}

function readElement(
  entry: unknown,
  index: number,
  ctx: Context,
): TemplateElement | null {
  const errors = ctx.errors;
  const at = `elements[${index}]`;
  if (!isPlainObject(entry)) {
    errors.push(`${at} غير صالح`);
    return null;
  }
  const type = entry.type;
  if (!isElementType(type)) {
    errors.push(`${at}.type غير معروف`);
    return null;
  }
  checkKeys(entry, elementKeys(type), at, errors);
  const id = readString(entry, "id", `${at}.id`, errors);
  if (id && !ELEMENT_ID_PATTERN.test(id)) errors.push(`${at}.id غير صالح`);
  const row = readInt(entry, "row", at, errors, 0, MAX_ROWS - 1);
  const col = readInt(entry, "col", at, errors, 0, ctx.paper - 1);
  const width = readInt(entry, "width", at, errors, 1, ctx.paper);
  if (col + width > ctx.paper) errors.push(`${at}: col + width يتجاوز العرض`);
  const visible = entry.visible === undefined
    ? true
    : readBool(entry, "visible", `${at}.visible`, errors, true);
  const base = { id, row, col, width, visible };

  if (type === "text") {
    const text = readString(entry, "text", `${at}.text`, errors, { required: false });
    checkPlaceholders(text, ctx.spec, `${at}.text`, errors, { fieldTokens: true });
    const element: TemplateElement = { ...base, type, text };
    const align = readAlign(entry, "align", `${at}.align`, errors);
    const size = readSize(entry, "size", `${at}.size`, errors);
    if (align) element.align = align;
    if (size) element.size = size;
    if (entry.bold !== undefined) element.bold = readBool(entry, "bold", `${at}.bold`, errors, false);
    if (entry.hideWhenEmpty !== undefined) element.hideWhenEmpty = readBool(entry, "hideWhenEmpty", `${at}.hideWhenEmpty`, errors, true);
    return element;
  }

  if (type === "field") {
    const fieldId = readString(entry, "fieldId", `${at}.fieldId`, errors);
    if (fieldId && !ctx.spec.fields.includes(fieldId)) errors.push(`${at}.fieldId غير معروف`);
    const element: TemplateElement = { ...base, type, fieldId };
    const align = readAlign(entry, "align", `${at}.align`, errors);
    const size = readSize(entry, "size", `${at}.size`, errors);
    if (align) element.align = align;
    if (size) element.size = size;
    if (entry.bold !== undefined) element.bold = readBool(entry, "bold", `${at}.bold`, errors, false);
    if (entry.hideWhenEmpty !== undefined) element.hideWhenEmpty = readBool(entry, "hideWhenEmpty", `${at}.hideWhenEmpty`, errors, true);
    return element;
  }

  if (type === "logo") {
    const element: TemplateElement = { ...base, type };
    const align = readAlign(entry, "align", `${at}.align`, errors);
    if (align) element.align = align;
    if (entry.maxWidth !== undefined) {
      const maxWidth = readInt(entry, "maxWidth", at, errors, MIN_LOGO_WIDTH, MAX_LOGO_WIDTH);
      element.maxWidth = maxWidth;
    } else {
      element.maxWidth = DEFAULT_LOGO_WIDTH;
    }
    return element;
  }

  if (type === "qr") {
    if (!ctx.spec.qr) errors.push(`${at}: QR غير مسموح لهذا التقرير`);
    const element: TemplateElement = { ...base, type, sizePx: DEFAULT_QR_SIZE };
    if (entry.sizePx !== undefined) {
      element.sizePx = readInt(entry, "sizePx", at, errors, MIN_QR_SIZE, MAX_QR_SIZE);
    }
    return element;
  }

  if (type === "separator") {
    if (col !== 0 || width !== ctx.paper) errors.push(`${at}: separator يجب أن يمتد على كامل العرض`);
    const element: TemplateElement = { ...base, type };
    if (entry.hideWhenEmptyOf !== undefined) {
      if (!Array.isArray(entry.hideWhenEmptyOf)) {
        errors.push(`${at}.hideWhenEmptyOf يجب أن يكون قائمة`);
      } else {
        if (entry.hideWhenEmptyOf.length > MAX_SEPARATOR_REFS) errors.push(`${at}.hideWhenEmptyOf يتجاوز ${MAX_SEPARATOR_REFS}`);
        element.hideWhenEmptyOf = entry.hideWhenEmptyOf.filter((ref): ref is string => {
          if (typeof ref !== "string") {
            errors.push(`${at}.hideWhenEmptyOf يحتوي قيمة غير صالحة`);
            return false;
          }
          return true;
        });
      }
    }
    return element;
  }

  if (type === "itemTable") {
    if (ctx.spec.itemColumns.length === 0) errors.push(`${at}: جدول الأصناف غير مسموح لهذا التقرير`);
    const title = readString(entry, "title", `${at}.title`, errors, { required: false, max: MAX_TITLE });
    const showHeader = entry.showHeader === undefined ? true : readBool(entry, "showHeader", `${at}.showHeader`, errors, true);
    const showNotes = entry.showNotes === undefined ? true : readBool(entry, "showNotes", `${at}.showNotes`, errors, true);
    const columns = readColumns(entry.columns, `${at}.columns`, ctx.spec.itemColumns, errors);
    if (columns.length === 0) errors.push(`${at}.columns مطلوب`);
    return { ...base, type, title, showHeader, showNotes, columns };
  }

  if (type === "section") {
    const sectionId = readString(entry, "sectionId", `${at}.sectionId`, errors);
    const sectionSpec = Object.hasOwn(ctx.spec.sections, sectionId) ? ctx.spec.sections[sectionId] : undefined;
    if (!sectionSpec) errors.push(`${at}.sectionId غير معروف لهذا التقرير`);
    const title = readString(entry, "title", `${at}.title`, errors, { required: false, max: MAX_TITLE });
    const element: TemplateElement = { ...base, type, sectionId, title };
    if (sectionSpec?.kind === "kv") {
      if (entry.columns !== undefined) errors.push(`${at}.columns غير مسموح لقسم نصي`);
    } else if (sectionSpec) {
      const columns = readColumns(entry.columns, `${at}.columns`, sectionSpec.columnKeys, errors);
      if (columns.length === 0) errors.push(`${at}.columns مطلوب`);
      element.columns = columns;
    }
    return element;
  }

  const label = readString(entry, "label", `${at}.label`, errors, { required: false, max: MAX_LABEL });
  if (!ctx.spec.summaryAllowed) errors.push(`${at}: summary غير مسموح لهذا التقرير`);
  return { ...base, type: "summary", label };
}

function validateLayout(elements: TemplateElement[], ctx: Context) {
  const rows = new Map<number, TemplateElement[]>();
  for (const element of elements) {
    const list = rows.get(element.row) ?? [];
    list.push(element);
    rows.set(element.row, list);
  }
  for (const [row, list] of rows) {
    const sorted = [...list].sort((a, b) => a.col - b.col);
    let end = 0;
    for (const element of sorted) {
      if (element.col < end) {
        ctx.errors.push(`elements: تداخل في الصف ${row}`);
        break;
      }
      end = element.col + element.width;
    }
    if (
      sorted.length > 1 &&
      sorted.some((element) => element.type !== "text" && element.type !== "field")
    ) {
      ctx.errors.push(`elements: عناصر البيانات والفاصل والصور يجب أن تكون وحدها في الصف ${row}`);
    }
  }

  const count = (type: string) => elements.filter((element) => element.type === type).length;
  for (const type of ["logo", "qr", "itemTable", "summary"] as const) {
    if (count(type) > 1) ctx.errors.push(`elements: ${type} مكرر`);
  }
  const seen = new Set<string>();
  elements.forEach((element, index) => {
    if (element.type === "section") {
      if (seen.has(`section:${element.sectionId}`)) ctx.errors.push(`elements: القسم ${element.sectionId} مكرر`);
      seen.add(`section:${element.sectionId}`);
    }
    if (element.type === "field") {
      if (seen.has(`field:${element.fieldId}`)) ctx.errors.push(`elements: الحقل ${element.fieldId} مكرر`);
      seen.add(`field:${element.fieldId}`);
    }
    if (element.type === "separator" && element.hideWhenEmptyOf) {
      const refs = new Set<string>();
      for (const ref of element.hideWhenEmptyOf) {
        if (refs.has(ref)) ctx.errors.push(`elements[${index}].hideWhenEmptyOf مكرر`);
        refs.add(ref);
        const target = elements.find((candidate) => candidate.id === ref);
        if (!target) ctx.errors.push(`elements[${index}].hideWhenEmptyOf: ${ref} غير معروف`);
        else if (target.type === "separator") ctx.errors.push(`elements[${index}].hideWhenEmptyOf يشير إلى فاصل`);
      }
    }
  });
}

function validateLabels(
  labels: unknown,
  elements: TemplateElement[],
  ctx: Context,
): Record<string, string> {
  const errors = ctx.errors;
  if (!isPlainObject(labels)) {
    errors.push("labels يجب أن يكون كائناً");
    return {};
  }
  const allowed = new Set<string>([
    ...ctx.spec.fields,
    ...Object.values(ctx.spec.sections).flatMap((section) => section.rowIds),
  ]);
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(labels)) {
    if (!allowed.has(key)) {
      errors.push(`labels.${key} غير معروف`);
      continue;
    }
    if (typeof raw !== "string") {
      errors.push(`labels.${key} يجب أن يكون نصاً`);
      continue;
    }
    const text = raw.trim();
    if (text.length > MAX_LABEL) errors.push(`labels.${key} أطول من ${MAX_LABEL} حرفاً`);
    out[key] = text;
  }
  for (const element of elements) {
    if (element.type === "field" && !out[element.fieldId]) {
      errors.push(`labels.${element.fieldId} مطلوب`);
    }
    if (element.type === "section" && element.visible) {
      const sectionSpec = ctx.spec.sections[element.sectionId];
      if (sectionSpec?.kind === "kv" || sectionSpec?.kind === "groupedTable") {
        for (const rowId of sectionSpec.rowIds) {
          if (!out[rowId]) errors.push(`labels.${rowId} مطلوب`);
        }
      }
    }
  }
  return out;
}

export function validateReportTemplateV2(
  value: unknown,
  expectedDoc?: ReportDocument,
): ValidationResultV2 {
  const errors: string[] = [];
  if (!isPlainObject(value)) return { ok: false, errors: ["ملف التصميم يجب أن يكون كائناً JSON"] };
  checkKeys(value, ["format", "version", "document", "paper", "elements", "labels"], "root", errors);
  if (value.format !== "fastpos-report") errors.push("format غير صالح");
  if (value.version !== 2) errors.push("version غير مدعوم");
  if (!isReportDocument(value.document)) {
    return { ok: false, errors: [...errors, "document غير معروف"] };
  }
  const doc = value.document;
  if (expectedDoc && doc !== expectedDoc) errors.push(`document يجب أن يكون ${expectedDoc}`);
  if (!isPlainObject(value.paper)) {
    return { ok: false, errors: [...errors, "paper مطلوب"] };
  }
  checkKeys(value.paper, ["columns"], "paper", errors);
  const paper = value.paper.columns;
  if (paper !== 32 && paper !== 48) errors.push("paper.columns يجب أن يكون 32 أو 48");
  if (!Array.isArray(value.elements)) errors.push("elements يجب أن يكون قائمة");
  const elements: TemplateElement[] = [];
  if (Array.isArray(value.elements)) {
    if (value.elements.length > MAX_ELEMENTS) errors.push(`elements يتجاوز ${MAX_ELEMENTS} عنصراً`);
    const ctx: Context = { errors, spec: DOCUMENT_SPECS[doc], paper: paper === 48 ? 48 : 32 };
    value.elements.slice(0, MAX_ELEMENTS).forEach((entry, index) => {
      const element = readElement(entry, index, ctx);
      if (element) elements.push(element);
    });
  }
  if (paper === 32 || paper === 48) {
    validateLayout(elements, { errors, spec: DOCUMENT_SPECS[doc], paper });
  }
  const ids = new Set<string>();
  for (const element of elements) {
    if (ids.has(element.id)) errors.push(`elements: id مكرر (${element.id})`);
    ids.add(element.id);
  }
  const labels = validateLabels(value.labels, elements, {
    errors,
    spec: DOCUMENT_SPECS[doc],
    paper: paper === 48 ? 48 : 32,
  });
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    template: {
      format: "fastpos-report",
      version: 2,
      document: doc,
      paper: { columns: paper as 32 | 48 },
      elements,
      labels,
    },
  };
}
