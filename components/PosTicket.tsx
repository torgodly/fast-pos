"use client";

import { useState, type ReactNode } from "react";
import { MessageSquareText, Minus, Plus, Trash2 } from "lucide-react";
import {
  KitchenNoteDialog,
  type KitchenNoteTarget,
} from "@/components/KitchenNoteDialog";
import { useDragScroll } from "@/components/useDragScroll";
import { formatMoney } from "@/lib/venues";

export type PosTicketLine = {
  key: string | number;
  name: string;
  qty: number;
  lineTotal: number;
  unitPrice?: number;
  kitchenSent?: number;
  canReduce?: boolean;
  canRemove?: boolean;
  note?: string | null;
};

export function PosTicketLines({
  lines,
  pending = false,
  emptyLabel = "فارغة",
  compact = false,
  onChangeQty,
  onRemove,
  onChangeNote,
}: {
  lines: PosTicketLine[];
  pending?: boolean;
  emptyLabel?: string;
  compact?: boolean;
  onChangeQty: (key: string | number, qty: number) => void;
  onRemove: (key: string | number) => void;
  onChangeNote?: (key: string | number, note: string) => void;
}) {
  const [noteTarget, setNoteTarget] = useState<KitchenNoteTarget | null>(null);

  if (lines.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-base-content/40">
        {emptyLabel}
      </p>
    );
  }

  const btn = compact ? "size-8" : "size-10";

  return (
    <>
      <ul className="divide-y divide-base-300/60">
        {lines.map((line) => {
          const kitchenSent = line.kitchenSent ?? 0;
          const canReduce = line.canReduce ?? line.qty > kitchenSent;
          const canRemove = line.canRemove ?? kitchenSent === 0;
          const hasNote = Boolean(line.note?.trim());

          return (
            <li
              key={line.key}
              className={`border-b border-base-300/70 ${compact ? "py-2" : "py-2.5"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-black leading-5 ${
                      compact ? "text-[13px]" : "text-sm"
                    }`}
                  >
                    {line.name}
                    {kitchenSent > 0 ? (
                      <span className="ms-1 text-[10px] font-bold text-warning">
                        مطبخ {kitchenSent}
                      </span>
                    ) : null}
                  </p>
                  {hasNote ? (
                    <p
                      className={`mt-1 rounded-lg bg-secondary/10 px-2 py-1 font-bold text-secondary ${
                        compact ? "text-[11px] leading-4" : "text-xs leading-5"
                      }`}
                    >
                      ملاحظة: {line.note}
                    </p>
                  ) : null}
                </div>
                <p
                  className={`shrink-0 font-black tabular-nums text-primary ${
                    compact ? "text-[12px]" : "text-sm"
                  }`}
                >
                  {formatMoney(line.lineTotal)}
                </p>
              </div>

              <div className="mt-2 flex items-center gap-1.5">
                <div className="inline-flex items-center overflow-hidden rounded-lg border border-base-300">
                  <button
                    type="button"
                    className={`grid place-items-center disabled:opacity-30 ${
                      compact ? "size-8" : btn
                    }`}
                    disabled={pending || !canReduce}
                    onClick={() => onChangeQty(line.key, line.qty - 1)}
                    aria-label="تقليل"
                  >
                    <Minus className="size-4" strokeWidth={2.5} />
                  </button>
                  <span
                    className={`min-w-7 text-center font-black tabular-nums ${
                      compact ? "text-sm" : "text-base"
                    }`}
                  >
                    {line.qty}
                  </span>
                  <button
                    type="button"
                    className={`grid place-items-center disabled:opacity-30 ${
                      compact ? "size-8" : btn
                    }`}
                    disabled={pending}
                    onClick={() => onChangeQty(line.key, line.qty + 1)}
                    aria-label="زيادة"
                  >
                    <Plus className="size-4" strokeWidth={2.5} />
                  </button>
                </div>

                {onChangeNote ? (
                  <button
                    type="button"
                    className={`btn btn-sm h-8 min-h-8 flex-1 gap-1.5 rounded-lg px-2 ${
                      hasNote
                        ? "btn-secondary"
                        : "btn-ghost border border-base-300"
                    }`}
                    disabled={pending}
                    onClick={() =>
                      setNoteTarget({
                        key: line.key,
                        name: line.name,
                        note: line.note,
                      })
                    }
                  >
                    <MessageSquareText className="size-3.5 shrink-0" />
                    <span className="truncate text-xs font-black">
                      {hasNote ? "تعديل ملاحظة" : "ملاحظة مطبخ"}
                    </span>
                  </button>
                ) : null}

                <button
                  type="button"
                  className={`grid place-items-center rounded-lg text-error hover:bg-error/10 disabled:opacity-20 ${
                    compact ? "size-8" : btn
                  }`}
                  disabled={pending || !canRemove}
                  onClick={() => onRemove(line.key)}
                  aria-label="حذف"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {onChangeNote ? (
        <KitchenNoteDialog
          target={noteTarget}
          pending={pending}
          onClose={() => setNoteTarget(null)}
          onSave={onChangeNote}
        />
      ) : null}
    </>
  );
}

export function PosTicketPanel({
  title,
  itemCount,
  total,
  lines,
  footer,
  pending,
  emptyLabel,
  compact = false,
  onChangeQty,
  onRemove,
  onChangeNote,
}: {
  title?: string;
  itemCount: number;
  total: number;
  lines: PosTicketLine[];
  footer?: ReactNode;
  pending?: boolean;
  emptyLabel?: string;
  compact?: boolean;
  onChangeQty: (key: string | number, qty: number) => void;
  onRemove: (key: string | number) => void;
  onChangeNote?: (key: string | number, note: string) => void;
}) {
  const listRef = useDragScroll<HTMLDivElement>("y");
  return (
    <aside className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border border-base-300 bg-base-100">
      <div className="flex shrink-0 items-center justify-between border-b border-base-300 px-2.5 py-1.5">
        <p className="text-sm font-black">
          {title ?? "فاتورة"}
          <span className="ms-1 font-bold text-base-content/40">
            ({itemCount})
          </span>
        </p>
        <p className="shrink-0 whitespace-nowrap text-base font-black tabular-nums text-primary">
          {formatMoney(total)}
        </p>
      </div>
      <div ref={listRef} className="touch-scroll px-1.5">
        <PosTicketLines
          lines={lines}
          pending={pending}
          emptyLabel={emptyLabel}
          compact={compact}
          onChangeQty={onChangeQty}
          onRemove={onRemove}
          onChangeNote={onChangeNote}
        />
      </div>
      <div
        className={`shrink-0 border-t border-base-300 ${
          compact ? "space-y-1 px-2 py-1.5" : "space-y-1.5 px-2.5 py-2"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-base-content/50">
            الإجمالي
          </span>
          <span
            className={`shrink-0 whitespace-nowrap font-black tabular-nums text-primary ${
              compact ? "text-base" : "text-lg"
            }`}
          >
            {formatMoney(total)}
          </span>
        </div>
        {footer}
      </div>
    </aside>
  );
}
