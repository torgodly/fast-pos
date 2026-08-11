"use client";

import { useTransition } from "react";
import { LoaderCircle, ReceiptText } from "lucide-react";
import {
  printOpenOrderReceipt,
  printQuickSalePreview,
  type QuickSaleLine,
} from "@/app/actions/orders";
import { finishCheckoutPrint } from "@/lib/print/finish-checkout-print";
import { useToast } from "@/components/ToastProvider";

export function PreviewReceiptButton({
  orderId,
  venueId,
  cart,
  disabled,
}: {
  orderId?: number;
  venueId?: string;
  cart?: QuickSaleLine[];
  disabled?: boolean;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result =
        orderId != null
          ? await printOpenOrderReceipt(orderId)
          : venueId
            ? await printQuickSalePreview(venueId, cart ?? [])
            : { error: "طلب غير صالح" };

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
        message = printed.printOk ? "تمت طباعة الفاتورة للعميل" : printed.message;
      }

      showToast(printOk ? "success" : "warning", message);
    });
  }

  return (
    <button
      type="button"
      className="btn btn-outline btn-sm h-11 min-h-11 w-full gap-1.5 rounded-lg text-sm"
      disabled={pending || disabled}
      onClick={run}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <ReceiptText className="size-4" />
      )}
      {pending ? "جاري الطباعة..." : "طباعة الفاتورة للعميل"}
    </button>
  );
}
