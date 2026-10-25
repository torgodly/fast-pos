"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Clock3,
  CreditCard,
  LoaderCircle,
  Wallet,
} from "lucide-react";
import { payOrder } from "@/app/actions/orders";
import { finishCheckoutPrint } from "@/lib/print/finish-checkout-print";
import { useToast } from "@/components/ToastProvider";
import type { PaymentMethodLike } from "@/lib/payments/core";

export function PayButtons({
  orderId,
  totalLabel,
  shiftOpen,
  paymentMethods,
  held = false,
}: {
  orderId: number;
  totalLabel?: string;
  shiftOpen: boolean;
  paymentMethods: PaymentMethodLike[];
  held?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const dialogId = useId().replace(/:/g, "");
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);

  const selectedMethod =
    paymentMethods.find((method) => method.code === selected) ?? null;
  const holding = !!selectedMethod?.deferred;

  function askConfirm(method: string) {
    setSelected(method);
    const dialog = document.getElementById(dialogId) as HTMLDialogElement | null;
    dialog?.showModal();
  }

  function closeModal() {
    const dialog = document.getElementById(dialogId) as HTMLDialogElement | null;
    dialog?.close();
    setSelected(null);
  }

  function methodClass(method: PaymentMethodLike) {
    if (method.cashDrawer) return "btn-success";
    if (method.code === "card") return "btn-info";
    if (method.deferred) return "btn-warning";
    return "btn-neutral btn-outline";
  }

  function methodIcon(method: PaymentMethodLike) {
    if (method.cashDrawer) return <Banknote className="size-4" />;
    if (method.code === "card") return <CreditCard className="size-4" />;
    if (method.deferred) return <Clock3 className="size-4" />;
    return <Wallet className="size-4" />;
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

      if (result.held) {
        showToast("success", result.message);
        window.setTimeout(() => {
          router.replace(result.nextUrl);
          router.refresh();
        }, 700);
        return;
      }

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

  return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        {paymentMethods.map((method) => {
          const blockedByShift = !shiftOpen && !method.deferred;
          return (
            <button
              key={method.code}
              type="button"
              className={`btn btn-sm h-11 min-h-11 gap-1.5 rounded-lg text-sm ${methodClass(method)}`}
              disabled={pending || blockedByShift}
              title={blockedByShift ? "افتح الوردية أولاً" : method.name}
              onClick={() => askConfirm(method.code)}
            >
              {methodIcon(method)}
              {method.name}
            </button>
          );
        })}
      </div>

      {!shiftOpen ? (
        <p className="text-xs font-bold text-warning">
          لا توجد وردية مفتوحة — الدفع موقوف. يمكن تعليق الطلبات الآجلة فقط حتى
          يفتحها الكاشير الرئيسي.
        </p>
      ) : null}

      <dialog id={dialogId} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-sm rounded-t-2xl p-4 sm:rounded-2xl">
          <h3 className="text-base font-black">
            {holding
              ? held
                ? "تحديث تعليق الطلب"
                : "تأكيد تعليق الطلب"
              : held
                ? "تحصيل الطلب المعلّق"
                : "تأكيد الدفع"}
          </h3>
          <p className="mt-1 text-sm text-base-content/60">
            {selectedMethod?.name ?? ""}
            {totalLabel ? ` · ${totalLabel}` : ""}
          </p>
          {holding ? (
            <p className="mt-2 rounded-lg bg-warning/10 px-2.5 py-2 text-xs leading-6 text-base-content/70">
              سيبقى الطلب مفتوحاً باسم «{selectedMethod?.name}» (آجل) دون تحصيل
              أو طباعة فاتورة، حتى تستلمه لاحقاً وتختار طريقة الدفع الفعلية.
            </p>
          ) : held ? (
            <p className="mt-2 rounded-lg bg-success/10 px-2.5 py-2 text-xs leading-6 text-base-content/70">
              سيُحوّل الطلب من «آجل» إلى مدفوع بطريقة «
              {selectedMethod?.name}» ويُحتسب في الوردية الحالية.
            </p>
          ) : null}
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
                holding
                  ? "btn-warning"
                  : selectedMethod?.cashDrawer
                    ? "btn-success"
                    : "btn-primary"
              }`}
              onClick={confirmPay}
              disabled={pending || !selected}
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : holding ? (
                held ? "تحديث التعليق" : "تعليق الطلب"
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
