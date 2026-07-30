"use client";

import { useState, useTransition } from "react";
import { ChefHat, LoaderCircle, Printer } from "lucide-react";
import { confirmKitchenOrder } from "@/app/actions/orders";
import {
  buildKitchenReceiptHtml,
  printHtmlReceipt,
} from "@/lib/print/receipts";

export function KitchenConfirmButton({
  orderId,
  disabled,
}: {
  orderId: number;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  function confirm() {
    setError(null);
    setOkMessage(null);
    startTransition(async () => {
      const result = await confirmKitchenOrder(orderId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      try {
        await printHtmlReceipt(buildKitchenReceiptHtml(result.receipt));
        setOkMessage("تم إرسال الطلب للمطبخ وطباعة الإيصال");
      } catch {
        setError("تم تأكيد الطلب لكن فشلت الطباعة — تحقق من الطابعة");
      }
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
        تأكيد الطلب وطباعة للمطبخ
      </button>
      {error ? (
        <p className="text-center text-sm font-bold text-error">{error}</p>
      ) : null}
      {okMessage ? (
        <p className="text-center text-sm font-bold text-success">{okMessage}</p>
      ) : null}
    </div>
  );
}
