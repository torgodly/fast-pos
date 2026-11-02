import { DOCUMENT_SPECS } from "./document-specs";
import type { DocumentSpec } from "./document-specs";
import { migrateReportTemplate } from "./migrate";
import {
  canonicalBlockIds,
  checkKeys,
  checkPlaceholders,
  clean,
  isPlainObject,
  MAX_TEXT,
  readAlign,
  readBool,
  readColumns,
  readSize,
  readString,
} from "./schema-common";
import {
  validateReportTemplateV2,
  type ValidationResultV2,
} from "./schema-v2";
import {
  isReportDocument,
  type ReportDocument,
  type ReportTemplateV1,
  type ReportTemplateV1 as ReportTemplate,
  type TemplateColumn,
  type TemplateLine,
} from "./types";

export { DOCUMENT_SPECS } from "./document-specs";
export type { DocumentSpec } from "./document-specs";

export type ValidationResultV1 =
  | { ok: true; template: ReportTemplateV1 }
  | { ok: false; errors: string[] };

const MAX_JSON_BYTES = 100 * 1024;
const MAX_LINES = 6;
const MAX_TOTAL_LINES = 40;

function readLines(
  value: unknown,
  path: string,
  spec: DocumentSpec,
  errors: string[],
): TemplateLine[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(`${path} يجب أن يكون قائمة`);
    return [];
  }
  if (value.length > MAX_LINES) errors.push(`${path} يتجاوز ${MAX_LINES} أسطر`);
  return value.slice(0, MAX_LINES).map((entry, index) => {
    const at = `${path}[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${at} غير صالح`);
      return { text: "" };
    }
    checkKeys(entry, ["text", "align", "bold", "size"], at, errors);
    const text = readString(entry, "text", `${at}.text`, errors, {
      required: false,
    });
    checkPlaceholders(text, spec, `${at}.text`, errors);
    const line: TemplateLine = { text };
    const align = readAlign(entry, "align", `${at}.align`, errors);
    if (align) line.align = align;
    if (entry.bold !== undefined) {
      line.bold = readBool(entry, "bold", `${at}.bold`, errors, false);
    }
    const size = readSize(entry, "size", `${at}.size`, errors);
    if (size) line.size = size;
    return line;
  });
}

function readSections(
  value: unknown,
  path: string,
  doc: ReportDocument,
  spec: DocumentSpec,
  errors: string[],
): ReportTemplate["sections"] {
  if (!Array.isArray(value)) {
    errors.push(`${path} يجب أن يكون قائمة`);
    return [];
  }
  const seen = new Set<string>();
  const sections: ReportTemplate["sections"] = [];
  value.forEach((entry, index) => {
    const at = `${path}[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${at} غير صالح`);
      return;
    }
    checkKeys(entry, ["id", "title", "show", "separator", "columns"], at, errors);
    const id = readString(entry, "id", `${at}.id`, errors);
    const sectionSpec = Object.hasOwn(spec.sections, id)
      ? spec.sections[id]
      : undefined;
    if (!sectionSpec) {
      errors.push(`${at}.id غير معروف لهذا التقرير`);
      return;
    }
    if (seen.has(id)) errors.push(`${at}.id مكرر`);
    seen.add(id);
    const title = readString(entry, "title", `${at}.title`, errors, {
      required: false,
    });
    const show = readBool(entry, "show", `${at}.show`, errors, false);
    const section: ReportTemplate["sections"][number] = { id, title, show };
    section.separator = readBool(
      entry,
      "separator",
      `${at}.separator`,
      errors,
      true,
    );
    if (sectionSpec.kind === "kv") {
      if (entry.columns !== undefined) {
        errors.push(`${at}.columns غير مسموح لقسم نصي`);
      }
    } else {
      const columns = readColumns(
        entry.columns,
        `${at}.columns`,
        sectionSpec.columnKeys,
        errors,
      );
      if (columns.length === 0) errors.push(`${at}.columns مطلوب`);
      section.columns = columns;
    }
    sections.push(section);
  });
  if ((doc === "receipt" || doc === "kitchen") && sections.length > 0) {
    errors.push(`${path} يجب أن تكون فارغة لهذا التقرير`);
  }
  return sections;
}

function readLabels(
  value: unknown,
  path: string,
  fields: string[],
  sections: ReportTemplate["sections"],
  spec: DocumentSpec,
  errors: string[],
): Record<string, string> {
  if (!isPlainObject(value)) {
    errors.push(`${path} يجب أن يكون كائناً`);
    return {};
  }
  const allowed = new Set<string>([
    ...spec.fields,
    ...Object.values(spec.sections).flatMap((section) => section.rowIds),
  ]);
  const labels: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!allowed.has(key)) {
      errors.push(`${path}.${key} غير معروف`);
      continue;
    }
    if (typeof raw !== "string") {
      errors.push(`${path}.${key} يجب أن يكون نصاً`);
      continue;
    }
    const text = clean(raw);
    if (text.length > MAX_TEXT) {
      errors.push(`${path}.${key} أطول من ${MAX_TEXT} حرفاً`);
    }
    labels[key] = text;
  }
  for (const id of fields) {
    if (!labels[id]) errors.push(`${path}.${id} مطلوب`);
  }
  for (const section of sections) {
    if (!section.show) continue;
    const sectionSpec = Object.hasOwn(spec.sections, section.id)
      ? spec.sections[section.id]
      : undefined;
    if (
      sectionSpec?.kind !== "kv" &&
      sectionSpec?.kind !== "groupedTable"
    ) {
      continue;
    }
    for (const rowId of sectionSpec.rowIds) {
      if (!labels[rowId]) errors.push(`${path}.${rowId} مطلوب`);
    }
  }
  return labels;
}

function readSeparator(
  value: Record<string, unknown>,
  path: string,
  errors: string[],
  fallback = true,
): boolean {
  return readBool(value, "separator", `${path}.separator`, errors, fallback);
}

function readOrder(
  value: Record<string, unknown>,
  path: string,
  sections: ReportTemplate["sections"],
  errors: string[],
): string[] {
  const canonical = canonicalBlockIds(sections.map((section) => section.id));
  const raw = value.order;
  if (raw === undefined) return canonical;
  if (!Array.isArray(raw)) {
    errors.push(`${path} يجب أن يكون قائمة`);
    return canonical;
  }
  const allowed = new Set<string>(canonical);
  const seen = new Set<string>();
  const ordered: string[] = [];
  raw.forEach((entry, index) => {
    if (typeof entry !== "string" || !allowed.has(entry)) {
      errors.push(`${path}[${index}] غير معروف لهذا التقرير`);
      return;
    }
    if (seen.has(entry)) {
      errors.push(`${path}[${index}] مكرر`);
      return;
    }
    seen.add(entry);
    ordered.push(entry);
  });
  for (const id of canonical) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

export function validateReportTemplateV1(
  value: unknown,
  expectedDoc?: ReportDocument,
): ValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    return { ok: false, errors: ["ملف التصميم يجب أن يكون كائناً JSON"] };
  }
  checkKeys(
    value,
    [
      "format",
      "version",
      "document",
      "order",
      "paper",
      "header",
      "fields",
      "items",
      "sections",
      "summary",
      "labels",
      "footer",
    ],
    "root",
    errors,
  );
  if (value.format !== "fastpos-report") errors.push("format غير صالح");
  if (value.version !== 1) errors.push("version غير مدعوم");
  if (!isReportDocument(value.document)) {
    return { ok: false, errors: [...errors, "document غير معروف"] };
  }
  const doc = value.document;
  if (expectedDoc && doc !== expectedDoc) {
    errors.push(`document يجب أن يكون ${expectedDoc}`);
  }
  const spec = DOCUMENT_SPECS[doc];

  if (!isPlainObject(value.paper)) {
    errors.push("paper مطلوب");
    return { ok: false, errors };
  }
  checkKeys(value.paper, ["columns"], "paper", errors);
  const columns = value.paper.columns;
  if (columns !== 32 && columns !== 48) errors.push("paper.columns يجب أن يكون 32 أو 48");

  const header = isPlainObject(value.header) ? value.header : null;
  if (!header) errors.push("header مطلوب");
  let logo: ReportTemplate["header"]["logo"] = { show: false };
  let headerLines: TemplateLine[] = [];
  let headerSeparator = true;
  let headerShow = true;
  if (header) {
    checkKeys(header, ["show", "logo", "lines", "separator"], "header", errors);
    headerShow = readBool(header, "show", "header.show", errors, true);
    if (isPlainObject(header.logo)) {
      checkKeys(header.logo, ["show", "align", "maxWidth"], "header.logo", errors);
      const show = readBool(header.logo, "show", "header.logo.show", errors, false);
      logo = { show };
      const align = readAlign(header.logo, "align", "header.logo.align", errors);
      if (align) logo.align = align;
      if (header.logo.maxWidth !== undefined) {
        const maxWidth = header.logo.maxWidth;
        if (
          typeof maxWidth !== "number" ||
          !Number.isInteger(maxWidth) ||
          maxWidth < 64 ||
          maxWidth > 384
        ) {
          errors.push("header.logo.maxWidth غير صالح");
        } else {
          logo.maxWidth = maxWidth;
        }
      }
    } else {
      errors.push("header.logo مطلوب");
    }
    headerLines = readLines(header.lines, "header.lines", spec, errors);
    headerSeparator = readSeparator(header, "header", errors);
  }

  const fields = isPlainObject(value.fields) ? value.fields : null;
  if (!fields) errors.push("fields مطلوب");
  let fieldIds: string[] = [];
  let fieldsSeparator = true;
  let fieldsVisible = true;
  if (fields) {
    checkKeys(fields, ["show", "visible", "separator"], "fields", errors);
    fieldsVisible = readBool(fields, "visible", "fields.visible", errors, true);
    if (!Array.isArray(fields.show)) {
      errors.push("fields.show يجب أن يكون قائمة");
    } else {
      const seen = new Set<string>();
      fieldIds = fields.show
        .filter((id): id is string => {
          if (typeof id !== "string") {
            errors.push("fields.show يحتوي قيمة غير صالحة");
            return false;
          }
          if (!spec.fields.includes(id)) {
            errors.push(`fields.show: ${id} غير معروف`);
            return false;
          }
          if (seen.has(id)) {
            errors.push(`fields.show: ${id} مكرر`);
            return false;
          }
          seen.add(id);
          return true;
        });
    }
    fieldsSeparator = readSeparator(fields, "fields", errors);
  }

  const items = isPlainObject(value.items) ? value.items : null;
  if (!items) errors.push("items مطلوب");
  let itemColumns: TemplateColumn[] = [];
  let itemsShow = false;
  let itemsTitle = "";
  let itemsHeader = true;
  let itemsShowNote = true;
  let itemsSeparator = true;
  if (items) {
    checkKeys(
      items,
      ["show", "title", "header", "showNote", "columns", "separator"],
      "items",
      errors,
    );
    itemsShow = readBool(items, "show", "items.show", errors, false);
    itemsTitle = readString(items, "title", "items.title", errors, {
      required: false,
    });
    itemsHeader = readBool(items, "header", "items.header", errors, true);
    itemsShowNote = readBool(items, "showNote", "items.showNote", errors, true);
    itemsSeparator = readSeparator(items, "items", errors);
    itemColumns = readColumns(
      items.columns,
      "items.columns",
      spec.itemColumns,
      errors,
    );
    if (spec.itemColumns.length === 0) {
      if (itemsShow) errors.push("items.show يجب أن يكون false لهذا التقرير");
      if (itemColumns.length > 0) errors.push("items.columns يجب أن تكون فارغة");
    } else if (itemsShow && itemColumns.length === 0) {
      errors.push("items.columns مطلوب");
    }
  }

  const sections = readSections(value.sections, "sections", doc, spec, errors);
  const order = readOrder(value, "order", sections, errors);

  const summary = isPlainObject(value.summary) ? value.summary : null;
  if (!summary) errors.push("summary مطلوب");
  let summaryShow = false;
  let summaryLabel = "";
  let summarySeparator = true;
  if (summary) {
    checkKeys(summary, ["show", "label", "separator"], "summary", errors);
    summaryShow = readBool(summary, "show", "summary.show", errors, false);
    summaryLabel = readString(summary, "label", "summary.label", errors, {
      required: summaryShow,
    });
    summarySeparator = readSeparator(summary, "summary", errors);
    if (summaryShow && !spec.summaryAllowed) {
      errors.push("summary.show غير مسموح لهذا التقرير");
    }
  }

  const labels = readLabels(value.labels, "labels", fieldIds, sections, spec, errors);

  const footer = isPlainObject(value.footer) ? value.footer : null;
  if (!footer) errors.push("footer مطلوب");
  let footerLines: TemplateLine[] = [];
  let footerSeparator = true;
  let footerShow = true;
  if (footer) {
    checkKeys(footer, ["show", "separator", "lines"], "footer", errors);
    footerShow = readBool(footer, "show", "footer.show", errors, true);
    footerLines = readLines(footer.lines, "footer.lines", spec, errors);
    footerSeparator = readSeparator(footer, "footer", errors);
  }

  const totalLines =
    headerLines.length +
    footerLines.length +
    (itemsTitle ? 1 : 0) +
    sections.filter((section) => section.show).length;
  if (totalLines > MAX_TOTAL_LINES) {
    errors.push(`التصميم يتجاوز ${MAX_TOTAL_LINES} سطراً`);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    template: {
      format: "fastpos-report",
      version: 1,
      document: doc,
      order,
      paper: { columns: columns as 32 | 48 },
      header: { show: headerShow, logo, lines: headerLines, separator: headerSeparator },
      fields: { show: fieldIds, visible: fieldsVisible, separator: fieldsSeparator },
      items: {
        show: itemsShow,
        title: itemsTitle,
        header: itemsHeader,
        showNote: itemsShowNote,
        columns: itemColumns,
        separator: itemsSeparator,
      },
      sections,
      summary: {
        show: summaryShow,
        label: summaryLabel,
        separator: summarySeparator,
      },
      labels,
      footer: { show: footerShow, separator: footerSeparator, lines: footerLines },
    },
  };
}

function stableKey(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableKey).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableKey(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function templatesEqual(a: unknown, b: unknown): boolean {
  return stableKey(a) === stableKey(b);
}

export type ValidationResult = ValidationResultV2;

export function parseReportTemplateJson(
  json: string,
  expectedDoc?: ReportDocument,
): ValidationResult {
  if (new TextEncoder().encode(json).length > MAX_JSON_BYTES) {
    return { ok: false, errors: ["ملف التصميم أكبر من 100 كيلوبايت"] };
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, errors: ["ملف التصميم ليس JSON صالحاً"] };
  }
  const version =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>).version
      : undefined;
  try {
    if (version === 1) {
      const v1 = validateReportTemplateV1(value, expectedDoc);
      if (!v1.ok) return { ok: false, errors: v1.errors };
      return validateReportTemplateV2(
        migrateReportTemplate(v1.template),
        expectedDoc,
      );
    }
    if (version === 2) return validateReportTemplateV2(value, expectedDoc);
    return { ok: false, errors: ["version غير مدعوم"] };
  } catch {
    return { ok: false, errors: ["ملف التصميم غير صالح"] };
  }
}
