"use client";

import { useEffect, useMemo, useState } from "react";
import { useDragScroll } from "@/components/useDragScroll";
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
  dense = false,
  onAddItem,
}: {
  categories: MenuCategory[];
  items: MenuItem[];
  categoryCounts: Record<number, number>;
  pending?: boolean;
  dense?: boolean;
  onAddItem: (item: MenuItem) => void;
}) {
  const categoriesWithItems = useMemo(
    () =>
      categories.filter((cat) =>
        items.some((item) => item.categoryId === cat.id),
      ),
    [categories, items],
  );

  const listRef = useDragScroll<HTMLDivElement>("y");
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
      <p className="py-8 text-center text-sm text-base-content/45">
        لا توجد أصناف متاحة
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="touch-scroll-x shrink-0">
        <div className="flex w-max min-w-full gap-1.5 pb-0.5">
          {categoriesWithItems.map((cat) => {
            const picked = categoryCounts[cat.id] ?? 0;
            const active = cat.id === activeCategoryId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-bold ${
                  dense ? "h-9" : "h-11"
                } ${
                  active
                    ? "bg-primary text-primary-content"
                    : "border border-base-300 bg-base-100 text-base-content hover:bg-base-200"
                }`}
              >
                {cat.name}
                {picked > 0 ? (
                  <span
                    className={`rounded-md px-1.5 text-xs font-black ${
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

      <div ref={listRef} className="touch-scroll">
        {/* Fewer columns = readable tiles on 1024×768 POS monitors */}
        <div
          className={`grid gap-1.5 ${
            dense
              ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4"
              : "grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          }`}
        >
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
                className={`flex min-h-16 flex-col justify-between rounded-lg border px-2 py-1.5 text-right active:bg-primary/10 disabled:opacity-50 ${
                  available
                    ? "border-base-300 bg-base-100 hover:border-primary/50"
                    : "border-base-300 bg-base-200"
                }`}
              >
                <span
                  className={`line-clamp-2 text-sm font-bold leading-snug ${
                    available ? "" : "text-base-content/45"
                  }`}
                >
                  {item.name}
                </span>
                <span
                  className={`mt-1 text-xs font-black tabular-nums ${
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
          className="rounded border border-base-300 px-1.5 py-0.5 text-xs font-bold"
        >
          {cat.name}{" "}
          <span className="text-primary">{qty}</span>
        </span>
      ))}
    </div>
  );
}
