"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { cancelOpenOrder } from "@/app/actions/orders";
import { ConfirmSheet } from "@/components/ConfirmSheet";

export function CancelTableButton({
  orderId,
  hasItems,
}: {
  orderId: number;
  hasItems: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmCancel() {
    startTransition(async () => {
      await cancelOpenOrder(orderId);
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-xs h-7 min-h-7 gap-1 rounded-md text-error"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
        إلغاء
      </button>

      <ConfirmSheet
        open={open}
        title="إلغاء الطاولة"
        description={
          hasItems
            ? "سيتم حذف الأصناف وإلغاء الطاولة. لم يُرسل شيء للمطبخ بعد."
            : "إلغاء هذه الطاولة وإرجاعها إلى المتاحة؟"
        }
        confirmLabel="نعم، إلغاء الطاولة"
        cancelLabel="رجوع"
        tone="error"
        pending={pending}
        icon={<Trash2 className="size-6 text-error" />}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        onConfirm={confirmCancel}
      />
    </>
  );
}
