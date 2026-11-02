// lib/print/templates/migrate.ts
import { DOCUMENT_SPECS } from "./document-specs";
import { slugElementId } from "./elements";
import { orderedBlockIds } from "./schema-common";
import type {
  ReportTemplateV1,
  ReportTemplateV2,
  SeparatorElement,
  TemplateElement,
} from "./types";

export function migrateReportTemplate(v1: ReportTemplateV1): ReportTemplateV2 {
  const paper = v1.paper.columns;
  const spec = DOCUMENT_SPECS[v1.document];
  const elements: TemplateElement[] = [];
  let row = 0;
  const at = () => row++;

  const separator = (
    id: string,
    visible: boolean,
    references: string[],
  ): SeparatorElement => ({
    id,
    type: "separator",
    row: at(),
    col: 0,
    width: paper,
    visible,
    hideWhenEmptyOf: references,
  });

  const migrateHeader = () => {
    const visible = v1.header.show !== false;
    const refs: string[] = [];
    if (v1.header.logo.show) {
      elements.push({
        id: "el_logo",
        type: "logo",
        row: at(),
        col: 0,
        width: paper,
        visible,
        align: v1.header.logo.align,
        maxWidth: v1.header.logo.maxWidth,
      });
      refs.push("el_logo");
    }
    v1.header.lines.forEach((line, index) => {
      const id = `el_header_${index}`;
      elements.push({
        id,
        type: "text",
        row: at(),
        col: 0,
        width: paper,
        visible,
        text: line.text,
        align: line.align,
        bold: line.bold,
        size: line.size,
      });
      refs.push(id);
    });
    if (v1.header.separator !== false && refs.length > 0) {
      elements.push(separator("el_sep_header", visible, refs));
    }
  };

  const migrateFields = () => {
    const visible = v1.fields.visible !== false;
    const refs = v1.fields.show.map((fieldId) => {
      const id = slugElementId("field", fieldId);
      elements.push({
        id,
        type: "field",
        row: at(),
        col: 0,
        width: paper,
        visible,
        fieldId,
      });
      return id;
    });
    if (v1.fields.separator !== false && refs.length > 0) {
      elements.push(separator("el_sep_fields", visible, refs));
    }
  };

  const migrateItems = () => {
    if (spec.itemColumns.length === 0 || v1.items.columns.length === 0) return;
    elements.push({
      id: "el_items",
      type: "itemTable",
      row: at(),
      col: 0,
      width: paper,
      visible: v1.items.show,
      title: v1.items.title ?? "",
      showHeader: v1.items.header !== false,
      showNotes: v1.items.showNote !== false,
      columns: v1.items.columns,
    });
    if (v1.items.separator !== false) {
      elements.push(separator("el_sep_items", v1.items.show, ["el_items"]));
    }
  };

  const migrateSection = (index: number) => {
    const section = v1.sections[index]!;
    const sectionSpec = spec.sections[section.id];
    const id = slugElementId("section", section.id);
    if (section.separator !== false) {
      elements.push(separator(slugElementId("sep", section.id), section.show, [id]));
    }
    elements.push({
      id,
      type: "section",
      row: at(),
      col: 0,
      width: paper,
      visible: section.show,
      sectionId: section.id,
      title: section.title,
      ...(sectionSpec && sectionSpec.kind !== "kv" ? { columns: section.columns ?? [] } : {}),
    });
  };

  const migrateSummary = () => {
    // The v2 schema rejects a summary element for documents that do not allow
    // one, even when it is invisible, so the block is dropped entirely.
    if (!spec.summaryAllowed) return;
    if (v1.summary.separator !== false) {
      elements.push(separator("el_sep_summary", v1.summary.show, ["el_summary"]));
    }
    elements.push({
      id: "el_summary",
      type: "summary",
      row: at(),
      col: 0,
      width: paper,
      visible: v1.summary.show,
      label: v1.summary.label,
    });
  };

  const migrateFooter = () => {
    if (v1.footer.lines.length === 0) return;
    const visible = v1.footer.show !== false;
    // v1 prints the footer separator before the lines, so reserve its row
    // first and push the elements in row order.
    const separatorRow = v1.footer.separator !== false ? at() : null;
    const texts = v1.footer.lines.map((line, index) => {
      const id = `el_footer_${index}`;
      return {
        element: {
          id,
          type: "text" as const,
          row: at(),
          col: 0,
          width: paper,
          visible,
          text: line.text,
          align: line.align,
          bold: line.bold,
          size: line.size,
        },
        id,
      };
    });
    const refs = texts.map((entry) => entry.id);
    if (separatorRow !== null) {
      elements.push({
        id: "el_sep_footer",
        type: "separator",
        row: separatorRow,
        col: 0,
        width: paper,
        visible,
        hideWhenEmptyOf: refs,
      });
    }
    for (const entry of texts) elements.push(entry.element);
  };

  for (const blockId of orderedBlockIds(v1)) {
    if (blockId === "header") migrateHeader();
    else if (blockId === "fields") migrateFields();
    else if (blockId === "items") migrateItems();
    else if (blockId === "summary") migrateSummary();
    else if (blockId === "footer") migrateFooter();
    else {
      const index = v1.sections.findIndex((section) => `section:${section.id}` === blockId);
      if (index >= 0) migrateSection(index);
    }
  }

  return {
    format: "fastpos-report",
    version: 2,
    document: v1.document,
    paper: { columns: paper },
    elements,
    labels: { ...v1.labels },
  };
}
