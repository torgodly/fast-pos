"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import {
  adminAddInvoiceItem,
  adminCancelInvoice,
  adminRemoveInvoiceItem,
  adminRestoreInvoice,
  adminSetInvoiceItemQty,
} from "@/app/actions/invoices";
import type { MenuCategory, MenuItem } from "@/components/CategoryItemPicker";
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
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const locked = status === "cancelled";

  const visibleItems = useMemo(() => {
    const q = query.trim();
    return items.filter((item) => {
      if (categoryId !== "all" && item.categoryId !== categoryId) return false;
      if (q && !item.name.includes(q)) return false;
      return true;
    });
  }, [items, categoryId, query]);

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
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
      <section className="overflow-hidden rounded-3xl border border-base-300/70 bg-base-100 shadow-sm">
        <div className="flex items-center justify-between border-b border-base-300/60 px-5 py-4">
          <div>
            <h3 className="font-black">بنود الفاتورة</h3>
            <p className="text-xs text-base-content/45">
              {lines.length} صنف — زد أو أنقص أو احذف لتصحيح الخطأ
            </p>
          </div>
        </div>

        {error ? (
          <p className="mx-5 mt-4 rounded-xl bg-error/10 px-3 py-2 text-sm font-bold text-error">
            {error}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="text-base-content/45">
                <th>الصنف</th>
                <th className="text-center">الكمية</th>
                <th className="text-end">المجموع</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <p className="font-black">{line.itemName}</p>
                    <p className="text-xs text-base-content/45">
                      {formatMoney(line.unitPrice)}
                    </p>
                  </td>
                  <td>
                    <div className="mx-auto flex w-fit items-center overflow-hidden rounded-xl border border-base-300">
                      <button
                        type="button"
                        disabled={pending || locked}
                        onClick={() =>
                          run(() => adminSetInvoiceItemQty(line.id, line.qty - 1))
                        }
                        className="grid size-9 place-items-center disabled:opacity-30"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="min-w-8 text-center text-sm font-black tabular-nums">
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        disabled={pending || locked}
                        onClick={() =>
                          run(() => adminSetInvoiceItemQty(line.id, line.qty + 1))
                        }
                        className="grid size-9 place-items-center disabled:opacity-30"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="text-end font-black text-primary">
                    {formatMoney(line.lineTotal)}
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={pending || locked}
                      onClick={() => run(() => adminRemoveInvoiceItem(line.id))}
                      className="btn btn-ghost btn-xs btn-square text-error"
                      aria-label="حذف"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-base-content/45">
                    لا بنود في هذه الفاتورة
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-300/60 bg-base-200/30 px-5 py-4">
          {status === "cancelled" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => adminRestoreInvoice(orderId))}
              className="btn btn-primary btn-sm rounded-xl"
            >
              استعادة الفاتورة للتقارير
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (
                  !confirm(
                    "إلغاء هذه الفاتورة بالكامل؟ ستخرج من تقارير المبيعات.",
                  )
                ) {
                  return;
                }
                run(() => adminCancelInvoice(orderId));
              }}
              className="btn btn-error btn-outline btn-sm rounded-xl"
            >
              إلغاء الفاتورة بالكامل
            </button>
          )}
          <p className="text-xs text-base-content/45">
            أي تعديل يظهر فوراً في التقارير و X/Z
          </p>
        </div>
      </section>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-base-300/70 bg-base-100 shadow-sm">
        <div className="border-b border-base-300/60 px-5 py-4">
          <h3 className="font-black">إضافة صنف</h3>
          <p className="text-xs text-base-content/45">
            ابحث أو اختر تصنيفاً ثم اضغط للإضافة
          </p>
        </div>

        {locked ? (
          <p className="px-5 py-10 text-sm text-base-content/45">
            الفاتورة ملغاة — استعدها أولاً لإضافة أصناف.
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <label className="flex h-11 items-center gap-2 rounded-xl border border-base-300 px-3">
              <Search className="size-4 text-base-content/40" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="بحث عن صنف…"
                className="min-w-0 grow bg-transparent outline-none"
              />
            </label>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryId("all")}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                  categoryId === "all"
                    ? "bg-primary text-primary-content"
                    : "border border-base-300"
                }`}
              >
                الكل
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                    categoryId === cat.id
                      ? "bg-primary text-primary-content"
                      : "border border-base-300"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="max-h-[28rem] overflow-y-auto rounded-2xl border border-base-300/60">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => adminAddInvoiceItem(orderId, item.id))}
                  className="flex w-full items-center justify-between gap-3 border-b border-base-300/50 px-3 py-2.5 text-right last:border-b-0 hover:bg-primary/5 disabled:opacity-50"
                >
                  <span className="min-w-0 truncate text-sm font-bold">
                    {item.name}
                  </span>
                  <span className="shrink-0 text-xs font-black text-primary">
                    {formatMoney(item.price)}
                  </span>
                </button>
              ))}
              {visibleItems.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-base-content/45">
                  لا نتائج
                </p>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
