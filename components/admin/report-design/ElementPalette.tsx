"use client";

import { useState } from "react";
import { DOCUMENT_SPECS } from "@/lib/print/templates/document-specs";
import {
  DEFAULT_LOGO_WIDTH,
  DEFAULT_QR_SIZE,
  DEFAULT_QR_WIDTH,
  newElementId,
} from "@/lib/print/templates/elements";
import {
  canAddUnique,
  createElement,
  unusedFieldIds,
  unusedSectionIds,
} from "@/lib/print/templates/element-ops";
import type {
  ReportTemplateV2,
  TemplateElement,
} from "@/lib/print/templates/types";

type ElementPaletteProps = {
  template: ReportTemplateV2;
  defaults: ReportTemplateV2;
  onCommit: (next: ReportTemplateV2) => void;
};

export function ElementPalette({ template, defaults, onCommit }: ElementPaletteProps) {
  const spec = DOCUMENT_SPECS[template.document];
  const paper = template.paper.columns;
  const [fieldChoice, setFieldChoice] = useState("");
  const fields = unusedFieldIds(template);
  const fieldId = fields.includes(fieldChoice) ? fieldChoice : (fields[0] ?? "");
  const sections = unusedSectionIds(template);

  function add(draft: TemplateElement) {
    const next = createElement(template, draft, { labelDefaults: defaults.labels });
    if (next) onCommit(next);
  }

  const table = defaults.elements.find((element) => element.type === "itemTable");
  const fallbackColumns = spec.itemColumns.map((key) => ({
    key,
    label: defaults.labels[key] ?? key,
    width: 8,
  }));

  const summary = defaults.elements.find((element) => element.type === "summary");

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-base-300 p-3">
      <button type="button" className="btn btn-sm" onClick={() => add({ id: newElementId(), type: "text", row: 0, col: 0, width: paper, visible: true, text: "نص جديد" })}>
        نص
      </button>

      <select
        aria-label="اختر حقلاً"
        className="select select-bordered select-sm"
        value={fieldId}
        onChange={(event) => setFieldChoice(event.target.value)}
      >
        {fields.length === 0 && <option value="">لا حقول متاحة</option>}
        {fields.map((id) => (
          <option key={id} value={id}>
            {defaults.labels[id] ?? id}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-sm"
        disabled={!fieldId}
        onClick={() =>
          fieldId &&
          add({
            id: newElementId(),
            type: "field",
            row: 0,
            col: 0,
            width: paper,
            visible: true,
            fieldId,
          })
        }
      >
        إضافة حقل
      </button>

      <button
        type="button"
        className="btn btn-sm"
        disabled={!canAddUnique(template, "logo")}
        onClick={() =>
          add({
            id: newElementId(),
            type: "logo",
            row: 0,
            col: 0,
            width: paper,
            visible: true,
            align: "center",
            maxWidth: DEFAULT_LOGO_WIDTH,
          })
        }
      >
        شعار
      </button>

      {spec.qr && (
        <button
          type="button"
          className="btn btn-sm"
          disabled={!canAddUnique(template, "qr")}
          onClick={() =>
            add({
              id: newElementId(),
              type: "qr",
              row: 0,
              col: Math.floor((paper - DEFAULT_QR_WIDTH) / 2),
              width: DEFAULT_QR_WIDTH,
              visible: true,
              sizePx: DEFAULT_QR_SIZE,
            })
          }
        >
          رمز QR
        </button>
      )}

      {spec.itemColumns.length > 0 && (
        <button
          type="button"
          className="btn btn-sm"
          disabled={!canAddUnique(template, "itemTable")}
          onClick={() =>
            add({
              id: newElementId(),
              type: "itemTable",
              row: 0,
              col: 0,
              width: paper,
              visible: true,
              title: "الأصناف",
              showHeader: true,
              showNotes: true,
              columns:
                table?.type === "itemTable" ? table.columns : fallbackColumns,
            })
          }
        >
          جدول الأصناف
        </button>
      )}

      {sections.map((sectionId) => {
        const source = defaults.elements.find(
          (element) => element.type === "section" && element.sectionId === sectionId,
        );
        const draft: TemplateElement = {
          id: newElementId(),
          type: "section",
          row: 0,
          col: 0,
          width: paper,
          visible: true,
          sectionId,
          title: source?.type === "section" ? (source.title ?? "") : "",
          ...(source?.type === "section" && source.columns
            ? { columns: source.columns }
            : {}),
        };
        return (
          <button
            key={sectionId}
            type="button"
            className="btn btn-sm"
            onClick={() => add(draft)}
          >
            {source?.type === "section" ? source.title || sectionId : sectionId}
          </button>
        );
      })}

      {spec.summaryAllowed && (
        <button
          type="button"
          className="btn btn-sm"
          disabled={!canAddUnique(template, "summary")}
          onClick={() =>
            add({
              id: newElementId(),
              type: "summary",
              row: 0,
              col: 0,
              width: paper,
              visible: true,
              label: summary?.type === "summary" ? summary.label : "",
            })
          }
        >
          الإجمالي
        </button>
      )}

      <button
        type="button"
        className="btn btn-sm"
        onClick={() =>
          add({ id: newElementId(), type: "separator", row: 0, col: 0, width: paper, visible: true })
        }
      >
        فاصل
      </button>
    </div>
  );
}
