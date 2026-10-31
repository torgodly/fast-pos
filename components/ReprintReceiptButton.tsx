"use client";

import { useTransition } from "react";
import { LoaderCircle, Printer } from "lucide-react";
import { reprintOrderReceipt } from "@/app/actions/orders";
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

      showToast(
        result.printOk ? "success" : "warning",
        result.message,
      );
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
