"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
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

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

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

  const categoryNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const cat of categories) map.set(cat.id, cat.name);
    return map;
  }, [categories]);

  const listRef = useDragScroll<HTMLDivElement>("y");
  const [query, setQuery] = useState("");
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

  const search = normalizeSearch(query);
  const isSearching = search.length > 0;

  const visibleItems = useMemo(() => {
    if (isSearching) {
      return items.filter((item) =>
        normalizeSearch(item.name).includes(search),
      );
    }
    if (activeCategoryId == null) return [];
    return items.filter((item) => item.categoryId === activeCategoryId);
  }, [items, activeCategoryId, isSearching, search]);

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-base-content/45">
        لا توجد أصناف متاحة
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <label
        className={`flex shrink-0 items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-2.5 ${
          dense ? "h-9" : "h-10"
        }`}
      >
        <Search className="size-4 shrink-0 text-base-content/40" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="بحث في كل الأصناف…"
          className="min-w-0 grow bg-transparent text-sm outline-none placeholder:text-base-content/35"
        />
        {query ? (
          <button
            type="button"
            className="grid size-6 shrink-0 place-items-center rounded-md text-base-content/45 hover:bg-base-200 hover:text-base-content"
            onClick={() => setQuery("")}
            aria-label="مسح البحث"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </label>

      <div
        className={`touch-scroll-x shrink-0 ${
          isSearching ? "pointer-events-none opacity-45" : ""
        }`}
      >
        <div className="flex w-max min-w-full gap-1.5 pb-0.5">
          {categoriesWithItems.map((cat) => {
            const picked = categoryCounts[cat.id] ?? 0;
            const active = !isSearching && cat.id === activeCategoryId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                disabled={isSearching}
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
        {visibleItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-base-content/45">
            {isSearching ? "لا نتائج لهذا البحث" : "لا أصناف في هذا التصنيف"}
          </p>
        ) : (
          <div
            className={`grid gap-1.5 ${
              dense
                ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4"
                : "grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
            }`}
          >
            {visibleItems.map((item) => {
              const available = item.active !== false;
              const categoryName = isSearching
                ? categoryNameById.get(item.categoryId)
                : null;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={pending || !available}
                  onClick={() => {
                    if (!available) return;
                    onAddItem(item);
                  }}
                  title={available ? item.name : "غير متاح"}
                  className={`flex min-h-16 flex-col justify-between rounded-lg border px-2 py-1.5 text-right ${
                    available
                      ? "border-base-300 bg-base-100 hover:border-primary/50 active:bg-primary/10"
                      : "cursor-not-allowed border-error/25 bg-error/5 opacity-100"
                  }`}
                >
                  <span
                    className={`line-clamp-2 text-sm font-bold leading-snug ${
                      available ? "" : "text-error/70"
                    }`}
                  >
                    {item.name}
                  </span>
                  {categoryName ? (
                    <span className="mt-0.5 line-clamp-1 text-[10px] font-bold text-base-content/45">
                      {categoryName}
                    </span>
                  ) : null}
                  {available ? (
                    <span className="mt-1 text-xs font-black tabular-nums text-primary">
                      {formatMoney(item.price)}
                    </span>
                  ) : (
                    <span className="mt-1 text-[11px] font-bold text-error/65">
                      غير متاح
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
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
