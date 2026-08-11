"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import {
  adminAddInvoiceItem,
  adminCancelInvoice,
  adminRemoveInvoiceItem,
  adminRestoreInvoice,
  adminSetInvoiceItemQty,
} from "@/app/actions/invoices";
import {
  CategoryItemPicker,
  type MenuCategory,
  type MenuItem,
} from "@/components/CategoryItemPicker";
import { formatMoney } from "@/lib/venues";

type Line = {
  id: number;
  itemId: number | null;
  itemName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export function InvoiceEditor({
  orderId,
  status,
  lines,
  categories,
  items,
}: {
  orderId: number;
  status: "open" | "paid" | "cancelled";
  lines: Line[];
  categories: MenuCategory[];
  items: MenuItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const locked = status === "cancelled";

  const categoryCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    const itemById = new Map(items.map((item) => [item.id, item]));
    for (const line of lines) {
      if (line.itemId == null) continue;
      const item = itemById.get(line.itemId);
      if (item) {
        counts[item.categoryId] = (counts[item.categoryId] ?? 0) + line.qty;
      }
    }
    return counts;
  }, [items, lines]);

  function run(action: () => Promise<{ ok: true } | { error: string }>) {
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="premium-card card">
        <div className="card-body gap-3 p-4 sm:p-5">
          <h3 className="font-black">بنود الفاتورة</h3>
          {error ? (
            <p className="rounded-lg bg-error/10 px-3 py-2 text-sm font-bold text-error">
              {error}
            </p>
          ) : null}
          <div className="divide-y divide-base-300/70 rounded-xl border border-base-300">
            {lines.map((line) => (
              <div
                key={line.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{line.itemName}</p>
                  <p className="text-xs text-base-content/45">
                    {formatMoney(line.unitPrice)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={pending || locked}
                    onClick={() =>
                      run(() => adminSetInvoiceItemQty(line.id, line.qty - 1))
                    }
                    className="btn btn-ghost btn-xs size-8 min-h-8 rounded-md p-0"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="min-w-6 text-center text-sm font-black tabular-nums">
                    {line.qty}
                  </span>
                  <button
                    type="button"
                    disabled={pending || locked}
                    onClick={() =>
                      run(() => adminSetInvoiceItemQty(line.id, line.qty + 1))
                    }
                    className="btn btn-ghost btn-xs size-8 min-h-8 rounded-md p-0"
                  >
                    <Plus className="size-3.5" />
                  </button>
                  <span className="w-20 text-left text-xs font-black text-primary">
                    {formatMoney(line.lineTotal)}
                  </span>
                  <button
                    type="button"
                    disabled={pending || locked}
                    onClick={() => run(() => adminRemoveInvoiceItem(line.id))}
                    className="btn btn-ghost btn-xs size-8 min-h-8 rounded-md p-0 text-error"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {lines.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-base-content/45">
                لا بنود
              </p>
            ) : null}
          </div>

          {status === "cancelled" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => adminRestoreInvoice(orderId))}
              className="btn btn-outline btn-sm"
            >
              استعادة الفاتورة للتقارير
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm("إلغاء هذه الفاتورة بالكامل؟ ستخرج من تقارير المبيعات.")) {
                  return;
                }
                run(() => adminCancelInvoice(orderId));
              }}
              className="btn btn-error btn-outline btn-sm"
            >
              إلغاء الفاتورة بالكامل
            </button>
          )}
        </div>
      </section>

      <section className="premium-card card">
        <div className="card-body gap-3 p-4 sm:p-5">
          <h3 className="font-black">إضافة صنف</h3>
          {locked ? (
            <p className="text-sm text-base-content/45">
              الفاتورة ملغاة — استعدها أولاً لإضافة أصناف.
            </p>
          ) : (
            <div className="min-h-[28rem]">
              <CategoryItemPicker
                categories={categories}
                items={items}
                categoryCounts={categoryCounts}
                pending={pending}
                onAddItem={(item) =>
                  run(() => adminAddInvoiceItem(orderId, item.id))
                }
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
