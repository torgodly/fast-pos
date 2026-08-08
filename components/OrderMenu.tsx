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
  CategoryPickSummary,
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
    <>
      <CategoryPickSummary
        categories={categories}
        categoryCounts={categoryCounts}
      />
      <ul className="mt-3 space-y-2">
        {lines.map((line) => {
          const kitchenSent = line.kitchenSentQty ?? 0;
          const locked = kitchenSent > 0;
          const canReduce = line.qty > kitchenSent;
          return (
            <li
              key={line.id}
              className="rounded-2xl border border-base-300/60 bg-base-100 p-3"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-black">{line.itemName}</p>
                  <p className="text-xs text-base-content/45">
                    {formatMoney(line.unitPrice)} للوحدة
                    {locked ? (
                      <span className="ms-2 text-warning">
                        · مؤكد للمطبخ ({kitchenSent})
                      </span>
                    ) : null}
                  </p>
                </div>
                <p className="shrink-0 font-black text-primary">
                  {formatMoney(line.lineTotal)}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="join">
                  <button
                    type="button"
                    className="btn join-item btn-sm btn-square min-h-10 min-w-10 sm:min-h-11 sm:min-w-11"
                    disabled={pending || !canReduce}
                    onClick={() => changeQty(line.id, line.qty - 1)}
                    aria-label="تقليل الكمية"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="join-item grid h-10 w-10 place-items-center border-y border-base-300 bg-base-100 text-sm font-black sm:h-11">
                    {line.qty}
                  </span>
                  <button
                    type="button"
                    className="btn join-item btn-sm btn-square min-h-10 min-w-10 sm:min-h-11 sm:min-w-11"
                    disabled={pending}
                    onClick={() => changeQty(line.id, line.qty + 1)}
                    aria-label="زيادة الكمية"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-circle btn-ghost btn-sm text-error"
                  disabled={pending || locked}
                  onClick={() => remove(line.id)}
                  aria-label="حذف الصنف"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          );
        })}
        {lines.length === 0 && (
          <li className="py-8 text-center">
            <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-base-200 text-base-content/20">
              <ShoppingBag className="size-6" />
            </span>
            <p className="font-bold">الفاتورة فارغة</p>
            <p className="text-xs text-base-content/40">اختر صنفاً من القائمة</p>
          </li>
        )}
      </ul>
    </>
  );

  const cartFooter = (
    <>
      <div className="border-t border-dashed border-base-300 pt-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-base-content/45">
              الإجمالي المستحق
            </p>
            <p className="text-xs text-base-content/35">شامل كل الأصناف</p>
          </div>
          <span className="text-2xl font-black text-primary">
            {formatMoney(total)}
          </span>
        </div>
      </div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </>
  );

  return (
    <>
      <div className="grid flex-1 gap-3 pb-28 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,30%)] lg:pb-0 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,28%)]">
        <div className="min-w-0">
          <CategoryItemPicker
            categories={categories}
            items={items}
            categoryCounts={categoryCounts}
            pending={pending}
            onAddItem={(item) => add(item.id)}
          />
        </div>

        <aside className="premium-card sticky top-14 hidden max-h-[calc(100dvh-4.5rem)] lg:flex lg:flex-col lg:overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-base-300/60 bg-base-200/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <ShoppingBag className="size-4" />
              </span>
              <div>
                <h3 className="font-black">ملخص الفاتورة</h3>
                <p className="text-xs text-base-content/40">{itemCount} عنصر</p>
              </div>
            </div>
            <ReceiptText className="size-5 text-base-content/20" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {cartItems}
            </div>
            <div className="mt-3 shrink-0 border-t border-base-300/60 bg-base-100 pt-3">
              {cartFooter}
            </div>
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
                <p className="font-black">ملخص الفاتورة</p>
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
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
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
