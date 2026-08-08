"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  ChevronUp,
  Minus,
  Plus,
  ReceiptText,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import {
  addItemToOrder,
  removeOrderItem,
  updateOrderItemQty,
} from "@/app/actions/orders";
import {
  CategoryItemPicker,
  type MenuCategory,
  type MenuItem,
} from "@/components/CategoryItemPicker";
import { formatMoney } from "@/lib/venues";

type Category = MenuCategory;
type Item = MenuItem;
type Line = {
  id: number;
  itemId: number | null;
  itemName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  kitchenSentQty?: number | null;
};

export function OrderMenu({
  orderId,
  categories,
  items,
  lines,
  total,
  footer,
}: {
  orderId: number;
  categories: Category[];
  items: Item[];
  lines: Line[];
  total: number;
  footer?: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [cartOpen, setCartOpen] = useState(false);

  const itemCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.qty, 0),
    [lines],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const cat of categories) counts[cat.id] = 0;
    const itemById = new Map(items.map((item) => [item.id, item]));
    for (const line of lines) {
      if (line.itemId == null) continue;
      const item = itemById.get(line.itemId);
      if (item) {
        counts[item.categoryId] = (counts[item.categoryId] ?? 0) + line.qty;
      }
    }
    return counts;
  }, [lines, items, categories]);

  function add(itemId: number) {
    startTransition(async () => {
      await addItemToOrder(orderId, itemId);
    });
  }

  function changeQty(lineId: number, qty: number) {
    startTransition(async () => {
      await updateOrderItemQty(lineId, qty);
    });
  }

  function remove(lineId: number) {
    startTransition(async () => {
      await removeOrderItem(lineId);
    });
  }

  const cartItems = (
    <ul className="divide-y divide-base-300/70">
      {lines.map((line) => {
        const kitchenSent = line.kitchenSentQty ?? 0;
        const locked = kitchenSent > 0;
        const canReduce = line.qty > kitchenSent;
        return (
          <li key={line.id} className="flex items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black leading-5">
                {line.itemName}
              </p>
              {locked ? (
                <p className="text-[11px] font-bold text-warning">
                  مطبخ {kitchenSent}
                </p>
              ) : (
                <p className="text-[11px] text-base-content/40">
                  {formatMoney(line.unitPrice)}
                </p>
              )}
            </div>
            <div className="join shrink-0">
              <button
                type="button"
                className="btn join-item btn-xs btn-square h-9 min-h-9 w-9"
                disabled={pending || !canReduce}
                onClick={() => changeQty(line.id, line.qty - 1)}
                aria-label="تقليل الكمية"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="join-item grid h-9 w-8 place-items-center border-y border-base-300 bg-base-100 text-xs font-black">
                {line.qty}
              </span>
              <button
                type="button"
                className="btn join-item btn-xs btn-square h-9 min-h-9 w-9"
                disabled={pending}
                onClick={() => changeQty(line.id, line.qty + 1)}
                aria-label="زيادة الكمية"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            <p className="w-16 shrink-0 text-end text-sm font-black text-primary">
              {formatMoney(line.lineTotal)}
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-square h-9 w-9 text-error"
              disabled={pending || locked}
              onClick={() => remove(line.id)}
              aria-label="حذف الصنف"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        );
      })}
      {lines.length === 0 && (
        <li className="py-10 text-center">
          <ShoppingBag className="mx-auto mb-2 size-6 text-base-content/20" />
          <p className="text-sm font-bold">الفاتورة فارغة</p>
          <p className="text-xs text-base-content/40">اختر صنفاً من القائمة</p>
        </li>
      )}
    </ul>
  );

  const cartFooter = (
    <>
      <div className="flex items-end justify-between gap-3 border-t border-dashed border-base-300 pt-3">
        <p className="text-sm font-bold text-base-content/55">الإجمالي</p>
        <span className="text-2xl font-black text-primary">
          {formatMoney(total)}
        </span>
      </div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </>
  );

  return (
    <>
      <div className="grid flex-1 gap-3 pb-24 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,30%)] lg:pb-0 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,28%)]">
        <div className="min-w-0 rounded-2xl border border-base-300/70 bg-base-100 p-3 sm:p-4">
          <CategoryItemPicker
            categories={categories}
            items={items}
            categoryCounts={categoryCounts}
            pending={pending}
            onAddItem={(item) => add(item.id)}
          />
        </div>

        <aside className="sticky top-14 hidden max-h-[calc(100dvh-4.5rem)] overflow-hidden rounded-2xl border border-base-300/70 bg-base-100 lg:flex lg:flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-base-300/60 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <ReceiptText className="size-4 text-primary" />
              <div>
                <h3 className="text-sm font-black">الفاتورة</h3>
                <p className="text-[11px] text-base-content/40">
                  {itemCount} عنصر
                </p>
              </div>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-3">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {cartItems}
            </div>
            <div className="shrink-0 bg-base-100 pb-3 pt-1">{cartFooter}</div>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-base-300/70 bg-base-100/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgb(15_23_42_/_0.12)] backdrop-blur-xl lg:hidden">
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="flex min-h-14 w-full touch-manipulation items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-content shadow-lg shadow-primary/20 md:mx-auto md:max-w-2xl"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-white/15">
              <ShoppingBag className="size-5" />
            </span>
            <span className="text-right">
              <span className="block text-xs text-primary-content/70">
                {itemCount} عنصر في الفاتورة
              </span>
              <span className="block text-lg font-black">
                {formatMoney(total)}
              </span>
            </span>
          </span>
          <span className="flex items-center gap-1 text-sm font-bold">
            عرض
            <ChevronUp className="size-4" />
          </span>
        </button>
      </div>

      {cartOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-neutral/45 backdrop-blur-[2px]"
            aria-label="إغلاق الفاتورة"
            onClick={() => setCartOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[min(88dvh,100%)] flex-col overflow-hidden rounded-t-3xl bg-base-100 shadow-2xl md:left-1/2 md:right-auto md:w-full md:max-w-2xl md:-translate-x-1/2">
            <div className="flex shrink-0 items-center justify-between border-b border-base-300/60 px-4 py-3">
              <div>
                <p className="font-black">الفاتورة</p>
                <p className="text-xs text-base-content/45">{itemCount} عنصر</p>
              </div>
              <button
                type="button"
                className="btn btn-circle btn-ghost btn-sm"
                onClick={() => setCartOpen(false)}
                aria-label="إغلاق"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3">
              {cartItems}
            </div>
            <div className="shrink-0 border-t border-base-300/60 bg-base-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {cartFooter}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
