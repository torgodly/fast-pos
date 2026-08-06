"use client";

import { useTransition } from "react";
import { LoaderCircle, Printer } from "lucide-react";
import { reprintOrderReceipt } from "@/app/actions/orders";
import { finishCheckoutPrint } from "@/lib/print/finish-checkout-print";
import { useToast } from "@/components/ToastProvider";

export function ReprintReceiptButton({
  orderId,
  venueId,
  className = "btn btn-outline btn-sm gap-1.5 rounded-xl",
}: {
  orderId: number;
  venueId: string;
  className?: string;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await reprintOrderReceipt(orderId, venueId);
      if ("error" in result) {
        showToast("error", result.error);
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
        message = printed.printOk ? "تمت إعادة الطباعة" : printed.message;
      }

      showToast(printOk ? "success" : "warning", message);
    });
  }

  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={run}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : (
        <Printer className="size-3.5" />
      )}
      إعادة طباعة
    </button>
  );
}
