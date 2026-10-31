"use client";

import {
  blockLabel,
  setBlockVisible,
  type BlockId,
  type TemplateCommit,
} from "@/lib/print/templates/blocks";
import { DOCUMENT_SPECS } from "@/lib/print/templates/document-specs";
import type {
  Align,
  ReportTemplate,
  TemplateColumn,
  TemplateLine,
  TextSize,
} from "@/lib/print/templates/types";

type BlockInspectorProps = {
  template: ReportTemplate;
  selected: BlockId | null;
  onChange: TemplateCommit;
};

const ALIGNS: Align[] = ["right", "center", "left"];
const ALIGN_LABELS: Record<Align, string> = {
  right: "يمين",
  center: "وسط",
  left: "يسار",
};
const SIZES: TextSize[] = ["small", "normal", "large", "xlarge"];
const SIZE_LABELS: Record<TextSize, string> = {
  small: "صغير",
  normal: "عادي",
  large: "كبير",
  xlarge: "كبير جداً",
};
const LOGO_WIDTH_MIN = 64;
const LOGO_WIDTH_MAX = 384;
const LOGO_WIDTH_DEFAULT = 256;

function clone(template: ReportTemplate): ReportTemplate {
  return JSON.parse(JSON.stringify(template)) as ReportTemplate;
}

function normalizeLogoWidth(raw: string): number {
  if (raw.trim() === "") return LOGO_WIDTH_DEFAULT;
  const value = Number(raw);
  if (!Number.isFinite(value)) return LOGO_WIDTH_DEFAULT;
  return Math.min(
    LOGO_WIDTH_MAX,
    Math.max(LOGO_WIDTH_MIN, Math.round(value)),
  );
}

function documentSpec(document: ReportTemplate["document"]) {
  return Object.hasOwn(DOCUMENT_SPECS, document)
    ? DOCUMENT_SPECS[document]
    : undefined;
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-base font-bold">
      <input
        type="checkbox"
        aria-label={label}
        className="checkbox checkbox-lg"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function LineEditorRows({
  target,
  lines,
  onPatch,
}: {
  target: "header" | "footer";
  lines: TemplateLine[];
  onPatch: (index: number, patch: Partial<TemplateLine>) => void;
}) {
  const prefix = target === "header" ? "سطر الترويسة" : "سطر التذييل";
  return (
    <>
      {lines.map((line, index) => (
        <div key={index} className="space-y-2 rounded-xl border border-base-200 p-2">
          <input
            aria-label={`${prefix} ${index + 1}`}
            className="input input-bordered input-lg w-full"
            value={line.text}
            onChange={(event) => onPatch(index, { text: event.target.value })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={`محاذاة السطر ${index + 1}`}
              className="select select-bordered select-lg"
              value={line.align ?? "right"}
              onChange={(event) =>
                onPatch(index, { align: event.target.value as Align })
              }
            >
              {ALIGNS.map((align) => (
                <option key={align} value={align}>
                  {ALIGN_LABELS[align]}
                </option>
              ))}
            </select>
            <select
              aria-label={`حجم السطر ${index + 1}`}
              className="select select-bordered select-lg"
              value={line.size ?? "normal"}
              onChange={(event) =>
                onPatch(index, { size: event.target.value as TextSize })
              }
            >
              {SIZES.map((size) => (
                <option key={size} value={size}>
                  {SIZE_LABELS[size]}
                </option>
              ))}
            </select>
            <Switch
              label={`السطر ${index + 1} عريض`}
              checked={line.bold ?? false}
              onChange={(value) => onPatch(index, { bold: value })}
            />
          </div>
        </div>
      ))}
    </>
  );
}

export function BlockInspector({
  template,
  selected,
  onChange,
}: BlockInspectorProps) {
  function updateLine(
    target: "header" | "footer",
    index: number,
    patch: Partial<TemplateLine>,
  ) {
    const next = clone(template);
    if (target === "header") {
      next.header.lines[index] = { ...next.header.lines[index]!, ...patch };
    } else {
      next.footer.lines[index] = { ...next.footer.lines[index]!, ...patch };
    }
    onChange(next, { coalesceKey: `${target}-line-${index}` });
  }

  function updateColumn(
    target: "items" | string,
    index: number,
    patch: Partial<TemplateColumn>,
  ) {
    const next = clone(template);
    if (target === "items") {
      next.items.columns[index] = { ...next.items.columns[index]!, ...patch };
    } else {
      const section = next.sections.find((entry) => entry.id === target);
      if (!section || !section.columns) return;
      section.columns[index] = { ...section.columns[index]!, ...patch };
    }
    onChange(next, { coalesceKey: `column-${target}-${index}` });
  }

  function updateFieldLabel(id: string, value: string) {
    const next = clone(template);
    next.labels[id] = value;
    onChange(next, { coalesceKey: `label-${id}` });
  }

  function toggleField(id: string, checked: boolean) {
    const next = clone(template);
    next.fields.show = checked
      ? [...next.fields.show, id]
      : next.fields.show.filter((entry) => entry !== id);
    if (checked && !next.labels[id]) next.labels[id] = id;
    onChange(next);
  }

  function moveField(index: number, direction: -1 | 1) {
    const next = clone(template);
    const show = [...next.fields.show];
    const target = index + direction;
    if (target < 0 || target >= show.length) return;
    [show[index], show[target]] = [show[target]!, show[index]!];
    next.fields.show = show;
    onChange(next);
  }

  function columnEditor(
    columns: TemplateColumn[],
    target: "items" | string,
  ) {
    return (
      <div className="space-y-2">
        {columns.map((column, index) => (
          <div key={column.key} className="grid grid-cols-[1fr_6rem] gap-2">
            <input
              aria-label={`عنوان العمود ${column.label}`}
              className="input input-bordered input-lg w-full"
              value={column.label}
              onChange={(event) =>
                updateColumn(target, index, { label: event.target.value })
              }
            />
            <input
              aria-label={`عرض العمود ${column.label}`}
              type="number"
              min={1}
              max={64}
              className="input input-bordered input-lg w-full"
              value={column.width}
              onChange={(event) =>
                updateColumn(target, index, {
                  width: Math.max(
                    1,
                    Math.min(64, Number(event.target.value) || 1),
                  ),
                })
              }
            />
          </div>
        ))}
      </div>
    );
  }

  const section =
    selected?.startsWith("section:")
      ? template.sections.find((entry) => `section:${entry.id}` === selected)
      : undefined;

  let body: React.ReactNode;
  if (selected === "header") {
    body = (
      <>
        <Switch
          label="إظهار الترويسة"
          checked={template.header.show !== false}
          onChange={(value) => onChange(setBlockVisible(template, "header", value))}
        />
        <Switch
          label="إظهار الشعار"
          checked={template.header.logo.show}
          onChange={(value) => {
            const next = clone(template);
            next.header.logo.show = value;
            onChange(next);
          }}
        />
        <label className="block space-y-1 text-base font-bold">
          <span>محاذاة الشعار</span>
          <select
            aria-label="محاذاة الشعار"
            className="select select-bordered select-lg w-full"
            value={template.header.logo.align ?? "center"}
            onChange={(event) => {
              const next = clone(template);
              next.header.logo.align = event.target.value as Align;
              onChange(next, { coalesceKey: "header-logo-align" });
            }}
          >
            {ALIGNS.map((align) => (
              <option key={align} value={align}>
                {ALIGN_LABELS[align]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-base font-bold">
          <span>أقصى عرض للشعار</span>
          <input
            key={template.header.logo.maxWidth ?? LOGO_WIDTH_DEFAULT}
            aria-label="أقصى عرض للشعار"
            type="number"
            min={LOGO_WIDTH_MIN}
            max={LOGO_WIDTH_MAX}
            step={8}
            className="input input-bordered input-lg w-full"
            defaultValue={template.header.logo.maxWidth ?? LOGO_WIDTH_DEFAULT}
            onBlur={(event) => {
              const current = template.header.logo.maxWidth ?? LOGO_WIDTH_DEFAULT;
              const normalized = normalizeLogoWidth(event.target.value);
              if (normalized === current) {
                event.currentTarget.value = String(current);
                return;
              }
              const next = clone(template);
              next.header.logo.maxWidth = normalized;
              onChange(next, { coalesceKey: "header-logo-max-width" });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
        <Switch
          label="خط فاصل بعد الترويسة"
          checked={template.header.separator !== false}
          onChange={(value) => {
            const next = clone(template);
            next.header.separator = value;
            onChange(next);
          }}
        />
        <LineEditorRows
          target="header"
          lines={template.header.lines}
          onPatch={(index, patch) => updateLine("header", index, patch)}
        />
      </>
    );
  } else if (selected === "fields") {
    const fields = documentSpec(template.document)?.fields ?? [];
    body = (
      <>
        <Switch
          label="إظهار البيانات"
          checked={template.fields.visible !== false}
          onChange={(value) => onChange(setBlockVisible(template, "fields", value))}
        />
        <Switch
          label="خط فاصل بعد البيانات"
          checked={template.fields.separator !== false}
          onChange={(value) => {
            const next = clone(template);
            next.fields.separator = value;
            onChange(next);
          }}
        />
        <div className="space-y-2">
          {fields.map((id) => {
            const index = template.fields.show.indexOf(id);
            const shown = index >= 0;
            return (
              <div key={id} className="flex flex-wrap items-center gap-2">
                <Switch
                  label={template.labels[id] ?? id}
                  checked={shown}
                  onChange={(value) => toggleField(id, value)}
                />
                <button
                  type="button"
                  aria-label={`تحريك الحقل ${id} لأعلى`}
                  className="btn"
                  disabled={!shown || index === 0}
                  onClick={() => moveField(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`تحريك الحقل ${id} لأسفل`}
                  className="btn"
                  disabled={!shown || index === template.fields.show.length - 1}
                  onClick={() => moveField(index, 1)}
                >
                  ↓
                </button>
                <input
                  aria-label={`عنوان الحقل ${id}`}
                  className="input input-bordered input-lg min-w-40 flex-1"
                  value={template.labels[id] ?? ""}
                  onChange={(event) => updateFieldLabel(id, event.target.value)}
                />
              </div>
            );
          })}
        </div>
      </>
    );
  } else if (selected === "items") {
    const hasItemColumns = (documentSpec(template.document)?.itemColumns ?? []).length > 0;
    body = (
      <>
        {hasItemColumns ? (
          <Switch
            label="إظهار الأصناف"
            checked={template.items.show}
            onChange={(value) => onChange(setBlockVisible(template, "items", value))}
          />
        ) : (
          <p className="text-base text-base-content/50">
            هذا التقرير لا يحتوي على جدول أصناف.
          </p>
        )}
        <label className="block space-y-1 text-base font-bold">
          <span>عنوان الجدول</span>
          <input
            aria-label="عنوان الأصناف"
            className="input input-bordered input-lg w-full"
            value={template.items.title ?? ""}
            onChange={(event) => {
              const next = clone(template);
              next.items.title = event.target.value;
              onChange(next, { coalesceKey: "items-title" });
            }}
          />
        </label>
        <Switch
          label="إظهار صف العناوين"
          checked={template.items.header !== false}
          onChange={(value) => {
            const next = clone(template);
            next.items.header = value;
            onChange(next);
          }}
        />
        <Switch
          label="إظهار الملاحظات"
          checked={template.items.showNote !== false}
          onChange={(value) => {
            const next = clone(template);
            next.items.showNote = value;
            onChange(next);
          }}
        />
        <Switch
          label="خط فاصل بعد الأصناف"
          checked={template.items.separator !== false}
          onChange={(value) => {
            const next = clone(template);
            next.items.separator = value;
            onChange(next);
          }}
        />
        {columnEditor(template.items.columns, "items")}
      </>
    );
  } else if (selected === "summary") {
    const summaryAllowed = documentSpec(template.document)?.summaryAllowed ?? false;
    body = summaryAllowed ? (
      <>
        <Switch
          label="إظهار الإجمالي"
          checked={template.summary.show}
          onChange={(value) => onChange(setBlockVisible(template, "summary", value))}
        />
        <label className="block space-y-1 text-base font-bold">
          <span>عنوان الإجمالي</span>
          <input
            aria-label="عنوان الإجمالي"
            className="input input-bordered input-lg w-full"
            value={template.summary.label}
            onChange={(event) => {
              const next = clone(template);
              next.summary.label = event.target.value;
              onChange(next, { coalesceKey: "summary-label" });
            }}
          />
        </label>
        <Switch
          label="خط فاصل قبل الإجمالي"
          checked={template.summary.separator !== false}
          onChange={(value) => {
            const next = clone(template);
            next.summary.separator = value;
            onChange(next);
          }}
        />
      </>
    ) : (
      <p className="text-base text-base-content/50">
        هذا التقرير لا يحتوي على إجمالي.
      </p>
    );
  } else if (selected === "footer") {
    body = (
      <>
        <Switch
          label="إظهار التذييل"
          checked={template.footer.show !== false}
          onChange={(value) => onChange(setBlockVisible(template, "footer", value))}
        />
        <Switch
          label="خط فاصل قبل التذييل"
          checked={template.footer.separator !== false}
          onChange={(value) => {
            const next = clone(template);
            next.footer.separator = value;
            onChange(next);
          }}
        />
        <LineEditorRows
          target="footer"
          lines={template.footer.lines}
          onPatch={(index, patch) => updateLine("footer", index, patch)}
        />
      </>
    );
  } else if (section && selected) {
    body = (
      <>
        <Switch
          label="إظهار القسم"
          checked={section.show}
          onChange={(value) => onChange(setBlockVisible(template, selected, value))}
        />
        <label className="block space-y-1 text-base font-bold">
          <span>عنوان القسم</span>
          <input
            aria-label="عنوان القسم"
            className="input input-bordered input-lg w-full"
            value={section.title}
            onChange={(event) => {
              const next = clone(template);
              const target = next.sections.find(
                (entry) => entry.id === section.id,
              );
              if (target) target.title = event.target.value;
              onChange(next, { coalesceKey: `section-title-${section.id}` });
            }}
          />
        </label>
        <Switch
          label="خط فاصل قبل القسم"
          checked={section.separator !== false}
          onChange={(value) => {
            const next = clone(template);
            const target = next.sections.find(
              (entry) => entry.id === section.id,
            );
            if (target) target.separator = value;
            onChange(next);
          }}
        />
        {section.columns && section.columns.length > 0
          ? columnEditor(section.columns, section.id)
          : null}
      </>
    );
  } else {
    body = (
      <p className="text-base text-base-content/50">
        اختر حزمة من الورقة لتعديلها.
      </p>
    );
  }

  return (
    <aside className="space-y-3 rounded-2xl border border-base-300 bg-base-100 p-4">
      <h3 className="text-lg font-black">
        {selected ? `خصائص — ${blockLabel(template, selected)}` : "الخصائص"}
      </h3>
      {body}
    </aside>
  );
}
