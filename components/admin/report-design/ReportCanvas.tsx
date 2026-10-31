"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  blockVisible,
  moveBlock,
  orderedBlockIds,
  type BlockId,
  type TemplateCommit,
} from "@/lib/print/templates/blocks";
import type { DocumentData, ReportTemplate } from "@/lib/print/templates/types";
import { CanvasBlock } from "./CanvasBlock";

type ReportCanvasProps = {
  template: ReportTemplate;
  data: DocumentData;
  selected: BlockId | null;
  onSelect: (id: BlockId) => void;
  onCommit: TemplateCommit;
};

type DragState = {
  id: BlockId;
  pointerId: number;
  startY: number;
  moved: boolean;
  rects: Array<{ id: BlockId; mid: number }>;
};

export function ReportCanvas({
  template,
  data,
  selected,
  onSelect,
  onCommit,
}: ReportCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragId, setDragId] = useState<BlockId | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const order = orderedBlockIds(template);
  const rest = dragId ? order.filter((entry) => entry !== dragId) : order;
  const anyVisible = order.some((id) => blockVisible(template, id));

  function beginDrag(id: BlockId, event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const cards = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>("[data-block-id]") ??
        [],
    );
    const rects = cards
      .map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          id: card.dataset.blockId as BlockId,
          mid: rect.top + rect.height / 2,
        };
      })
      .filter((entry) => entry.id !== id);
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startY: event.clientY,
      moved: false,
      rects,
    };
    setDragId(id);
    setDropIndex(null);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* jsdom has no pointer capture */
    }
  }

  useEffect(() => {
    if (!dragId) return;
    // Clearing the drag never commits; pointerup is the only committing path.
    function clearDrag() {
      dragRef.current = null;
      setDragId(null);
      setDropIndex(null);
    }
    function onMove(event: PointerEvent) {
      const state = dragRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (!state.moved) {
        if (Math.abs(event.clientY - state.startY) < 4) return;
        state.moved = true;
      }
      let index = state.rects.length;
      for (let position = 0; position < state.rects.length; position += 1) {
        if (event.clientY < state.rects[position]!.mid) {
          index = position;
          break;
        }
      }
      setDropIndex(index);
    }
    function onUp(event: PointerEvent) {
      const state = dragRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (state.moved && dropIndex !== null) {
        onCommit(moveBlock(template, state.id, dropIndex));
      }
      clearDrag();
    }
    // Touch browsers cancel the pointer when a page/scroll gesture wins, so a
    // cancel (or a lost capture) must abort instead of committing the last
    // computed drop index.
    function onAbort(event: PointerEvent) {
      const state = dragRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      clearDrag();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      clearDrag();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onAbort);
    window.addEventListener("lostpointercapture", onAbort);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onAbort);
      window.removeEventListener("lostpointercapture", onAbort);
      window.removeEventListener("keydown", onKey);
    };
  }, [dragId, dropIndex, template, onCommit]);

  return (
    <div className="overflow-x-auto py-2">
      <div
        ref={containerRef}
        dir="rtl"
        className="mx-auto flex w-[360px] flex-col gap-1 rounded-xl border border-dotted border-neutral-300 bg-white p-3 text-black shadow"
      >
        {!anyVisible && (
          <p className="py-6 text-center text-[11px] text-neutral-400">
            كل المكوّنات مخفية — لن يظهر شيء في الطباعة.
          </p>
        )}
        {order.map((id) => {
          const restIndex = rest.indexOf(id);
          return (
            <Fragment key={id}>
              {dropIndex !== null && restIndex === dropIndex && (
                <div className="h-1 rounded bg-primary" data-drop-line />
              )}
              <CanvasBlock
                id={id}
                template={template}
                data={data}
                selected={selected === id}
                dragging={dragId === id}
                canMoveUp={order.indexOf(id) > 0}
                canMoveDown={order.indexOf(id) < order.length - 1}
                onSelect={() => onSelect(id)}
                onCommit={onCommit}
                onDragPointerDown={(event) => beginDrag(id, event)}
                onMove={(direction) => {
                  const from = order.indexOf(id);
                  onCommit(moveBlock(template, id, from + direction));
                }}
              />
            </Fragment>
          );
        })}
        {dropIndex !== null && dropIndex === rest.length && (
          <div className="h-1 rounded bg-primary" data-drop-line />
        )}
      </div>
    </div>
  );
}
