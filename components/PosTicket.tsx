"use client";

import type { ReactNode } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
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
};

export function PosTicketLines({
  lines,
  pending = false,
  emptyLabel = "فارغة",
  compact = false,
  onChangeQty,
  onRemove,
}: {
  lines: PosTicketLine[];
  pending?: boolean;
  emptyLabel?: string;
  compact?: boolean;
  onChangeQty: (key: string | number, qty: number) => void;
  onRemove: (key: string | number) => void;
}) {
  if (lines.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-base-content/40">
        {emptyLabel}
      </p>
    );
  }

  const btn = compact ? "size-8" : "size-10";

  return (
    <ul className="divide-y divide-base-300/60">
      {lines.map((line) => {
        const kitchenSent = line.kitchenSent ?? 0;
        const canReduce = line.canReduce ?? line.qty > kitchenSent;
        const canRemove = line.canRemove ?? kitchenSent === 0;
        if (compact) {
          return (
            <li key={line.key} className="border-b border-base-300/70 py-1.5">
              <div className="flex items-start justify-between gap-1">
                <p className="min-w-0 text-[13px] font-black leading-4">
                  {line.name}
                  {kitchenSent > 0 ? (
                    <span className="ms-1 text-[10px] font-bold text-warning">
                      مطبخ {kitchenSent}
                    </span>
                  ) : null}
                </p>
                <p className="shrink-0 text-[12px] font-black tabular-nums text-primary">
                  {formatMoney(line.lineTotal)}
                </p>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="inline-flex items-center overflow-hidden rounded-md border border-base-300">
                  <button
                    type="button"
                    className="grid size-7 place-items-center disabled:opacity-30"
                    disabled={pending || !canReduce}
                    onClick={() => onChangeQty(line.key, line.qty - 1)}
                    aria-label="تقليل"
                  >
                    <Minus className="size-3.5" strokeWidth={2.5} />
                  </button>
                  <span className="min-w-6 text-center text-sm font-black tabular-nums">
                    {line.qty}
                  </span>
                  <button
                    type="button"
                    className="grid size-7 place-items-center disabled:opacity-30"
                    disabled={pending}
                    onClick={() => onChangeQty(line.key, line.qty + 1)}
                    aria-label="زيادة"
                  >
                    <Plus className="size-3.5" strokeWidth={2.5} />
                  </button>
                </div>
                <button
                  type="button"
                  className="grid size-7 place-items-center rounded-md text-error disabled:opacity-20"
                  disabled={pending || !canRemove}
                  onClick={() => onRemove(line.key)}
                  aria-label="حذف"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          );
        }
        return (
          <li
            key={line.key}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-1 py-1.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-5">
                {line.name}
                {kitchenSent > 0 ? (
                  <span className="ms-1 text-xs font-bold text-warning">
                    مطبخ {kitchenSent}
                  </span>
                ) : null}
              </p>
            </div>
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-base-300">
              <button
                type="button"
                className={`grid ${btn} place-items-center text-base-content/70 disabled:opacity-30`}
                disabled={pending || !canReduce}
                onClick={() => onChangeQty(line.key, line.qty - 1)}
                aria-label="تقليل"
              >
                <Minus className="size-4" strokeWidth={2.5} />
              </button>
              <span className="min-w-8 px-0.5 text-center text-base font-black tabular-nums">
                {line.qty}
              </span>
              <button
                type="button"
                className={`grid ${btn} place-items-center text-base-content/70 disabled:opacity-30`}
                disabled={pending}
                onClick={() => onChangeQty(line.key, line.qty + 1)}
                aria-label="زيادة"
              >
                <Plus className="size-4" strokeWidth={2.5} />
              </button>
            </div>
            <p className="min-w-[4.75rem] shrink-0 whitespace-nowrap text-end text-sm font-black tabular-nums text-primary">
              {formatMoney(line.lineTotal)}
            </p>
            <button
              type="button"
              className={`grid ${btn} place-items-center rounded-lg text-error hover:bg-error/10 disabled:opacity-20`}
              disabled={pending || !canRemove}
              onClick={() => onRemove(line.key)}
              aria-label="حذف"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        );
      })}
    </ul>
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
