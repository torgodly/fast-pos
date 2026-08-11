"use client";

import { useTransition } from "react";
import { CheckCircle2, LoaderCircle, Printer } from "lucide-react";
import { confirmKitchenOrder } from "@/app/actions/orders";
import { useToast } from "@/components/ToastProvider";

export function KitchenConfirmButton({
  orderId,
  disabled,
  allSent = false,
  compact = false,
}: {
  orderId: number;
  disabled?: boolean;
  /** True when every line qty is already printed to kitchen. */
  allSent?: boolean;
  compact?: boolean;
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
        className={`flex w-full items-center justify-center gap-1 rounded-lg border border-success/40 bg-success/10 font-black text-success ${
          compact ? "h-9 text-xs" : "h-11 gap-1.5 text-sm"
        }`}
        role="status"
      >
        <CheckCircle2 className={compact ? "size-3.5" : "size-4.5"} />
        {compact ? "أُرسل" : "تم الإرسال للمطبخ"}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`btn btn-secondary btn-sm w-full rounded-lg ${
        compact ? "h-9 min-h-9 gap-1 px-2 text-xs" : "h-11 min-h-11 gap-1.5 text-sm"
      }`}
      disabled={pending || disabled}
      onClick={confirm}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Printer className="size-4" />
      )}
      {pending ? "جاري…" : compact ? "للمطبخ" : "تأكيد للمطبخ"}
    </button>
  );
}
