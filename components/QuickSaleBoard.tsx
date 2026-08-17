"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CreditCard, LoaderCircle } from "lucide-react";
import { payQuickSale, type QuickSaleLine } from "@/app/actions/orders";
import { finishCheckoutPrint } from "@/lib/print/finish-checkout-print";
import { useToast } from "@/components/ToastProvider";
import {
  quickSalePayNotice,
  type PayNotice,
} from "@/lib/orders/rules";
import {
  CategoryItemPicker,
  type MenuCategory,
  type MenuItem,
} from "@/components/CategoryItemPicker";
import {
  PosTicketPanel,
  type PosTicketLine,
} from "@/components/PosTicket";
import { PreviewReceiptButton } from "@/components/PreviewReceiptButton";
import { formatMoney } from "@/lib/venues";

export function QuickSaleBoard({
  venueId,
  categories,
  items,
}: {
  venueId: string;
  categories: MenuCategory[];
  items: MenuItem[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [cart, setCart] = useState<QuickSaleLine[]>([]);
  const [method, setMethod] = useState<"cash" | "card" | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PayNotice | null>(null);

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

  const ticketLines: PosTicketLine[] = cart.map((line) => ({
    key: line.itemId,
    name: line.name,
    qty: line.qty,
    lineTotal: line.unitPrice * line.qty,
    unitPrice: line.unitPrice,
    note: line.note,
  }));

  function add(item: MenuItem) {
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
          note: "",
        },
      ];
    });
  }

  function changeQty(key: string | number, qty: number) {
    const itemId = Number(key);
    setCart((prev) =>
      qty <= 0
        ? prev.filter((line) => line.itemId !== itemId)
        : prev.map((line) => (line.itemId === itemId ? { ...line, qty } : line)),
    );
  }

  function remove(key: string | number) {
    const itemId = Number(key);
    setCart((prev) => prev.filter((line) => line.itemId !== itemId));
  }

  function changeNote(key: string | number, note: string) {
    const itemId = Number(key);
    setCart((prev) =>
      prev.map((line) =>
        line.itemId === itemId ? { ...line, note } : line,
      ),
    );
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

  function showResult(notice: PayNotice) {
    setResult(notice);
    const dialog = document.getElementById(
      "quick-sale-result",
    ) as HTMLDialogElement | null;
    dialog?.showModal();
  }

  function closeResult() {
    const dialog = document.getElementById(
      "quick-sale-result",
    ) as HTMLDialogElement | null;
    dialog?.close();
    setResult(null);
  }

  function confirmPay() {
    if (!method) return;
    startTransition(async () => {
      const payResult = await payQuickSale(venueId, cart, method);
      if ("error" in payResult) {
        showToast("error", payResult.error);
        return;
      }

      closeModal();
      setCart([]);

      let kitchenFailed = payResult.kitchenFailed;
      let receiptFailed = payResult.receiptFailed;

      if (payResult.browserPrint && payResult.receiptHtml) {
        const printed = await finishCheckoutPrint({
          browserPrint: true,
          receiptHtml: payResult.receiptHtml,
        });
        if (!printed.printOk) {
          receiptFailed = true;
        }
      }

      showResult(
        quickSalePayNotice({
          orderId: payResult.orderId,
          kitchenFailed,
          receiptFailed,
        }),
      );
      router.refresh();
    });
  }

  const methodLabel = method === "cash" ? "نقدي" : "بطاقة";

  const payFooter = (
    <div className="grid grid-cols-[1fr_auto] gap-1">
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          className="btn btn-success btn-sm h-9 min-h-9 gap-1 rounded-lg px-2 text-xs"
          disabled={pending || cart.length === 0}
          onClick={() => askConfirm("cash")}
        >
          <Banknote className="size-3.5" />
          نقدي
        </button>
        <button
          type="button"
          className="btn btn-info btn-sm h-9 min-h-9 gap-1 rounded-lg px-2 text-xs"
          disabled={pending || cart.length === 0}
          onClick={() => askConfirm("card")}
        >
          <CreditCard className="size-3.5" />
          بطاقة
        </button>
      </div>
      <PreviewReceiptButton
        venueId={venueId}
        cart={cart}
        compact
        disabled={pending || cart.length === 0}
      />
    </div>
  );

  return (
    <>
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(10.75rem,36%)] overflow-hidden sm:grid-cols-[minmax(0,1fr)_minmax(16rem,34%)] lg:grid-cols-[minmax(0,1fr)_minmax(18rem,32%)]">
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border border-base-300 bg-base-100 p-1.5">
          <CategoryItemPicker
            categories={categories}
            items={items}
            categoryCounts={categoryCounts}
            pending={pending}
            dense
            onAddItem={add}
          />
        </div>

        <div className="flex min-h-0 flex-col">
          <PosTicketPanel
            title="الطلب"
            itemCount={itemCount}
            total={total}
            lines={ticketLines}
            pending={pending}
            emptyLabel="لا أصناف"
            compact
            onChangeQty={changeQty}
            onRemove={remove}
            onChangeNote={changeNote}
            footer={payFooter}
          />
        </div>
      </div>

      <dialog id="quick-sale-confirm" className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-sm rounded-t-2xl p-4 sm:rounded-2xl">
          <h3 className="text-base font-black">تأكيد الدفع</h3>
          <p className="mt-1 text-sm text-base-content/60">
            {methodLabel} · {formatMoney(total)}
          </p>
          <div className="modal-action mt-4 gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={closeModal}
              disabled={pending}
            >
              إلغاء
            </button>
            <button
              type="button"
              className={`btn btn-sm ${
                method === "cash" ? "btn-success" : "btn-info"
              }`}
              onClick={confirmPay}
              disabled={pending || !method}
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                "تأكيد"
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

      <dialog id="quick-sale-result" className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-sm rounded-t-2xl p-4 sm:rounded-2xl">
          <h3 className="text-base font-black">{result?.title}</h3>
          <ul className="mt-3 space-y-1.5 text-sm">
            {result?.lines.map((line) => (
              <li
                key={line.text}
                className={
                  line.tone === "error"
                    ? "font-bold text-error"
                    : line.tone === "muted"
                      ? "text-base-content/55"
                      : "font-bold"
                }
              >
                {line.text}
              </li>
            ))}
          </ul>
          <div className="modal-action mt-4">
            <button
              type="button"
              className="btn btn-primary btn-sm w-full"
              onClick={closeResult}
            >
              حسناً — بيع جديد
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit" onClick={() => setResult(null)}>
            إغلاق
          </button>
        </form>
      </dialog>
    </>
  );
}
