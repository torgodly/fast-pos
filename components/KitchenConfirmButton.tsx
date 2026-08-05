"use client";

import { useState, useTransition } from "react";
import { ChefHat, LoaderCircle, Printer } from "lucide-react";
import { confirmKitchenOrder } from "@/app/actions/orders";
import {
  ActionFeedback,
  type ActionFeedbackTone,
} from "@/components/ActionFeedback";

export function KitchenConfirmButton({
  orderId,
  disabled,
}: {
  orderId: number;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [tone, setTone] = useState<ActionFeedbackTone>("info");
  const [message, setMessage] = useState<string | null>(null);

  function confirm() {
    setTone("pending");
    setMessage("جاري الإرسال للمطبخ...");
    startTransition(async () => {
      const result = await confirmKitchenOrder(orderId);
      if ("error" in result) {
        setTone("error");
        setMessage(result.error);
        return;
      }
      setTone(result.failed.length > 0 ? "warning" : "success");
      setMessage(result.message);
    });
  }

  return (
    <div className="space-y-2">
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
      <ActionFeedback tone={tone} message={message} />
    </div>
  );
}
