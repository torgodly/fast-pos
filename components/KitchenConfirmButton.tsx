"use client";

import { useTransition } from "react";
import { LoaderCircle, Printer } from "lucide-react";
import { confirmKitchenOrder } from "@/app/actions/orders";
import { useToast } from "@/components/ToastProvider";

export function KitchenConfirmButton({
  orderId,
  disabled,
}: {
  orderId: number;
  disabled?: boolean;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await confirmKitchenOrder(orderId);
      if ("error" in result) {
        showToast("error", result.error);
        return;
      }
      showToast(
        result.failed.length > 0 ? "warning" : "success",
        result.message,
      );
    });
  }

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm h-9 min-h-9 w-full gap-1.5 rounded-md text-xs"
      disabled={pending || disabled}
      onClick={confirm}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : (
        <Printer className="size-3.5" />
      )}
      {pending ? "جاري الإرسال..." : "تأكيد للمطبخ"}
    </button>
  );
}
