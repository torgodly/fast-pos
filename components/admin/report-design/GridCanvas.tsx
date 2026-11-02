"use client";

import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  elementsByRow,
  maxElementRow,
} from "@/lib/print/templates/elements";
import {
  moveElement,
  nudgeElement,
  removeElement,
  setElementVisible,
  type TemplateCommit,
} from "@/lib/print/templates/element-ops";
import { layoutTemplateV2 } from "@/lib/print/templates/layout-v2";
import type {
  DocumentData,
  LayoutLine,
  ReportTemplateV2,
  TemplateElement,
  TextSize,
} from "@/lib/print/templates/types";
import { ElementCard, type NudgeDirection } from "./ElementCard";

export const PAPER_WIDTH = 360;
export const ROW_HEIGHT = 56;

const TEXT_SIZE: Record<TextSize, number> = {
  small: 10,
  normal: 11,
  large: 13,
  xlarge: 15,
};

type GridCanvasProps = {
  template: ReportTemplateV2;
  data: DocumentData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCommit: TemplateCommit;
  onBlocked: (message: string) => void;
};

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return true;
  return target.isContentEditable || target.closest("[contenteditable]") !== null;
}

function PreviewLine({ line }: { line: LayoutLine }) {
  if (line.kind === "separator") {
    return <hr className="my-1 border-dashed border-neutral-400" />;
  }
  if (line.kind === "logo") {
    return <p className="text-center text-[10px] text-neutral-400">[شعار]</p>;
  }
  if (line.kind === "qr") {
    return <p className="text-center text-[10px] text-neutral-400">[رمز QR]</p>;
  }
  if (line.kind === "columns") {
    return (
      <div className="flex gap-1">
        {line.cells.map((cell, index) => (
          <span
            key={index}
            className="truncate"
            style={{
              flex: line.widths[index] ?? 1,
              textAlign: cell.align,
              fontWeight: cell.bold ? 800 : 400,
              fontSize: TEXT_SIZE[cell.size],
            }}
          >
            {cell.text}
          </span>
        ))}
      </div>
    );
  }
  return (
    <p
      style={{
        textAlign: line.align,
        fontWeight: line.bold ? 800 : 400,
        fontSize: TEXT_SIZE[line.size],
      }}
    >
      {line.text}
    </p>
  );
}

function previewFor(
  template: ReportTemplateV2,
  element: TemplateElement,
  data: DocumentData,
): string[] {
  if (element.type === "separator") return ["—".repeat(Math.min(30, element.width))];
  if (element.type === "logo") return ["[شعار]"];
  if (element.type === "qr") return ["[رمز QR]"];
  return layoutTemplateV2({ ...template, elements: [element] }, data)
    .map((line) => {
      if (line.kind === "text") return line.text;
      if (line.kind === "columns") return line.cells.map((cell) => cell.text).join("  ");
      return "";
    })
    .filter(Boolean);
}

export function GridCanvas({
  template,
  data,
  selectedId,
  onSelect,
  onCommit,
  onBlocked,
}: GridCanvasProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    row: number;
    col: number;
  } | null>(null);

  const paper = template.paper.columns;
  const rows = Math.max(16, maxElementRow(template.elements) + 3);
  const grouped = elementsByRow(template.elements);
  const preview = layoutTemplateV2(template, data);

  function startDrag(event: ReactPointerEvent<HTMLElement>, element: TemplateElement) {
    if (event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* jsdom has no pointer capture */
    }
    dragRef.current = {
      id: element.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      row: element.row,
      col: element.col,
    };
    setDraggingId(element.id);
    onSelect(element.id);
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDraggingId(null);
    if (event.type !== "pointerup") return;
    const width = gridRef.current?.getBoundingClientRect().width || PAPER_WIDTH;
    const cellWidth = width / paper;
    const rowEl = (event.currentTarget as HTMLElement | null)?.closest(
      "[data-row]",
    ) as HTMLElement | null;
    const rowHeight = rowEl?.getBoundingClientRect().height || ROW_HEIGHT;
    const col = drag.col + Math.round((event.clientX - drag.startX) / cellWidth);
    const row = drag.row + Math.round((event.clientY - drag.startY) / rowHeight);
    const next = moveElement(template, drag.id, row, col);
    if (next === template) {
      onBlocked("لا يمكن وضع العنصر هنا");
      return;
    }
    onCommit(next);
  }

  function nudge(id: string, direction: NudgeDirection) {
    const delta =
      direction === "up"
        ? [-1, 0]
        : direction === "down"
          ? [1, 0]
          : direction === "left"
            ? [0, -1]
            : [0, 1];
    onCommit(nudgeElement(template, id, delta[0]!, delta[1]!));
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!selectedId || isTextEntryTarget(event.target)) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onCommit(removeElement(template, selectedId));
      onSelect(null);
      return;
    }
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    onCommit(nudgeElement(template, selectedId, delta[0], delta[1]));
  }

  return (
    <div
      data-testid="grid-canvas"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={() => onSelect(null)}
      className="rounded-xl bg-white p-2 text-black outline-none"
    >
      <div
        className="mb-1 flex items-center justify-between gap-2"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="text-[11px] text-neutral-500">
          شبكة {paper} عموداً — {rows} صفاً
        </span>
        <button
          type="button"
          aria-label={showGrid ? "إخفاء الشبكة" : "إظهار الشبكة"}
          aria-pressed={showGrid}
          className="btn btn-sm btn-ghost"
          onClick={() => setShowGrid(!showGrid)}
        >
          {showGrid ? "إخفاء الشبكة" : "إظهار الشبكة"}
        </button>
      </div>
      <div data-testid="print-preview" className="mb-3 space-y-0.5 border-b pb-2" dir="rtl">
        {preview.map((line, index) => (
          <PreviewLine key={index} line={line} />
        ))}
      </div>
      <div className="space-y-0.5" dir="rtl">
        {Array.from({ length: rows }, (_, row) => (
          <div
            key={row}
            data-row={row}
            className={`min-h-8 py-0.5 ${
              showGrid ? "border-b border-dashed border-neutral-200" : ""
            }`}
          >
            <div
              ref={row === 0 ? gridRef : undefined}
              data-testid={row === 0 ? "grid-surface" : undefined}
              className="grid gap-0.5"
              style={{
                gridTemplateColumns: `repeat(${paper}, minmax(0, 1fr))`,
                backgroundImage: showGrid
                  ? "linear-gradient(to right, #f1f5f9 1px, transparent 1px)"
                  : undefined,
                backgroundSize: showGrid ? `${100 / paper}% 100%` : undefined,
              }}
            >
              {(grouped.get(row) ?? []).map((element) => (
                <ElementCard
                  key={element.id}
                  element={element}
                  preview={previewFor(template, element, data)}
                  selected={element.id === selectedId}
                  dragging={element.id === draggingId}
                  style={{ gridColumn: `${element.col + 1} / span ${element.width}` }}
                  onSelect={() => onSelect(element.id)}
                  onToggleVisible={() =>
                    onCommit(setElementVisible(template, element.id, !element.visible))
                  }
                  onNudge={(direction) => nudge(element.id, direction)}
                  onDelete={() => {
                    onCommit(removeElement(template, element.id));
                    onSelect(null);
                  }}
                  onDragStart={(event) => startDrag(event, element)}
                  onDragEnd={endDrag}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
