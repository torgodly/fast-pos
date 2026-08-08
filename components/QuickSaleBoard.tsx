"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  ChevronUp,
  CreditCard,
  LoaderCircle,
  Minus,
  Plus,
  ReceiptText,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { payQuickSale, type QuickSaleLine } from "@/app/actions/orders";
import { finishCheckoutPrint } from "@/lib/print/finish-checkout-print";
import { useToast } from "@/components/ToastProvider";
import {
  CategoryItemPicker,
  type MenuCategory,
  type MenuItem,
} from "@/components/CategoryItemPicker";
import { formatMoney } from "@/lib/venues";

type Category = MenuCategory;
type Item = MenuItem;

export function QuickSaleBoard({
  venueId,
  categories,
  items,
}: {
  venueId: string;
  categories: Category[];
  items: Item[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [cart, setCart] = useState<QuickSaleLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [method, setMethod] = useState<"cash" | "card" | null>(null);
  const [pending, startTransition] = useTransition();

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0),
    [cart],
  );
  const itemCount = useMemo(
    () => cart.reduce((sum, line) => sum + line.qty, 0),
    [cart],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const cat of categories) counts[cat.id] = 0;
    const itemById = new Map(items.map((item) => [item.id, item]));
    for (const line of cart) {
      const item = itemById.get(line.itemId);
      if (item) {
        counts[item.categoryId] = (counts[item.categoryId] ?? 0) + line.qty;
      }
    }
    return counts;
  }, [cart, items, categories]);

  function add(item: Item) {
    setCart((prev) => {
      const existing = prev.find((line) => line.itemId === item.id);
      if (existing) {
        return prev.map((line) =>
          line.itemId === item.id ? { ...line, qty: line.qty + 1 } : line,
        );
      }
      return [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          unitPrice: item.price,
          qty: 1,
        },
      ];
    });
  }

  function changeQty(itemId: number, qty: number) {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((line) => line.itemId !== itemId)
        : prev.map((line) => (line.itemId === itemId ? { ...line, qty } : line)),
    );
  }

  function remove(itemId: number) {
    setCart((prev) => prev.filter((line) => line.itemId !== itemId));
  }

  function askConfirm(selected: "cash" | "card") {
    if (cart.length === 0) {
      showToast("error", "أضف أصنافاً قبل الدفع");
      return;
    }
    setMethod(selected);
    const dialog = document.getElementById(
      "quick-sale-confirm",
    ) as HTMLDialogElement | null;
    dialog?.showModal();
  }

  function closeModal() {
    const dialog = document.getElementById(
      "quick-sale-confirm",
    ) as HTMLDialogElement | null;
    dialog?.close();
    setMethod(null);
  }

  function confirmPay() {
    if (!method) return;
    startTransition(async () => {
      const result = await payQuickSale(venueId, cart, method);
      if ("error" in result) {
        showToast("error", result.error);
        return;
      }

      closeModal();
      setCart([]);
      setCartOpen(false);

      let printOk = result.printOk;
      let message = result.message;

      if (result.browserPrint && result.receiptHtml) {
        const printed = await finishCheckoutPrint({
          browserPrint: true,
          receiptHtml: result.receiptHtml,
        });
        printOk = printed.printOk;
        message = printed.message;
      }

      showToast(printOk ? "success" : "warning", message);
      router.refresh();
    });
  }

  const methodLabel = method === "cash" ? "نقدي" : "بطاقة";

  const cartItems = (
    <ul className="divide-y divide-base-300/70">
      {cart.map((line) => (
        <li key={line.itemId} className="flex items-center gap-2 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black leading-5">{line.name}</p>
            <p className="text-[11px] text-base-content/40">
              {formatMoney(line.unitPrice)}
            </p>
          </div>
          <div className="join shrink-0">
            <button
              type="button"
              className="btn join-item btn-xs btn-square h-9 min-h-9 w-9"
              onClick={() => changeQty(line.itemId, line.qty - 1)}
              aria-label="تقليل الكمية"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="join-item grid h-9 w-8 place-items-center border-y border-base-300 bg-base-100 text-xs font-black">
              {line.qty}
            </span>
            <button
              type="button"
              className="btn join-item btn-xs btn-square h-9 min-h-9 w-9"
              onClick={() => changeQty(line.itemId, line.qty + 1)}
              aria-label="زيادة الكمية"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <p className="w-16 shrink-0 text-end text-sm font-black text-primary">
            {formatMoney(line.unitPrice * line.qty)}
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square h-9 w-9 text-error"
            onClick={() => remove(line.itemId)}
            aria-label="حذف الصنف"
          >
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
      {cart.length === 0 && (
        <li className="py-10 text-center">
          <ShoppingBag className="mx-auto mb-2 size-6 text-base-content/20" />
          <p className="text-sm font-bold">السلة فارغة</p>
          <p className="text-xs text-base-content/40">اختر صنفاً من القائمة</p>
        </li>
      )}
    </ul>
  );

  const cartFooter = (
    <>
      <div className="flex items-end justify-between gap-3 border-t border-dashed border-base-300 pt-3">
        <p className="text-sm font-bold text-base-content/55">الإجمالي</p>
        <span className="text-2xl font-black text-primary">
          {formatMoney(total)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn h-12 min-h-12 gap-2 rounded-xl border-success/20 bg-success/10 text-success hover:border-success/30 hover:bg-success/20"
          disabled={pending || cart.length === 0}
          onClick={() => askConfirm("cash")}
        >
          <Banknote className="size-5" />
          <span className="font-black">نقدي</span>
        </button>
        <button
          type="button"
          className="btn h-12 min-h-12 gap-2 rounded-xl border-info/20 bg-info/10 text-info hover:border-info/30 hover:bg-info/20"
          disabled={pending || cart.length === 0}
          onClick={() => askConfirm("card")}
        >
          <CreditCard className="size-5" />
          <span className="font-black">بطاقة</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="grid flex-1 gap-3 pb-24 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,30%)] lg:pb-0 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,28%)]">
        <div className="min-w-0 rounded-2xl border border-base-300/70 bg-base-100 p-3 sm:p-4">
          <CategoryItemPicker
            categories={categories}
            items={items}
            categoryCounts={categoryCounts}
            pending={pending}
            onAddItem={add}
          />
        </div>

        <aside className="sticky top-14 hidden max-h-[calc(100dvh-4.5rem)] overflow-hidden rounded-2xl border border-base-300/70 bg-base-100 lg:flex lg:flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-base-300/60 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <ReceiptText className="size-4 text-primary" />
              <div>
                <h3 className="text-sm font-black">الفاتورة</h3>
                <p className="text-[11px] text-base-content/40">
                  {itemCount} عنصر
                </p>
              </div>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-3">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {cartItems}
            </div>
            <div className="shrink-0 bg-base-100 pb-3 pt-1">{cartFooter}</div>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-base-300/70 bg-base-100/95 p-3 shadow-[0_-12px_40px_rgb(15_23_42_/_0.12)] backdrop-blur-xl lg:hidden">
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-3.5 text-primary-content shadow-lg shadow-primary/20"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-white/15">
              <ShoppingBag className="size-5" />
            </span>
            <span className="text-right">
              <span className="block text-xs text-primary-content/70">
                {itemCount} عنصر في السلة
              </span>
              <span className="block text-lg font-black">
                {formatMoney(total)}
              </span>
            </span>
          </span>
          <span className="flex items-center gap-1 text-sm font-bold">
            الدفع
            <ChevronUp className="size-4" />
          </span>
        </button>
      </div>

      {cartOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-neutral/45 backdrop-blur-[2px]"
            aria-label="إغلاق السلة"
            onClick={() => setCartOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[min(88dvh,100%)] flex-col overflow-hidden rounded-t-3xl bg-base-100 shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-base-300/60 px-4 py-3">
              <div>
                <p className="font-black">الفاتورة</p>
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
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3">
              {cartItems}
            </div>
            <div className="shrink-0 border-t border-base-300/60 bg-base-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {cartFooter}
            </div>
          </div>
        </div>
      ) : null}

      <dialog id="quick-sale-confirm" className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-md rounded-t-3xl sm:rounded-3xl">
          <div
            className={`mb-4 grid size-14 place-items-center rounded-2xl ${
              method === "cash"
                ? "bg-success/10 text-success"
                : "bg-info/10 text-info"
            }`}
          >
            {method === "cash" ? (
              <Banknote className="size-7" />
            ) : (
              <CreditCard className="size-7" />
            )}
          </div>
          <h3 className="text-2xl font-black">تأكيد الدفع</h3>
          <p className="mt-2 leading-7 text-base-content/60">
            هل تريد تأكيد الدفع بطريقة{" "}
            <span className="font-black text-base-content">{methodLabel}</span>{" "}
            بمبلغ{" "}
            <span className="font-black text-primary">{formatMoney(total)}</span>؟
          </p>
          <div className="modal-action mt-6 flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn btn-ghost rounded-xl"
              onClick={closeModal}
              disabled={pending}
            >
              إلغاء
            </button>
            <button
              type="button"
              className={`btn rounded-xl ${
                method === "cash" ? "btn-success" : "btn-info"
              }`}
              onClick={confirmPay}
              disabled={pending || !method}
            >
              {pending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الدفع والطباعة...
                </>
              ) : (
                `تأكيد الدفع ${methodLabel}`
              )}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit" disabled={pending} onClick={() => setMethod(null)}>
            إغلاق
          </button>
        </form>
      </dialog>
    </>
  );
}
