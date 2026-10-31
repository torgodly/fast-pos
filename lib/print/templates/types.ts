export const REPORT_DOCUMENTS = [
  "receipt",
  "kitchen",
  "shift",
  "items",
  "sales",
] as const;

export type ReportDocument = (typeof REPORT_DOCUMENTS)[number];

export function isReportDocument(value: unknown): value is ReportDocument {
  return (
    typeof value === "string" &&
    (REPORT_DOCUMENTS as readonly string[]).includes(value)
  );
}

export type Align = "right" | "center" | "left";
export type TextSize = "small" | "normal" | "large" | "xlarge";

export type TemplateLine = {
  text: string;
  align?: Align;
  bold?: boolean;
  size?: TextSize;
};

export type TemplateColumn = {
  key: string;
  label: string;
  width: number;
  align?: Align;
  bold?: boolean;
  size?: TextSize;
};

export type TemplateSection = {
  id: string;
  title: string;
  show: boolean;
  separator?: boolean;
  columns?: TemplateColumn[];
};

export type ReportTemplate = {
  format: "fastpos-report";
  version: 1;
  document: ReportDocument;
  order?: string[];
  paper: { columns: 32 | 48 };
  header: {
    show?: boolean;
    logo: { show: boolean; align?: Align; maxWidth?: number };
    lines: TemplateLine[];
    separator?: boolean;
  };
  fields: { show: string[]; visible?: boolean; separator?: boolean };
  items: {
    show: boolean;
    title?: string;
    header?: boolean;
    showNote?: boolean;
    columns: TemplateColumn[];
    separator?: boolean;
  };
  sections: TemplateSection[];
  summary: { show: boolean; label: string; separator?: boolean };
  labels: Record<string, string>;
  footer: { show?: boolean; separator?: boolean; lines: TemplateLine[] };
};

export type SectionKind = "kv" | "table" | "groupedTable";

export type DocumentSectionData = {
  kind: SectionKind;
  rows: Array<{ labelId?: string; label?: string; value: string; bold?: boolean }>;
  table?: Array<Record<string, string>>;
  groups?: Array<{
    label: string;
    rows: Array<Record<string, string>>;
    total: string;
  }>;
  emptyText?: string;
};

export type DocumentData = {
  title: string;
  subtitle: string;
  venue: string;
  brandPhone: string;
  brandAddress: string;
  footer: string;
  status: string;
  logoAvailable: boolean;
  fields: Record<string, string | null>;
  items: Array<Record<string, string>>;
  itemNotes: Array<string | null>;
  sections: Record<string, DocumentSectionData>;
  summary: string | null;
};

export type LayoutLine =
  | { kind: "text"; text: string; align: Align; bold: boolean; size: TextSize }
  | { kind: "separator" }
  | { kind: "logo"; align: Align; maxWidth: number }
  | {
      kind: "columns";
      widths: number[];
      cells: Array<{ text: string; align: Align; bold: boolean; size: TextSize }>;
    };
