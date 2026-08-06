"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  FolderOpen,
  Plus,
  Utensils,
  X,
} from "lucide-react";
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
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

  const categoriesWithItems = useMemo(
    () =>
      categories.filter((cat) =>
        items.some((item) => item.categoryId === cat.id),
      ),
    [categories, items],
  );

  const activeCategory = categoriesWithItems.find(
    (cat) => cat.id === activeCategoryId,
  );

  const activeItems = useMemo(
    () =>
      activeCategoryId == null
        ? []
        : items.filter((item) => item.categoryId === activeCategoryId),
    [items, activeCategoryId],
  );

  if (items.length === 0) {
    return (
      <div className="premium-card rounded-3xl p-10 text-center">
        <Utensils className="mx-auto mb-3 size-9 text-base-content/20" />
        <p className="font-black">لا توجد أصناف متاحة</p>
        <p className="text-sm text-base-content/45">
          أضف الأصناف من لوحة الإدارة
        </p>
      </div>
    );
  }

  if (activeCategoryId != null && activeCategory) {
    const pickedInCategory = categoryCounts[activeCategoryId] ?? 0;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-ghost gap-2 rounded-xl border border-base-300 bg-base-100 px-3"
            onClick={() => setActiveCategoryId(null)}
          >
            <ArrowRight className="size-4" />
            <span className="font-black">كل المجموعات</span>
          </button>
          <div
            className={`premium-card flex min-w-0 flex-1 items-center gap-3 rounded-2xl border bg-base-100 px-4 py-3 ${
              pickedInCategory > 0 ? "border-primary" : "border-base-300"
            }`}
          >
            <span className="grid size-10 place-items-center rounded-xl bg-base-200 text-secondary">
              <FolderOpen className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-black">{activeCategory.name}</h3>
              <p className="text-xs text-base-content/50">
                {activeItems.length} صنف
                {pickedInCategory > 0
                  ? ` · ${pickedInCategory} في الفاتورة`
                  : ""}
              </p>
            </div>
            {pickedInCategory > 0 ? (
              <span className="badge badge-primary badge-lg font-black">
                {pickedInCategory}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {activeItems.map((item) => {
            const available = item.active !== false;
            return (
              <button
                key={item.id}
                type="button"
                className={`group flex min-h-[7.5rem] touch-manipulation flex-col justify-between rounded-2xl border bg-base-100 p-3.5 text-right shadow-sm transition duration-200 sm:min-h-32 sm:p-4 ${
                  available
                    ? "border-base-300/80 hover:border-primary/30 hover:shadow-md active:scale-[0.98] disabled:opacity-60"
                    : "cursor-not-allowed border-error bg-base-200"
                }`}
                disabled={pending || !available}
                onClick={() => {
                  if (!available) return;
                  onAddItem(item);
                }}
                title={
                  available ? undefined : "غير متوفر حالياً — أخبر الزبون بذلك"
                }
              >
                <span className="flex items-start justify-between">
                  {available ? (
                    <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-content">
                      <Plus className="size-4" />
                    </span>
                  ) : (
                    <span className="grid size-9 place-items-center rounded-xl bg-error/10 text-error">
                      <X className="size-4" />
                    </span>
                  )}
                </span>
                <span className="mt-2 block min-w-0">
                  <span
                    className={`block line-clamp-2 text-sm font-black leading-5 sm:text-base ${
                      available ? "" : "text-base-content/60"
                    }`}
                  >
                    {item.name}
                  </span>
                  {available ? (
                    <span className="mt-1 block text-sm font-bold text-primary">
                      {formatMoney(item.price)}
                    </span>
                  ) : (
                    <span className="mt-1 inline-flex rounded-lg bg-error/10 px-2 py-0.5 text-[11px] font-black text-error">
                      غير متوفر
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-base-200 text-secondary">
          <FolderOpen className="size-4.5" />
        </span>
        <div>
          <h3 className="text-lg font-black">اختر المجموعة</h3>
          <p className="text-xs text-base-content/45">
            اضغط على مجموعة لعرض أصنافها
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {categoriesWithItems.map((cat) => {
          const catItems = items.filter((item) => item.categoryId === cat.id);
          const picked = categoryCounts[cat.id] ?? 0;
          const hasPicked = picked > 0;

          return (
            <button
              key={cat.id}
              type="button"
              className={`premium-card group flex min-h-[8.5rem] touch-manipulation flex-col justify-between rounded-2xl border-2 bg-base-100 p-4 text-right shadow-sm transition duration-200 hover:shadow-md active:scale-[0.98] sm:min-h-36 sm:p-5 ${
                hasPicked
                  ? "border-primary hover:border-primary"
                  : "border-dashed border-base-300 hover:border-secondary"
              }`}
              onClick={() => setActiveCategoryId(cat.id)}
            >
              <span className="flex items-start justify-between gap-2">
                <span
                  className={`grid size-11 place-items-center rounded-2xl ${
                    hasPicked
                      ? "bg-primary text-primary-content"
                      : "bg-base-200 text-secondary"
                  }`}
                >
                  <FolderOpen className="size-5" />
                </span>
                {hasPicked ? (
                  <span className="badge badge-primary badge-lg min-w-9 font-black">
                    {picked}
                  </span>
                ) : (
                  <span className="rounded-lg bg-base-200 px-2 py-1 text-[10px] font-bold text-base-content/50">
                    مجموعة
                  </span>
                )}
              </span>

              <span className="mt-3 block min-w-0">
                <span className="block line-clamp-2 text-base font-black leading-6 sm:text-lg">
                  {cat.name}
                </span>
                <span className="mt-1 block text-xs text-base-content/45">
                  {catItems.length} صنف
                  {hasPicked ? (
                    <span className="font-bold text-primary">
                      {" "}
                      · {picked} مختار
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
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
    <div className="mb-3 flex flex-wrap gap-2 border-b border-base-300/60 pb-3">
      {rows.map(({ cat, qty }) => (
        <span
          key={cat.id}
          className="badge badge-primary badge-soft gap-1.5 py-3 text-xs font-bold"
        >
          {cat.name}
          <span className="rounded-md bg-primary/15 px-1.5 font-black text-primary">
            {qty}
          </span>
        </span>
      ))}
    </div>
  );
}
