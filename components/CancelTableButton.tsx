"use client";

import { Trash2 } from "lucide-react";
import { cancelOpenOrder } from "@/app/actions/orders";

export function CancelTableButton({
  orderId,
  hasItems,
}: {
  orderId: number;
  hasItems: boolean;
}) {
  return (
    <form
      action={async () => {
        await cancelOpenOrder(orderId);
      }}
      onSubmit={(event) => {
        const ok = window.confirm(
          hasItems
            ? "إلغاء الطاولة وحذف الأصناف؟ لم يُرسل شيء للمطبخ بعد."
            : "إلغاء الطاولة؟",
        );
        if (!ok) event.preventDefault();
      }}
    >
      <button
        type="submit"
        className="btn btn-ghost btn-xs h-7 min-h-7 gap-1 rounded-md text-error"
      >
        <Trash2 className="size-3.5" />
        إلغاء
      </button>
    </form>
  );
}
