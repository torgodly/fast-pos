"use client";

import { useTransition } from "react";
import { ChefHat, LoaderCircle } from "lucide-react";
import { confirmKitchenOrder } from "@/app/actions/orders";
import { useToast } from "@/components/ToastProvider";

export function ReprintKitchenButton({
  orderId,
  className = "btn btn-warning btn-outline btn-sm gap-1.5 rounded-xl",
}: {
  orderId: number;
  className?: string;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await confirmKitchenOrder(orderId);
      if ("error" in result) {
        showToast("warning", result.error);
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
      className={className}
      disabled={pending}
      onClick={run}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : (
        <ChefHat className="size-3.5" />
      )}
      طباعة المطبخ
    </button>
  );
}
