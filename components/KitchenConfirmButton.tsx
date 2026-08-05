"use client";

import { useTransition } from "react";
import { ChefHat, LoaderCircle, Printer } from "lucide-react";
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
      className="btn btn-secondary btn-lg w-full gap-2 rounded-2xl shadow-lg shadow-secondary/15"
      disabled={pending || disabled}
      onClick={confirm}
    >
      {pending ? (
        <LoaderCircle className="size-5 animate-spin" />
      ) : (
        <Printer className="size-5" />
      )}
      <ChefHat className="size-5" />
      {pending ? "جاري الإرسال للمطبخ..." : "تأكيد الطلب وطباعة للمطبخ"}
    </button>
  );
}
