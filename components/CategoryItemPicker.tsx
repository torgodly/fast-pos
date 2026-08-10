"use client";

import { useEffect, useMemo, useState } from "react";
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
      <p className="py-8 text-center text-xs text-base-content/45">
        لا توجد أصناف متاحة
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
      <div className="touch-scroll-x shrink-0">
        <div className="flex w-max min-w-full gap-1 pb-0.5">
          {categoriesWithItems.map((cat) => {
            const picked = categoryCounts[cat.id] ?? 0;
            const active = cat.id === activeCategoryId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 text-[11px] font-bold ${
                  active
                    ? "bg-primary text-primary-content"
                    : "border border-base-300 bg-base-100 text-base-content hover:bg-base-200"
                }`}
              >
                {cat.name}
                {picked > 0 ? (
                  <span
                    className={`rounded px-1 text-[10px] font-black ${
                      active ? "bg-white/20" : "bg-primary/15 text-primary"
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

      <div className="touch-scroll min-h-0 flex-1">
        <div className="grid grid-cols-4 gap-1 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
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
                title={available ? item.name : "غير متوفر"}
                className={`flex min-h-11 flex-col justify-between rounded-md border px-1.5 py-1 text-right active:bg-primary/10 disabled:opacity-50 ${
                  available
                    ? "border-base-300 bg-base-100 hover:border-primary/50"
                    : "border-base-300 bg-base-200"
                }`}
              >
                <span
                  className={`line-clamp-2 text-[10px] font-bold leading-tight sm:text-[11px] ${
                    available ? "" : "text-base-content/45"
                  }`}
                >
                  {item.name}
                </span>
                <span
                  className={`mt-0.5 text-[10px] font-black tabular-nums sm:text-[11px] ${
                    available ? "text-primary" : "text-error"
                  }`}
                >
                  {available ? formatMoney(item.price) : "—"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
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
    <div className="mb-1 flex flex-wrap gap-1 border-b border-base-300/50 pb-1">
      {rows.map(({ cat, qty }) => (
        <span
          key={cat.id}
          className="rounded border border-base-300 px-1.5 py-0.5 text-[10px] font-bold"
        >
          {cat.name}{" "}
          <span className="text-primary">{qty}</span>
        </span>
      ))}
    </div>
  );
}
