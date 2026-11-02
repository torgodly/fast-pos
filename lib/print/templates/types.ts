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

export type ReportTemplateV1 = {
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

export type ReportTemplate = ReportTemplateV2;

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
  | { kind: "logo"; align: Align; maxWidth: number; offsetPx?: number }
  | { kind: "qr"; payload: string; sizePx: number; offsetPx: number; columns: 32 | 48 }
  | {
      kind: "columns";
      widths: number[];
      cells: Array<{ text: string; align: Align; bold: boolean; size: TextSize }>;
    };

export const ELEMENT_TYPES = [
  "text",
  "field",
  "logo",
  "qr",
  "separator",
  "itemTable",
  "section",
  "summary",
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];

export type ElementBase = {
  id: string;
  type: ElementType;
  row: number;
  col: number;
  width: number;
  visible: boolean;
};

export type TextElement = ElementBase & {
  type: "text";
  text: string;
  align?: Align;
  bold?: boolean;
  size?: TextSize;
  hideWhenEmpty?: boolean;
};

export type FieldElement = ElementBase & {
  type: "field";
  fieldId: string;
  align?: Align;
  bold?: boolean;
  size?: TextSize;
  hideWhenEmpty?: boolean;
};

export type LogoElement = ElementBase & {
  type: "logo";
  align?: Align;
  maxWidth?: number;
};

export type QrElement = ElementBase & {
  type: "qr";
  sizePx: number;
};

export type SeparatorElement = ElementBase & {
  type: "separator";
  hideWhenEmptyOf?: string[];
};

export type ItemTableElement = ElementBase & {
  type: "itemTable";
  title?: string;
  showHeader?: boolean;
  showNotes?: boolean;
  columns: TemplateColumn[];
};

export type SectionElement = ElementBase & {
  type: "section";
  sectionId: string;
  title?: string;
  columns?: TemplateColumn[];
};

export type SummaryElement = ElementBase & {
  type: "summary";
  label: string;
};

export type TemplateElement =
  | TextElement
  | FieldElement
  | LogoElement
  | QrElement
  | SeparatorElement
  | ItemTableElement
  | SectionElement
  | SummaryElement;

export type ReportTemplateV2 = {
  format: "fastpos-report";
  version: 2;
  document: ReportDocument;
  paper: { columns: 32 | 48 };
  elements: TemplateElement[];
  labels: Record<string, string>;
};
