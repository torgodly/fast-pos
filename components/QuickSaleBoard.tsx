"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CreditCard, LoaderCircle } from "lucide-react";
import { payQuickSale, type QuickSaleLine } from "@/app/actions/orders";
import { finishCheckoutPrint } from "@/lib/print/finish-checkout-print";
import { useToast } from "@/components/ToastProvider";
import {
  CategoryItemPicker,
  type MenuCategory,
  type MenuItem,
} from "@/components/CategoryItemPicker";
import {
  PosMobileBar,
  PosMobileSheet,
  PosTicketLines,
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

  const ticketLines: PosTicketLine[] = cart.map((line) => ({
    key: line.itemId,
    name: line.name,
    qty: line.qty,
    lineTotal: line.unitPrice * line.qty,
    unitPrice: line.unitPrice,
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

  const payFooter = (
    <div className="space-y-1.5">
      <PreviewReceiptButton
        venueId={venueId}
        cart={cart}
        disabled={pending || cart.length === 0}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className="btn btn-success btn-sm h-11 min-h-11 gap-1.5 rounded-lg text-sm"
          disabled={pending || cart.length === 0}
          onClick={() => askConfirm("cash")}
        >
          <Banknote className="size-4" />
          نقدي
        </button>
        <button
          type="button"
          className="btn btn-info btn-sm h-11 min-h-11 gap-1.5 rounded-lg text-sm"
          disabled={pending || cart.length === 0}
          onClick={() => askConfirm("card")}
        >
          <CreditCard className="size-4" />
          بطاقة
        </button>
      </div>
    </div>
  );

  const mobileFooter = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-base-content/50">
          الإجمالي
        </span>
        <span className="text-lg font-black tabular-nums text-primary">
          {formatMoney(total)}
        </span>
      </div>
      {payFooter}
    </>
  );

  return (
    <>
      <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,34%)] lg:pb-0">
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border border-base-300 bg-base-100 p-1.5">
          <CategoryItemPicker
            categories={categories}
            items={items}
            categoryCounts={categoryCounts}
            pending={pending}
            onAddItem={add}
          />
        </div>

        <div className="hidden min-h-0 lg:flex lg:flex-col">
          <PosTicketPanel
            itemCount={itemCount}
            total={total}
            lines={ticketLines}
            pending={pending}
            emptyLabel="لا أصناف"
            onChangeQty={changeQty}
            onRemove={remove}
            footer={payFooter}
          />
        </div>
      </div>

      <PosMobileBar
        itemCount={itemCount}
        total={total}
        actionLabel="دفع"
        onOpen={() => setCartOpen(true)}
      />

      <PosMobileSheet
        open={cartOpen}
        title="فاتورة"
        itemCount={itemCount}
        onClose={() => setCartOpen(false)}
        footer={mobileFooter}
      >
        <PosTicketLines
          lines={ticketLines}
          pending={pending}
          emptyLabel="لا أصناف"
          onChangeQty={changeQty}
          onRemove={remove}
        />
      </PosMobileSheet>

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
    </>
  );
}
