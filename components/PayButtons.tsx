"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CreditCard, LoaderCircle } from "lucide-react";
import { payOrder } from "@/app/actions/orders";
import { finishCheckoutPrint } from "@/lib/print/finish-checkout-print";
import { useToast } from "@/components/ToastProvider";

export function PayButtons({
  orderId,
  totalLabel,
}: {
  orderId: number;
  totalLabel?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const dialogId = useId().replace(/:/g, "");
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<"cash" | "card" | null>(null);

  function askConfirm(method: "cash" | "card") {
    setSelected(method);
    const dialog = document.getElementById(dialogId) as HTMLDialogElement | null;
    dialog?.showModal();
  }

  function closeModal() {
    const dialog = document.getElementById(dialogId) as HTMLDialogElement | null;
    dialog?.close();
    setSelected(null);
  }

  function confirmPay() {
    if (!selected) return;
    startTransition(async () => {
      const result = await payOrder(orderId, selected);

      if ("error" in result) {
        showToast("error", result.error);
        return;
      }

      closeModal();

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

      window.setTimeout(() => {
        router.replace(result.nextUrl);
        router.refresh();
      }, printOk ? 600 : 1800);
    });
  }

  const methodLabel = selected === "cash" ? "نقدي" : "بطاقة";

  return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className="btn btn-success btn-sm h-11 min-h-11 gap-1.5 rounded-lg text-sm"
          disabled={pending}
          onClick={() => askConfirm("cash")}
        >
          <Banknote className="size-4" />
          نقدي
        </button>
        <button
          type="button"
          className="btn btn-info btn-sm h-11 min-h-11 gap-1.5 rounded-lg text-sm"
          disabled={pending}
          onClick={() => askConfirm("card")}
        >
          <CreditCard className="size-4" />
          بطاقة
        </button>
      </div>

      <dialog id={dialogId} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-sm rounded-t-2xl p-4 sm:rounded-2xl">
          <h3 className="text-base font-black">تأكيد الدفع</h3>
          <p className="mt-1 text-sm text-base-content/60">
            {methodLabel}
            {totalLabel ? ` · ${totalLabel}` : ""}
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
                selected === "cash" ? "btn-success" : "btn-info"
              }`}
              onClick={confirmPay}
              disabled={pending || !selected}
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
          <button
            type="submit"
            disabled={pending}
            onClick={() => setSelected(null)}
          >
            إغلاق
          </button>
        </form>
      </dialog>
    </>
  );
}
