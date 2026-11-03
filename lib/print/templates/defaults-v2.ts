import { DEFAULT_REPORT_TEMPLATES_V1 } from "./defaults-v1";
import { migrateReportTemplate } from "./migrate";
import type { ReportDocument, ReportTemplateV2 } from "./types";

// The defaults are the deterministic migration of the frozen v1 defaults, so
// a fresh install and an upgraded install produce exactly the same paper.
// Each migrated template is cloned so the shipped v2 defaults never share the
// `items.columns` / `section.columns` arrays with the frozen v1 templates used
// as the migration oracle: an editor mutating a default must not corrupt v1.
export const DEFAULT_REPORT_TEMPLATES_V2: Record<ReportDocument, ReportTemplateV2> = {
  receipt: structuredClone(migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.receipt)),
  kitchen: structuredClone(migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.kitchen)),
  shift: structuredClone(migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.shift)),
  items: structuredClone(migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.items)),
  sales: structuredClone(migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.sales)),
  purchases: structuredClone(
    migrateReportTemplate(DEFAULT_REPORT_TEMPLATES_V1.purchases),
  ),
};
