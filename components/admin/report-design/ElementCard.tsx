"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  Trash2,
} from "lucide-react";
import type { TemplateElement } from "@/lib/print/templates/types";
import { QrBox } from "./QrBox";

export type NudgeDirection = "up" | "down" | "left" | "right";

export function elementLabel(element: TemplateElement): string {
  if (element.type === "text") return element.text.trim() || "نص";
  if (element.type === "field") return element.fieldId;
  if (element.type === "logo") return "شعار";
  if (element.type === "qr") return "رمز QR";
  if (element.type === "separator") return "فاصل";
  if (element.type === "itemTable") return element.title?.trim() || "جدول الأصناف";
  if (element.type === "section") return element.title?.trim() || element.sectionId;
  return element.label.trim() || "الإجمالي";
}

type ElementCardProps = {
  element: TemplateElement;
  preview: string[];
  selected: boolean;
  dragging: boolean;
  style: CSSProperties;
  onSelect: () => void;
  onToggleVisible: () => void;
  onNudge: (direction: NudgeDirection) => void;
  onDelete: () => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onDragEnd: (event: ReactPointerEvent<HTMLElement>) => void;
};

export function ElementCard({
  element,
  preview,
  selected,
  dragging,
  style,
  onSelect,
  onToggleVisible,
  onNudge,
  onDelete,
  onDragStart,
  onDragEnd,
}: ElementCardProps) {
  const label = elementLabel(element);
  return (
    <article
      data-element-id={element.id}
      role="group"
      tabIndex={0}
      aria-label={label}
      aria-selected={selected}
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={`min-w-0 rounded-lg border-2 bg-white p-1 text-black ${
        selected ? "border-primary" : "border-neutral-200"
      } ${dragging ? "opacity-60" : ""} ${element.visible ? "" : "opacity-45"}`}
    >
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={`اسحب ${label}`}
          className="btn btn-ghost size-10 cursor-grab touch-none select-none p-0"
          onPointerDown={onDragStart}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          onLostPointerCapture={onDragEnd}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold">
          {label}
        </span>
        <button
          type="button"
          aria-label={element.visible ? `إخفاء ${label}` : `إظهار ${label}`}
          className="btn btn-sm btn-ghost"
          onClick={(event) => {
            event.stopPropagation();
            onToggleVisible();
          }}
        >
          {element.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
      </div>

      {selected && (
        <div className="flex items-center justify-center gap-0.5">
          <button type="button" aria-label="يسار" className="btn btn-ghost size-10 p-0" onClick={(event) => { event.stopPropagation(); onNudge("left"); }}>
            <ArrowLeft className="size-4" />
          </button>
          <button type="button" aria-label="أعلى" className="btn btn-ghost size-10 p-0" onClick={(event) => { event.stopPropagation(); onNudge("up"); }}>
            <ArrowUp className="size-4" />
          </button>
          <button type="button" aria-label="أسفل" className="btn btn-ghost size-10 p-0" onClick={(event) => { event.stopPropagation(); onNudge("down"); }}>
            <ArrowDown className="size-4" />
          </button>
          <button type="button" aria-label="يمين" className="btn btn-ghost size-10 p-0" onClick={(event) => { event.stopPropagation(); onNudge("right"); }}>
            <ArrowRight className="size-4" />
          </button>
          <button type="button" aria-label="حذف العنصر" className="btn btn-ghost size-10 p-0 text-error" onClick={(event) => { event.stopPropagation(); onDelete(); }}>
            <Trash2 className="size-4" />
          </button>
        </div>
      )}

      <div className="mt-1 space-y-0.5 text-[11px]">
        {element.type === "qr" ? (
          <QrBox />
        ) : element.type === "logo" ? (
          <p className="text-center text-neutral-400">[شعار]</p>
        ) : preview.length > 0 ? (
          preview.slice(0, 3).map((line, index) => (
            <p key={index} className="truncate">{line}</p>
          ))
        ) : (
          <p className="rounded border border-dashed border-neutral-300 p-1 text-center text-neutral-400">
            لا يظهر في العينة
          </p>
        )}
      </div>
    </article>
  );
}
