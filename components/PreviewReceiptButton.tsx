"use client";

import { useTransition } from "react";
import { LoaderCircle, ReceiptText } from "lucide-react";
import {
  printOpenOrderReceipt,
  printQuickSalePreview,
  type QuickSaleLine,
} from "@/app/actions/orders";
import { useToast } from "@/components/ToastProvider";

export function PreviewReceiptButton({
  orderId,
  venueId,
  cart,
  customerId,
  disabled,
  compact = false,
}: {
  orderId?: number;
  venueId?: string;
  cart?: QuickSaleLine[];
  customerId?: number | null;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result =
        orderId != null
          ? await printOpenOrderReceipt(orderId)
          : venueId
            ? await printQuickSalePreview(venueId, cart ?? [], customerId ?? null)
            : { error: "طلب غير صالح" };

      if ("error" in result) {
        showToast("error", result.error);
        return;
      }

      showToast(
        result.printOk ? "success" : "warning",
        result.message,
      );
    });
  }

  return (
    <button
      type="button"
      className={`btn btn-outline btn-sm rounded-lg ${
        compact ? "h-9 min-h-9 gap-1 px-2 text-xs" : "h-11 min-h-11 w-full gap-1.5 text-sm"
      }`}
      disabled={pending || disabled}
      onClick={run}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <ReceiptText className="size-4" />
      )}
      {pending
        ? "جاري…"
        : compact
          ? "فاتورة"
          : "طباعة الفاتورة للعميل"}
    </button>
  );
}
