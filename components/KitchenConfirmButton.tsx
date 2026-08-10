"use client";

import { useTransition } from "react";
import { CheckCircle2, LoaderCircle, Printer } from "lucide-react";
import { confirmKitchenOrder } from "@/app/actions/orders";
import { useToast } from "@/components/ToastProvider";

export function KitchenConfirmButton({
  orderId,
  disabled,
  allSent = false,
}: {
  orderId: number;
  disabled?: boolean;
  /** True when every line qty is already printed to kitchen. */
  allSent?: boolean;
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

  if (allSent) {
    return (
      <div
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-success/40 bg-success/10 text-sm font-black text-success"
        role="status"
      >
        <CheckCircle2 className="size-4.5" />
        تم الإرسال للمطبخ
      </div>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm h-11 min-h-11 w-full gap-1.5 rounded-lg text-sm"
      disabled={pending || disabled}
      onClick={confirm}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Printer className="size-4" />
      )}
      {pending ? "جاري الإرسال..." : "تأكيد للمطبخ"}
    </button>
  );
}
