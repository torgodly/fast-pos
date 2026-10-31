import {
  deleteSettingValue,
  getSettingValue,
  setSettingValue,
} from "@/lib/settings";
import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import { parseReportTemplateJson } from "./schema";
import type { ReportDocument, ReportTemplate } from "./types";

export const REPORT_TEMPLATE_KEY_PREFIX = "report_template.";

export function reportTemplateKey(document: ReportDocument): string {
  return `${REPORT_TEMPLATE_KEY_PREFIX}${document}`;
}

const warned = new Set<ReportDocument>();

export function loadReportTemplate(document: ReportDocument): ReportTemplate {
  const stored = getSettingValue(reportTemplateKey(document));
  if (!stored) return DEFAULT_REPORT_TEMPLATES[document];

  const result = parseReportTemplateJson(stored, document);
  if (result.ok) return result.template;

  if (!warned.has(document)) {
    warned.add(document);
    console.warn(
      `[report-template] ${document}: ${result.errors.join("; ")}; using default`,
    );
  }
  return DEFAULT_REPORT_TEMPLATES[document];
}

export function getReportTemplateJson(document: ReportDocument): string {
  return JSON.stringify(loadReportTemplate(document), null, 2);
}

export function persistReportTemplate(
  document: ReportDocument,
  json: string,
): { ok: true } | { ok: false; errors: string[] } {
  const result = parseReportTemplateJson(json, document);
  if (!result.ok) return { ok: false, errors: result.errors };

  setSettingValue(reportTemplateKey(document), JSON.stringify(result.template));
  warned.delete(document);
  return { ok: true };
}

export function deleteReportTemplate(document: ReportDocument): void {
  deleteSettingValue(reportTemplateKey(document));
}
