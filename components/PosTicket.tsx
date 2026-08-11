"use client";

import type { ReactNode } from "react";
import { Minus, Plus, Trash2, X } from "lucide-react";
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
        return (
          <li
            key={line.key}
            className={`grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-1 ${
              compact ? "py-1" : "py-1.5"
            }`}
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
      <div className="shrink-0 space-y-1.5 border-t border-base-300 px-2.5 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-base-content/50">
            الإجمالي
          </span>
          <span className="shrink-0 whitespace-nowrap text-lg font-black tabular-nums text-primary">
            {formatMoney(total)}
          </span>
        </div>
        {footer}
      </div>
    </aside>
  );
}

export function PosMobileBar({
  itemCount,
  total,
  actionLabel,
  onOpen,
}: {
  itemCount: number;
  total: number;
  actionLabel: string;
  onOpen: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-base-300 bg-base-100 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 lg:hidden">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-12 w-full items-center justify-between rounded-lg bg-primary px-3 text-primary-content"
      >
        <span className="text-sm font-bold">
          {itemCount} · {formatMoney(total)}
        </span>
        <span className="text-sm font-black">{actionLabel}</span>
      </button>
    </div>
  );
}

export function PosMobileSheet({
  open,
  title,
  itemCount,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  itemCount: number;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-neutral/40"
        aria-label="إغلاق"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-hidden border-t border-base-300 bg-base-100">
        <div className="flex shrink-0 items-center justify-between border-b border-base-300 px-2 py-1.5">
          <p className="text-xs font-black">
            {title}{" "}
            <span className="text-base-content/40">({itemCount})</span>
          </p>
          <button
            type="button"
            className="grid size-7 place-items-center"
            onClick={onClose}
            aria-label="إغلاق"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="touch-scroll min-h-0 flex-1 px-1.5">{children}</div>
        <div className="shrink-0 space-y-1.5 border-t border-base-300 px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {footer}
        </div>
      </div>
    </div>
  );
}
