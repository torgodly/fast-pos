"use client";

import { useEffect, useMemo, useState } from "react";
import { Utensils } from "lucide-react";
import { formatMoney } from "@/lib/venues";

export type MenuCategory = { id: number; name: string };
export type MenuItem = {
  id: number;
  name: string;
  price: number;
  categoryId: number;
  active?: boolean;
};

export function CategoryItemPicker({
  categories,
  items,
  categoryCounts,
  pending = false,
  onAddItem,
}: {
  categories: MenuCategory[];
  items: MenuItem[];
  categoryCounts: Record<number, number>;
  pending?: boolean;
  onAddItem: (item: MenuItem) => void;
}) {
  const categoriesWithItems = useMemo(
    () =>
      categories.filter((cat) =>
        items.some((item) => item.categoryId === cat.id),
      ),
    [categories, items],
  );

  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(
    () => categoriesWithItems[0]?.id ?? null,
  );

  useEffect(() => {
    if (categoriesWithItems.length === 0) {
      setActiveCategoryId(null);
      return;
    }
    if (
      activeCategoryId == null ||
      !categoriesWithItems.some((cat) => cat.id === activeCategoryId)
    ) {
      setActiveCategoryId(categoriesWithItems[0]!.id);
    }
  }, [categoriesWithItems, activeCategoryId]);

  const activeItems = useMemo(
    () =>
      activeCategoryId == null
        ? []
        : items.filter((item) => item.categoryId === activeCategoryId),
    [items, activeCategoryId],
  );

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-base-300/70 bg-base-100 p-10 text-center">
        <Utensils className="mx-auto mb-3 size-9 text-base-content/20" />
        <p className="font-black">لا توجد أصناف متاحة</p>
        <p className="text-sm text-base-content/45">
          أضف الأصناف من لوحة الإدارة
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex w-max min-w-full gap-2">
          {categoriesWithItems.map((cat) => {
            const picked = categoryCounts[cat.id] ?? 0;
            const active = cat.id === activeCategoryId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                className={`btn h-11 min-h-11 shrink-0 gap-2 rounded-xl px-3 text-sm ${
                  active
                    ? "btn-primary"
                    : "btn-ghost border border-base-300 bg-base-100"
                }`}
              >
                <span className="font-black">{cat.name}</span>
                {picked > 0 ? (
                  <span
                    className={`badge badge-sm font-black ${
                      active ? "border-0 bg-white/20 text-inherit" : "badge-primary"
                    }`}
                  >
                    {picked}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {activeItems.map((item) => {
          const available = item.active !== false;
          return (
            <button
              key={item.id}
              type="button"
              disabled={pending || !available}
              onClick={() => {
                if (!available) return;
                onAddItem(item);
              }}
              title={
                available ? undefined : "غير متوفر حالياً — أخبر الزبون بذلك"
              }
              className={`flex min-h-16 touch-manipulation flex-col justify-between rounded-xl border px-2.5 py-2 text-right transition active:scale-[0.98] sm:min-h-[4.5rem] ${
                available
                  ? "border-base-300 bg-base-100 hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
                  : "cursor-not-allowed border-base-300 bg-base-200 opacity-60"
              }`}
            >
              <span
                className={`line-clamp-2 text-xs font-black leading-4 sm:text-sm sm:leading-5 ${
                  available ? "" : "text-base-content/50"
                }`}
              >
                {item.name}
              </span>
              {available ? (
                <span className="mt-1 text-xs font-bold text-primary sm:text-sm">
                  {formatMoney(item.price)}
                </span>
              ) : (
                <span className="mt-1 text-[10px] font-bold text-error">
                  غير متوفر
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeItems.length === 0 ? (
        <p className="py-8 text-center text-sm text-base-content/45">
          لا توجد أصناف في هذه المجموعة
        </p>
      ) : null}
    </div>
  );
}

export function CategoryPickSummary({
  categories,
  categoryCounts,
}: {
  categories: MenuCategory[];
  categoryCounts: Record<number, number>;
}) {
  const rows = categories
    .map((cat) => ({ cat, qty: categoryCounts[cat.id] ?? 0 }))
    .filter((row) => row.qty > 0);

  if (rows.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5 border-b border-base-300/50 pb-2">
      {rows.map(({ cat, qty }) => (
        <span
          key={cat.id}
          className="badge badge-ghost h-6 gap-1 rounded-md border border-base-300 px-2 text-[11px] font-bold"
        >
          {cat.name}
          <span className="font-black text-primary">{qty}</span>
        </span>
      ))}
    </div>
  );
}
