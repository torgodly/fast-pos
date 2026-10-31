"use client";

import {
  Fragment,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  Plus,
} from "lucide-react";
import {
  addFooterLine,
  addHeaderLine,
  blockLabel,
  blockVisible,
  MAX_LINES,
  resizeColumns,
  setBlockVisible,
  type BlockId,
  type TemplateCommit,
} from "@/lib/print/templates/blocks";
import {
  expandPlaceholders,
  layoutTemplate,
  tableWidths,
} from "@/lib/print/templates/layout";
import { DOCUMENT_SPECS } from "@/lib/print/templates/document-specs";
import type {
  DocumentData,
  LayoutLine,
  ReportTemplate,
  TemplateColumn,
  TemplateLine,
} from "@/lib/print/templates/types";
import { CanvasLines, TEXT_SIZE } from "./CanvasLines";

export const PAPER_WIDTH = 360;

type Editing =
  | { kind: "header" | "footer"; index: number }
  | { kind: "section" }
  | null;

type CanvasBlockProps = {
  id: BlockId;
  template: ReportTemplate;
  data: DocumentData;
  selected: boolean;
  dragging: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSelect: () => void;
  onCommit: TemplateCommit;
  onDragPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onMove: (direction: -1 | 1) => void;
};

function clone(template: ReportTemplate): ReportTemplate {
  return JSON.parse(JSON.stringify(template)) as ReportTemplate;
}

function previewTemplate(
  template: ReportTemplate,
  id: BlockId,
): ReportTemplate {
  return {
    ...template,
    order: [id],
    header: { ...template.header, show: id === "header" },
    fields: { ...template.fields, visible: id === "fields" },
    items: { ...template.items, show: id === "items" },
    summary: { ...template.summary, show: id === "summary" },
    footer: { ...template.footer, show: id === "footer" },
    sections: template.sections.map((section) => ({
      ...section,
      show: `section:${section.id}` === id,
    })),
  };
}

/**
 * `resizeColumns` returns the resized column list, so the canvas must write it
 * back into the block that owns it (the items table or a table section) before
 * committing a full template.
 */
function applyColumns(
  template: ReportTemplate,
  id: BlockId,
  columns: TemplateColumn[],
): ReportTemplate {
  if (id === "items") {
    return { ...template, items: { ...template.items, columns } };
  }
  if (!id.startsWith("section:")) return template;
  const sectionId = id.slice("section:".length);
  return {
    ...template,
    sections: template.sections.map((section) =>
      section.id === sectionId ? { ...section, columns } : section,
    ),
  };
}

function lineStyle(line: TemplateLine): CSSProperties {
  return {
    textAlign: line.align ?? "right",
    fontWeight: line.bold ? 800 : 400,
    fontSize: TEXT_SIZE[line.size ?? "normal"],
  };
}

export function CanvasBlock({
  id,
  template,
  data,
  selected,
  dragging,
  canMoveUp,
  canMoveDown,
  onSelect,
  onCommit,
  onDragPointerDown,
  onMove,
}: CanvasBlockProps) {
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState("");
  const cancelRef = useRef(false);
  const resizeRef = useRef<{
    pointerId: number;
    x: number;
    index: number;
    widths: number[];
  } | null>(null);

  const visible = blockVisible(template, id);
  const label = blockLabel(template, id);
  const spec = DOCUMENT_SPECS[template.document];
  // The eye must respect document capability exactly like the inspector:
  // `items.show: true` without item columns and `summary.show: true` where the
  // summary is not allowed both fail validation, producing an unsavable
  // template.
  const itemsBlocked = id === "items" && spec.itemColumns.length === 0;
  const summaryBlocked = id === "summary" && !spec.summaryAllowed;
  const capabilityHint = itemsBlocked
    ? "هذا التقرير لا يحتوي على جدول أصناف."
    : summaryBlocked
      ? "هذا التقرير لا يحتوي على إجمالي."
      : null;
  const section = template.sections.find(
    (entry) => `section:${entry.id}` === id,
  );
  const isHeader = id === "header";
  const isFooter = id === "footer";
  const editableLines: TemplateLine[] = isHeader
    ? template.header.lines
    : isFooter
      ? template.footer.lines
      : [];
  const preview = previewTemplate(template, id);
  const sectionPreview: ReportTemplate = section
    ? {
        ...preview,
        sections: preview.sections.map((entry) =>
          entry.id === section.id ? { ...entry, title: "" } : entry,
        ),
      }
    : preview;
  const lines: LayoutLine[] = layoutTemplate(
    section ? sectionPreview : preview,
    data,
  );
  const columns: TemplateColumn[] =
    id === "items" ? template.items.columns : (section?.columns ?? []);
  const widths =
    columns.length > 0 ? tableWidths(columns, template.paper.columns) : [];

  const hasContent = isHeader
    ? (template.header.logo.show && data.logoAvailable) ||
      editableLines.some((line) => expandPlaceholders(line.text, data))
    : isFooter
      ? editableLines.some((line) => expandPlaceholders(line.text, data))
      : lines.length > 0 || Boolean(section?.title.trim());

  function startLineEdit(kind: "header" | "footer", index: number) {
    const line =
      kind === "header"
        ? template.header.lines[index]
        : template.footer.lines[index];
    if (!line) return;
    setDraft(line.text);
    cancelRef.current = false;
    setEditing({ kind, index });
  }

  function startSectionEdit() {
    if (!section) return;
    setDraft(section.title);
    cancelRef.current = false;
    setEditing({ kind: "section" });
  }

  function finishEdit(text: string) {
    if (!editing) return;
    if (editing.kind === "section") {
      if (!section) {
        setEditing(null);
        return;
      }
      const next = clone(template);
      const target = next.sections.find((entry) => entry.id === section.id);
      if (target) target.title = text;
      setEditing(null);
      onCommit(next);
      return;
    }
    const next = clone(template);
    if (editing.kind === "header") {
      next.header.lines[editing.index] = {
        ...next.header.lines[editing.index]!,
        text,
      };
    } else {
      next.footer.lines[editing.index] = {
        ...next.footer.lines[editing.index]!,
        text,
      };
    }
    setEditing(null);
    onCommit(next);
  }

  function shiftWidths(index: number, delta: number, base: number[]): number[] {
    const next = [...base];
    const leftMin = columns[index]!.label.length + 1;
    const rightMin = columns[index + 1]!.label.length + 1;
    const grow = Math.max(0, next[index + 1]! - rightMin);
    const shrink = Math.max(0, next[index]! - leftMin);
    const applied = Math.max(-shrink, Math.min(grow, delta));
    next[index] = next[index]! + applied;
    next[index + 1] = next[index + 1]! - applied;
    return next;
  }

  function sameWidths(left: number[], right: number[]): boolean {
    return (
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }

  function resizeBy(index: number, delta: number) {
    const target = shiftWidths(index, delta, widths);
    // A boundary step is a no-op: committing it would store nothing new and
    // push an empty entry onto the undo history.
    if (sameWidths(target, widths)) return;
    onCommit(
      applyColumns(
        template,
        id,
        resizeColumns(columns, target, template.paper.columns),
      ),
      { coalesceKey: `resize:${id}:${index}` },
    );
  }

  /** Ends a pointer resize without committing anything further. */
  function endResize(pointerId: number) {
    if (resizeRef.current?.pointerId === pointerId) resizeRef.current = null;
  }

  function editInput(ariaLabel: string, className: string) {
    return (
      <input
        autoFocus
        aria-label={ariaLabel}
        dir="rtl"
        className={className}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            finishEdit(draft);
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancelRef.current = true;
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (cancelRef.current) {
            cancelRef.current = false;
            setEditing(null);
            return;
          }
          finishEdit(draft);
        }}
      />
    );
  }

  return (
    <section
      data-block-id={id}
      role="group"
      aria-label={label}
      aria-selected={selected}
      onClick={onSelect}
      className={`rounded-lg border-2 bg-white p-2 text-black transition ${
        selected ? "border-primary" : "border-transparent"
      } ${dragging ? "opacity-60" : ""} ${visible ? "" : "opacity-45"}`}
    >
      <div
        className="mb-1 flex flex-wrap items-center gap-1"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label={`اسحب لتحريك ${label}`}
          className="btn btn-sm btn-ghost cursor-grab touch-none select-none"
          onPointerDown={onDragPointerDown}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`تحريك ${label} لأعلى`}
          className="btn btn-ghost"
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
        >
          <ArrowUp className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`تحريك ${label} لأسفل`}
          className="btn btn-ghost"
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
        >
          <ArrowDown className="size-4" />
        </button>
        <button
          type="button"
          aria-label={visible ? `إخفاء ${label}` : `إظهار ${label}`}
          className="btn btn-sm btn-ghost"
          disabled={Boolean(capabilityHint)}
          onClick={() => onCommit(setBlockVisible(template, id, !visible))}
        >
          {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
        {(isHeader || isFooter ? editableLines.length > 0 : Boolean(section)) && (
          <button
            type="button"
            aria-label={`تعديل النص — ${label}`}
            className="btn btn-sm btn-ghost"
            onClick={() => {
              if (isHeader) startLineEdit("header", 0);
              else if (isFooter) startLineEdit("footer", 0);
              else startSectionEdit();
            }}
          >
            <Pencil className="size-4" />
          </button>
        )}
        {(isHeader || isFooter) && (
          <button
            type="button"
            aria-label={`إضافة سطر إلى ${label}`}
            className="btn btn-sm btn-ghost"
            disabled={editableLines.length >= MAX_LINES}
            onClick={() =>
              onCommit(
                isHeader ? addHeaderLine(template) : addFooterLine(template),
              )
            }
          >
            <Plus className="size-4" />
          </button>
        )}
        {(isHeader || isFooter) && editableLines.length >= MAX_LINES && (
          <span className="text-[10px] text-neutral-400">
            الحد الأقصى 6 أسطر
          </span>
        )}
      </div>

      {capabilityHint && (
        <p className="mb-1 text-[11px] text-neutral-400">{capabilityHint}</p>
      )}

      {(isHeader || isFooter) && (
        <>
          {isHeader && template.header.logo.show && data.logoAvailable && (
            <div className="my-1 text-center text-[10px] text-neutral-400">
              [شعار]
            </div>
          )}
          {editableLines.map((line, index) => {
            const kind = isHeader ? "header" : "footer";
            const text = expandPlaceholders(line.text, data);
            if (editing?.kind === kind && editing.index === index) {
              return (
                <Fragment key={index}>
                  {editInput(
                    `نص السطر ${index + 1}`,
                    "w-full rounded border border-primary bg-white px-1 text-black",
                  )}
                </Fragment>
              );
            }
            if (!text) {
              return (
                <button
                  key={index}
                  type="button"
                  className="block w-full text-right text-[11px] text-neutral-400"
                  onDoubleClick={() => startLineEdit(kind, index)}
                  onClick={(event) => {
                    event.stopPropagation();
                    startLineEdit(kind, index);
                  }}
                >
                  (سطر فارغ — اضغط للتعديل)
                </button>
              );
            }
            return (
              <p
                key={index}
                style={lineStyle(line)}
                onDoubleClick={() => startLineEdit(kind, index)}
              >
                {text}
              </p>
            );
          })}
        </>
      )}

      {section && (
        <>
          {editing?.kind === "section"
            ? editInput(
                "عنوان القسم",
                "w-full rounded border border-primary bg-white px-1 font-bold text-black",
              )
            : (
                <p className="font-bold" onDoubleClick={startSectionEdit}>
                  {section.title.trim() || (
                    <span className="text-[11px] font-normal text-neutral-400">
                      (بلا عنوان — اضغط للتعديل)
                    </span>
                  )}
                </p>
              )}
        </>
      )}

      {!isHeader && !isFooter && <CanvasLines lines={lines} />}

      {!hasContent && (
        <p className="py-1 text-center text-[11px] text-neutral-400">
          لن يظهر في هذه المعاينة
        </p>
      )}

      {columns.length > 1 && (
        <div
          className="mt-2 flex flex-wrap items-center justify-center gap-1"
          dir="rtl"
        >
          {columns.map((column, index) => (
            <Fragment key={column.key}>
              <span className="rounded bg-neutral-100 px-1 text-[10px] text-neutral-500">
                {column.label}
              </span>
              {index < columns.length - 1 && (
                <button
                  type="button"
                  aria-label={`تغيير عرض العمود ${column.label}`}
                  className="btn btn-sm btn-ghost touch-none select-none px-1 text-neutral-500"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (event.button !== 0) return;
                    try {
                      event.currentTarget.setPointerCapture(event.pointerId);
                    } catch {
                      /* jsdom has no pointer capture */
                    }
                    resizeRef.current = {
                      pointerId: event.pointerId,
                      x: event.clientX,
                      index,
                      widths: [...widths],
                    };
                  }}
                  onPointerMove={(event) => {
                    const start = resizeRef.current;
                    if (!start || start.pointerId !== event.pointerId) return;
                    const delta = Math.round(
                      ((event.clientX - start.x) * template.paper.columns) /
                        PAPER_WIDTH,
                    );
                    const target = shiftWidths(start.index, delta, start.widths);
                    if (sameWidths(target, widths)) return;
                    onCommit(
                      applyColumns(
                        template,
                        id,
                        resizeColumns(
                          columns,
                          target,
                          template.paper.columns,
                        ),
                      ),
                      { coalesceKey: `resize:${id}:${start.index}` },
                    );
                  }}
                  onPointerUp={(event) => {
                    endResize(event.pointerId);
                  }}
                  onPointerCancel={(event) => {
                    endResize(event.pointerId);
                  }}
                  onLostPointerCapture={(event) => {
                    endResize(event.pointerId);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key !== "ArrowLeft" &&
                      event.key !== "ArrowRight"
                    ) {
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    resizeBy(index, event.key === "ArrowRight" ? 1 : -1);
                  }}
                >
                  <Columns3 className="size-3" />
                </button>
              )}
            </Fragment>
          ))}
        </div>
      )}
    </section>
  );
}
