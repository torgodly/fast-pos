"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CreditCard, LoaderCircle } from "lucide-react";
import { payOrder } from "@/app/actions/orders";
import {
  ActionFeedback,
  type ActionFeedbackTone,
} from "@/components/ActionFeedback";

export function PayButtons({
  orderId,
  totalLabel,
}: {
  orderId: number;
  totalLabel?: string;
}) {
  const router = useRouter();
  const dialogId = useId().replace(/:/g, "");
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<"cash" | "card" | null>(null);
  const [tone, setTone] = useState<ActionFeedbackTone>("info");
  const [message, setMessage] = useState<string | null>(null);

  function askConfirm(method: "cash" | "card") {
    setMessage(null);
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
    setTone("pending");
    setMessage("جاري الدفع والطباعة...");
    startTransition(async () => {
      const result = await payOrder(orderId, selected);

      if ("error" in result) {
        setTone("error");
        setMessage(result.error);
        return;
      }

      closeModal();
      setTone(result.printOk ? "success" : "warning");
      setMessage(result.message);

      // Give the cashier a moment to read feedback, then leave paid order
      window.setTimeout(() => {
        router.replace(result.nextUrl);
        router.refresh();
      }, result.printOk ? 600 : 1800);
    });
  }

  const methodLabel = selected === "cash" ? "نقدي" : "بطاقة";

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="btn h-16 min-h-14 flex-col gap-1 rounded-2xl border-success/20 bg-success/10 text-success hover:border-success/30 hover:bg-success/20 sm:h-20"
          disabled={pending}
          onClick={() => askConfirm("cash")}
        >
          <Banknote className="size-6" />
          <span className="font-black">دفع نقدي</span>
        </button>
        <button
          type="button"
          className="btn h-16 min-h-14 flex-col gap-1 rounded-2xl border-info/20 bg-info/10 text-info hover:border-info/30 hover:bg-info/20 sm:h-20"
          disabled={pending}
          onClick={() => askConfirm("card")}
        >
          <CreditCard className="size-6" />
          <span className="font-black">دفع بالبطاقة</span>
        </button>
      </div>

      <ActionFeedback tone={tone} message={message} />

      <dialog id={dialogId} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-md rounded-t-3xl sm:rounded-3xl">
          <div
            className={`mb-4 grid size-14 place-items-center rounded-2xl ${
              selected === "cash"
                ? "bg-success/10 text-success"
                : "bg-info/10 text-info"
            }`}
          >
            {selected === "cash" ? (
              <Banknote className="size-7" />
            ) : (
              <CreditCard className="size-7" />
            )}
          </div>
          <h3 className="text-2xl font-black">تأكيد الدفع</h3>
          <p className="mt-2 leading-7 text-base-content/60">
            هل تريد تأكيد الدفع بطريقة{" "}
            <span className="font-black text-base-content">{methodLabel}</span>
            {totalLabel ? (
              <>
                {" "}
                بمبلغ{" "}
                <span className="font-black text-primary">{totalLabel}</span>
              </>
            ) : null}
            ؟
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
                selected === "cash" ? "btn-success" : "btn-info"
              }`}
              onClick={confirmPay}
              disabled={pending || !selected}
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
          {pending || message ? (
            <div className="mt-4">
              <ActionFeedback tone={tone} message={message} />
            </div>
          ) : null}
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
