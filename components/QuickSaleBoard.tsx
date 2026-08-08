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
  CategoryPickSummary,
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
    <>
      <CategoryPickSummary
        categories={categories}
        categoryCounts={categoryCounts}
      />
      <ul className="mt-3 space-y-2">
        {cart.map((line) => (
          <li
            key={line.itemId}
            className="rounded-2xl border border-base-300/60 bg-base-100 p-3"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-black">{line.name}</p>
                <p className="text-xs text-base-content/45">
                  {formatMoney(line.unitPrice)} للوحدة
                </p>
              </div>
              <p className="shrink-0 font-black text-primary">
                {formatMoney(line.unitPrice * line.qty)}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div className="join">
                <button
                  type="button"
                  className="btn join-item btn-sm btn-square min-h-11 min-w-11"
                  onClick={() => changeQty(line.itemId, line.qty - 1)}
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
                  onClick={() => changeQty(line.itemId, line.qty + 1)}
                  aria-label="زيادة الكمية"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              <button
                type="button"
                className="btn btn-circle btn-ghost btn-sm text-error"
                onClick={() => remove(line.itemId)}
                aria-label="حذف الصنف"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}
        {cart.length === 0 && (
          <li className="py-8 text-center">
            <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-base-200 text-base-content/20">
              <ShoppingBag className="size-6" />
            </span>
            <p className="font-bold">السلة فارغة</p>
            <p className="text-xs text-base-content/40">اختر صنفاً من القائمة</p>
          </li>
        )}
      </ul>
    </>
  );

  const cartFooter = (
    <>
      <div className="border-t border-dashed border-base-300 pt-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold text-base-content/45">
              الإجمالي المستحق
            </p>
            <p className="text-xs text-base-content/35">
              لا تُسجّل الفاتورة إلا بعد الدفع
            </p>
          </div>
          <span className="text-2xl font-black text-primary">
            {formatMoney(total)}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          className="btn h-16 min-h-14 flex-col gap-1 rounded-2xl border-success/20 bg-success/10 text-success hover:border-success/30 hover:bg-success/20"
          disabled={pending || cart.length === 0}
          onClick={() => askConfirm("cash")}
        >
          <Banknote className="size-6" />
          <span className="font-black">دفع نقدي</span>
        </button>
        <button
          type="button"
          className="btn h-16 min-h-14 flex-col gap-1 rounded-2xl border-info/20 bg-info/10 text-info hover:border-info/30 hover:bg-info/20"
          disabled={pending || cart.length === 0}
          onClick={() => askConfirm("card")}
        >
          <CreditCard className="size-6" />
          <span className="font-black">دفع بالبطاقة</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="grid flex-1 gap-3 pb-28 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-4 lg:pb-0 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <CategoryItemPicker
            categories={categories}
            items={items}
            categoryCounts={categoryCounts}
            pending={pending}
            onAddItem={add}
          />
        </div>

        <aside className="premium-card sticky top-14 hidden lg:flex lg:max-h-[calc(100dvh-4rem)] lg:flex-col lg:overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-base-300/60 bg-base-200/50 px-3 py-3 xl:px-4">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                <ShoppingBag className="size-4" />
              </span>
              <div>
                <h3 className="text-sm font-black">سلة البيع السريع</h3>
                <p className="text-xs text-base-content/40">{itemCount} عنصر</p>
              </div>
            </div>
            <ReceiptText className="size-4 text-base-content/20" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-3 xl:p-4">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {cartItems}
            </div>
            <div className="mt-3 shrink-0 border-t border-base-300/60 bg-base-100 pt-3">
              {cartFooter}
            </div>
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
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-3xl bg-base-100 shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-base-300/60 px-4 py-3">
              <div>
                <p className="font-black">سلة البيع السريع</p>
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
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
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
