"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  ChevronUp,
  Minus,
  Plus,
  ReceiptText,
  ShoppingBag,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import {
  addItemToOrder,
  removeOrderItem,
  updateOrderItemQty,
} from "@/app/actions/orders";
import { formatMoney } from "@/lib/venues";

type Category = { id: number; name: string };
type Item = {
  id: number;
  name: string;
  price: number;
  categoryId: number;
  active?: boolean;
};
type Line = {
  id: number;
  itemName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
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

  const cartBody = (
    <>
      <ul className="max-h-[42vh] space-y-2 overflow-y-auto lg:max-h-[48vh]">
        {lines.map((line) => (
          <li
            key={line.id}
            className="rounded-2xl border border-base-300/60 bg-base-100 p-3"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-black">{line.itemName}</p>
                <p className="text-xs text-base-content/45">
                  {formatMoney(line.unitPrice)} للوحدة
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
                  className="btn join-item btn-sm btn-square min-h-11 min-w-11"
                  disabled={pending}
                  onClick={() => changeQty(line.id, line.qty - 1)}
                  aria-label="تقليل الكمية"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="join-item grid h-11 w-10 place-items-center border-y border-base-300 bg-base-100 text-sm font-black">
                  {line.qty}
                </span>
                <button
                  type="button"
                  className="btn join-item btn-sm btn-square min-h-11 min-w-11"
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
                disabled={pending}
                onClick={() => remove(line.id)}
                aria-label="حذف الصنف"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}
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
      <div className="mt-4 border-t border-dashed border-base-300 pt-4">
        <div className="flex items-end justify-between">
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
      {footer ? <div className="mt-4">{footer}</div> : null}
    </>
  );

  return (
    <>
      <div className="grid flex-1 gap-4 pb-32 md:gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:pb-0 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-7">
          {categories.map((cat) => {
            const catItems = items.filter((item) => item.categoryId === cat.id);
            if (catItems.length === 0) return null;
            return (
              <section key={cat.id}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Utensils className="size-4" />
                  </span>
                  <h3 className="text-lg font-black">{cat.name}</h3>
                  <span className="badge badge-ghost badge-sm">
                    {catItems.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {catItems.map((item) => {
                    const available = item.active !== false;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`group card min-h-32 touch-manipulation text-right shadow-sm transition duration-200 md:min-h-36 ${
                          available
                            ? "border border-base-300/70 bg-base-100 hover:border-primary/30 hover:shadow-md disabled:opacity-60"
                            : "cursor-not-allowed border-2 border-error/35 bg-base-200 text-base-content opacity-100 shadow-sm disabled:bg-base-200 disabled:text-base-content disabled:opacity-100"
                        }`}
                        disabled={pending || !available}
                        onClick={() => {
                          if (!available) return;
                          add(item.id);
                        }}
                        title={
                          available
                            ? undefined
                            : "غير متوفر حالياً — أخبر الزبون بذلك"
                        }
                      >
                        <span className="card-body w-full justify-between gap-3 p-4 md:p-5 lg:p-4 xl:p-5">
                          {available ? (
                            <span className="grid size-9 place-items-center rounded-xl bg-base-200 text-base-content/35 transition group-hover:bg-primary/10 group-hover:text-primary">
                              <Plus className="size-4" />
                            </span>
                          ) : (
                            <span className="grid size-9 place-items-center rounded-xl bg-error text-error-content shadow-sm">
                              <X className="size-4" />
                            </span>
                          )}
                          <span>
                            <span
                              className={`block line-clamp-2 text-base font-black leading-6 ${
                                available ? "" : "text-base-content"
                              }`}
                            >
                              {item.name}
                            </span>
                            {available ? (
                              <span className="mt-1 block text-sm font-bold text-primary">
                                {formatMoney(item.price)}
                              </span>
                            ) : (
                              <span className="mt-1 inline-flex rounded-lg bg-error/10 px-2 py-1 text-xs font-black leading-5 text-error">
                                غير متوفر حالياً
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {items.length === 0 && (
            <div className="premium-card rounded-3xl p-10 text-center">
              <Utensils className="mx-auto mb-3 size-9 text-base-content/20" />
              <p className="font-black">لا توجد أصناف متاحة</p>
              <p className="text-sm text-base-content/45">
                أضف الأصناف من لوحة الإدارة
              </p>
            </div>
          )}
        </div>

        <aside className="premium-card sticky top-20 hidden h-fit max-h-[calc(100dvh-6rem)] overflow-hidden lg:card lg:block xl:top-24">
          <div className="flex items-center justify-between border-b border-base-300/60 bg-base-200/50 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <ShoppingBag className="size-4.5" />
              </span>
              <div>
                <h3 className="font-black">ملخص الفاتورة</h3>
                <p className="text-xs text-base-content/40">{itemCount} عنصر</p>
              </div>
            </div>
            <ReceiptText className="size-5 text-base-content/20" />
          </div>
          <div className="card-body gap-0 p-5">{cartBody}</div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-base-300/70 bg-base-100/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgb(15_23_42_/_0.12)] backdrop-blur-xl lg:hidden">
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="flex min-h-16 w-full touch-manipulation items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-3.5 text-primary-content shadow-lg shadow-primary/20 md:mx-auto md:max-w-2xl md:px-6"
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
          <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-hidden rounded-t-3xl bg-base-100 pb-[env(safe-area-inset-bottom)] shadow-2xl md:left-1/2 md:right-auto md:w-full md:max-w-2xl md:-translate-x-1/2">
            <div className="flex items-center justify-between border-b border-base-300/60 px-4 py-3">
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
            <div className="overflow-y-auto p-4 pb-8">{cartBody}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
