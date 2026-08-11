"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";
import { setItemActive } from "@/app/actions/admin";
import { formatMoney } from "@/lib/venues";

type CategoryRow = { id: number; name: string };
type ItemRow = {
  id: number;
  name: string;
  categoryId: number;
  price: number;
  active: boolean;
};

export function ItemAvailabilityBoard({
  categories,
  items,
}: {
  categories: CategoryRow[];
  items: ItemRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(
    () => categories[0]?.id ?? null,
  );

  const selectedItems = useMemo(
    () =>
      selectedId == null
        ? []
        : items.filter((item) => item.categoryId === selectedId),
    [items, selectedId],
  );

  function toggle(item: ItemRow) {
    setBusyId(item.id);
    startTransition(async () => {
      await setItemActive(item.id, !item.active);
      router.refresh();
      setBusyId(null);
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat) => {
          const active = cat.id === selectedId;
          const offCount = items.filter(
            (item) => item.categoryId === cat.id && !item.active,
          ).length;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedId(cat.id)}
              className={`inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-bold ${
                active
                  ? "bg-primary text-primary-content"
                  : "border border-base-300 bg-base-100"
              }`}
            >
              {cat.name}
              {offCount > 0 ? (
                <span
                  className={`rounded px-1.5 text-xs ${
                    active ? "bg-white/20" : "bg-error/10 text-error"
                  }`}
                >
                  {offCount} متوقف
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedItems.length === 0 ? (
        <p className="py-10 text-center text-sm text-base-content/45">
          لا أصناف
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {selectedItems.map((item) => {
            const busy = pending && busyId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={pending}
                onClick={() => toggle(item)}
                className={`flex min-h-28 flex-col justify-between rounded-xl border p-3 text-right transition active:scale-[0.98] disabled:opacity-70 ${
                  item.active
                    ? "border-success/40 bg-base-100 hover:border-success"
                    : "border-error/30 bg-base-200/80 opacity-75 hover:border-error/50"
                }`}
              >
                <span className="line-clamp-2 text-sm font-black leading-snug">
                  {item.name}
                </span>
                <span className="mt-2 flex items-end justify-between gap-2">
                  <span className="text-xs font-black tabular-nums text-primary">
                    {formatMoney(item.price)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-black ${
                      item.active
                        ? "bg-success/15 text-success"
                        : "bg-error/15 text-error"
                    }`}
                  >
                    <Power className={`size-3 ${busy ? "animate-spin" : ""}`} />
                    {item.active ? "متاح" : "متوقف"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
