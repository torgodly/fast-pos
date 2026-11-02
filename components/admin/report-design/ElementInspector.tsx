"use client";

import { useRef, useState, type ReactNode } from "react";
import { DOCUMENT_SPECS } from "@/lib/print/templates/document-specs";
import {
  changeField,
  duplicateElement,
  removeElement,
  setSeparatorRefs,
  updateElement,
  updateLabel,
  type ElementPatch,
  type TemplateCommit,
} from "@/lib/print/templates/element-ops";
import type {
  Align,
  ReportTemplateV2,
  TemplateColumn,
  TextSize,
} from "@/lib/print/templates/types";
import { elementLabel } from "./ElementCard";

type ElementInspectorProps = {
  template: ReportTemplateV2;
  defaults: ReportTemplateV2;
  selectedId: string | null;
  onCommit: TemplateCommit;
  onSelect: (id: string | null) => void;
};

function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-base-content/60">{label}</span>
      <input
        type="number"
        aria-label={label}
        key={value}
        defaultValue={value}
        min={min}
        max={max}
        className="input input-bordered input-sm w-full"
        onBlur={(event) => {
          const parsed = Number(event.target.value);
          const next = Number.isFinite(parsed)
            ? Math.max(min, Math.min(max, Math.round(parsed)))
            : value;
          if (next === value) {
            event.target.value = String(value);
            return;
          }
          event.target.value = String(next);
          if (!onCommit(next)) event.target.value = String(value);
        }}
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-base-content/60">{label}</span>
      <select
        aria-label={label}
        className="select select-bordered select-sm w-full"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        aria-label={label}
        className="checkbox checkbox-sm"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

const ALIGN_OPTIONS: Array<{ value: Align; label: string }> = [
  { value: "right", label: "يمين" },
  { value: "center", label: "وسط" },
  { value: "left", label: "يسار" },
];

const SIZE_OPTIONS: Array<{ value: TextSize; label: string }> = [
  { value: "small", label: "صغير" },
  { value: "normal", label: "عادي" },
  { value: "large", label: "كبير" },
  { value: "xlarge", label: "كبير جداً" },
];

export function ElementInspector({
  template,
  defaults,
  selectedId,
  onCommit,
  onSelect,
}: ElementInspectorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [insertToken, setInsertToken] = useState("");
  // Placeholder validation rejects stray `{`/`}` immediately, so partially typed
  // tokens live in a draft until they validate (or the field loses focus). The
  // draft carries the element id, so selecting another element drops it without
  // an effect.
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);
  const element = template.elements.find((entry) => entry.id === selectedId);
  const textDraft = element && draft?.id === element.id ? draft.text : null;

  if (!element) {
    return (
      <aside className="rounded-xl border border-base-300 p-4 text-sm text-base-content/60">
        اختر عنصراً من الورقة لتعديل خصائصه.
      </aside>
    );
  }

  const spec = DOCUMENT_SPECS[template.document];
  const patch = (value: ElementPatch, coalesceKey?: string) => {
    const next = updateElement(template, element.id, value);
    if (next === template) return false;
    onCommit(next, coalesceKey ? { coalesceKey } : undefined);
    return true;
  };

  const insertAtCaret = (token: string) => {
    const text =
      element.type === "text" ? textDraft ?? element.text : "";
    const start = textareaRef.current?.selectionStart ?? text.length;
    const end = textareaRef.current?.selectionEnd ?? start;
    const next = text.slice(0, start) + token + text.slice(end);
    if (patch({ text: next })) setDraft(null);
    else setDraft({ id: element.id, text: next });
  };

  const position = (
    <div className="grid grid-cols-3 gap-2">
      <NumberField
        label="الصف"
        value={element.row}
        min={0}
        max={59}
        onCommit={(row) => patch({ row })}
      />
      {element.type !== "separator" && (
        <>
          <NumberField
            label="العمود"
            value={element.col}
            min={0}
            max={template.paper.columns - 1}
            onCommit={(col) => patch({ col })}
          />
          <NumberField
            label="العرض"
            value={element.width}
            min={1}
            max={template.paper.columns}
            onCommit={(width) => patch({ width })}
          />
        </>
      )}
    </div>
  );

  function columnsEditor(
    columns: TemplateColumn[],
    onChange: (columns: TemplateColumn[]) => boolean,
  ) {
    return (
      <div className="space-y-1">
        {columns.map((column, index) => (
          <NumberField
            key={column.key}
            label={`عرض ${column.label}`}
            value={column.width}
            min={1}
            max={64}
            onCommit={(width) =>
              onChange(
                columns.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, width } : entry,
                ),
              )
            }
          />
        ))}
      </div>
    );
  }

  let body: ReactNode = null;

  if (element.type === "text") {
    const tokens = [
      ...spec.placeholders.map((token) => `{{${token}}}`),
      ...spec.fields.map((field) => `{{field.${field}}}`),
    ];
    body = (
      <>
        <label className="block">
          <span className="text-[11px] text-base-content/60">النص</span>
          <textarea
            ref={textareaRef}
            aria-label="النص"
            className="textarea textarea-bordered w-full font-mono text-sm"
            value={textDraft ?? element.text}
            onChange={(event) => {
              const text = event.target.value;
              if (patch({ text }, `text:${element.id}`)) setDraft(null);
              else setDraft({ id: element.id, text });
            }}
            onBlur={() => setDraft(null)}
          />
        </label>
        <select
          aria-label="إدراج بيانات"
          className="select select-bordered select-sm w-full"
          value={insertToken}
          onChange={(event) => {
            const token = event.target.value;
            setInsertToken("");
            if (token) insertAtCaret(token);
          }}
        >
          <option value="">إدراج بيانات…</option>
          {tokens.map((token) => (
            <option key={token} value={token}>{token}</option>
          ))}
        </select>
        <SelectField
          label="المحاذاة"
          value={element.align ?? "right"}
          options={ALIGN_OPTIONS}
          onChange={(align) => patch({ align })}
        />
        <SelectField
          label="الحجم"
          value={element.size ?? "normal"}
          options={SIZE_OPTIONS}
          onChange={(size) => patch({ size })}
        />
        <Check
          label="عريض"
          checked={element.bold ?? false}
          onChange={(bold) => patch({ bold })}
        />
        <Check
          label="إخفاء عند الفراغ"
          checked={element.hideWhenEmpty !== false}
          onChange={(hideWhenEmpty) =>
            patch({ hideWhenEmpty })
          }
        />
        {position}
      </>
    );
  } else if (element.type === "field") {
    const used = new Set(
      template.elements.flatMap((entry) =>
        entry.type === "field" && entry.id !== element.id ? [entry.fieldId] : [],
      ),
    );
    body = (
      <>
        <SelectField
          label="الحقل"
          value={element.fieldId}
          options={spec.fields
            .filter((field) => field === element.fieldId || !used.has(field))
            .map((field) => ({ value: field, label: defaults.labels[field] ?? field }))}
          onChange={(fieldId) =>
            onCommit(changeField(template, element.id, fieldId, defaults.labels))
          }
        />
        <label className="block">
          <span className="text-[11px] text-base-content/60">التسمية</span>
          <input
            aria-label="التسمية"
            key={element.fieldId}
            defaultValue={template.labels[element.fieldId] ?? ""}
            className="input input-bordered input-sm w-full"
            onBlur={(event) => {
              const next = updateLabel(template, element.fieldId, event.target.value);
              if (next === template) {
                event.target.value = template.labels[element.fieldId] ?? "";
                return;
              }
              onCommit(next, { coalesceKey: `label:${element.fieldId}` });
            }}
          />
        </label>
        <SelectField
          label="المحاذاة"
          value={element.align ?? "right"}
          options={ALIGN_OPTIONS}
          onChange={(align) => patch({ align })}
        />
        <SelectField
          label="الحجم"
          value={element.size ?? "normal"}
          options={SIZE_OPTIONS}
          onChange={(size) => patch({ size })}
        />
        <Check
          label="عريض"
          checked={element.bold ?? false}
          onChange={(bold) => patch({ bold })}
        />
        <Check
          label="إخفاء عند الفراغ"
          checked={element.hideWhenEmpty !== false}
          onChange={(hideWhenEmpty) =>
            patch({ hideWhenEmpty })
          }
        />
        {position}
      </>
    );
  } else if (element.type === "logo") {
    body = (
      <>
        <SelectField
          label="المحاذاة"
          value={element.align ?? "center"}
          options={ALIGN_OPTIONS}
          onChange={(align) => patch({ align })}
        />
        <NumberField
          label="أقصى عرض"
          value={element.maxWidth ?? 256}
          min={64}
          max={384}
          onCommit={(maxWidth) => patch({ maxWidth })}
        />
        {position}
      </>
    );
  } else if (element.type === "qr") {
    body = (
      <>
        <NumberField
          label="حجم الرمز"
          value={element.sizePx}
          min={96}
          max={384}
          onCommit={(sizePx) => patch({ sizePx })}
        />
        {position}
      </>
    );
  } else if (element.type === "separator") {
    const candidates = template.elements.filter(
      (entry) => entry.type !== "separator" && entry.id !== element.id,
    );
    const refs = element.hideWhenEmptyOf ?? [];
    body = (
      <>
        <p className="text-[11px] text-base-content/60">
          يختفي الفاصل عندما تكون كل العناصر المختارة فارغة. اتركه بلا اختيار ليبقى ظاهراً.
        </p>
        {candidates.map((candidate) => (
          <Check
            key={candidate.id}
            label={`إخفاء عندما يكون ${elementLabel(candidate)} فارغاً`}
            checked={refs.includes(candidate.id)}
            onChange={(checked) =>
              onCommit(
                setSeparatorRefs(
                  template,
                  element.id,
                  checked
                    ? [...refs, candidate.id]
                    : refs.filter((ref) => ref !== candidate.id),
                ),
              )
            }
          />
        ))}
        {position}
      </>
    );
  } else if (element.type === "itemTable") {
    body = (
      <>
        <label className="block">
          <span className="text-[11px] text-base-content/60">العنوان</span>
          <input
            aria-label="عنوان الجدول"
            key={element.title ?? ""}
            defaultValue={element.title ?? ""}
            className="input input-bordered input-sm w-full"
            onBlur={(event) =>
              patch({ title: event.target.value }, `title:${element.id}`)
            }
          />
        </label>
        <Check
          label="رأس الجدول"
          checked={element.showHeader ?? true}
          onChange={(showHeader) => patch({ showHeader })}
        />
        <Check
          label="ملاحظات الأصناف"
          checked={element.showNotes ?? true}
          onChange={(showNotes) => patch({ showNotes })}
        />
        {columnsEditor(element.columns, (columns) =>
          patch({ columns }, `columns:${element.id}`),
        )}
        {position}
      </>
    );
  } else if (element.type === "section") {
    body = (
      <>
        <label className="block">
          <span className="text-[11px] text-base-content/60">العنوان</span>
          <input
            aria-label="عنوان القسم"
            key={element.title ?? ""}
            defaultValue={element.title ?? ""}
            className="input input-bordered input-sm w-full"
            onBlur={(event) =>
              patch({ title: event.target.value }, `title:${element.id}`)
            }
          />
        </label>
        {element.columns &&
          columnsEditor(element.columns, (columns) =>
            patch({ columns }, `columns:${element.id}`),
          )}
        {position}
      </>
    );
  } else {
    body = (
      <>
        <label className="block">
          <span className="text-[11px] text-base-content/60">التسمية</span>
          <input
            aria-label="تسمية الإجمالي"
            key={element.label}
            defaultValue={element.label}
            className="input input-bordered input-sm w-full"
            onBlur={(event) =>
              patch({ label: event.target.value }, `label:${element.id}`)
            }
          />
        </label>
        {position}
      </>
    );
  }

  const canDuplicate = element.type === "text" || element.type === "separator";

  return (
    <aside className="space-y-3 rounded-xl border border-base-300 p-4">
      <h3 className="text-sm font-bold">خصائص — {elementLabel(element)}</h3>
      {body}
      <div className="flex gap-2 border-t pt-3">
        {canDuplicate && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const next = duplicateElement(template, element.id);
              if (!next) return;
              onCommit(next);
              const added = next.elements.find(
                (entry) => !template.elements.some((old) => old.id === entry.id),
              );
              if (added) onSelect(added.id);
            }}
          >
            تكرار
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-error"
          onClick={() => {
            onCommit(removeElement(template, element.id));
            onSelect(null);
          }}
        >
          حذف
        </button>
      </div>
    </aside>
  );
}
