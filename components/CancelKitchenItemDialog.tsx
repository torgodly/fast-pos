"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { Ban, Minus, Plus } from "lucide-react";
import { cancelPrintedOrderItem } from "@/app/actions/orders";
import { ActionFeedback } from "@/components/ActionFeedback";
import { formatMoney } from "@/lib/venues";

const REASONS = ["خطأ طلب", "العميل رفض", "نفد الصنف", "تأخير"] as const;

export type CancelKitchenTarget = {
  id: number;
  name: string;
  qty: number;
  unitPrice: number;
  kitchenSent: number;
  defaultRemoveQty: number;
};

export function CancelKitchenItemDialog({
  target,
  onClose,
}: {
  target: CancelKitchenTarget | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [removeQty, setRemoveQty] = useState(1);
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setRemoveQty(Math.min(target.defaultRemoveQty, target.qty));
    setReason("");
    setCustom(false);
    setError(null);
    setWarning(null);
  }, [target]);

  if (!target) return null;

  const qty = Math.min(Math.max(1, removeQty), target.qty);

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await cancelPrintedOrderItem(target.id, qty, reason);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result.warning) {
        setWarning(result.warning);
        return;
      }
      onClose();
    });
  }

  if (warning) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center">
        <button
          type="button"
          className="absolute inset-0 bg-neutral/50"
          aria-label="إغلاق"
          onClick={onClose}
        />
        <div className="relative w-full max-w-md space-y-3 rounded-2xl border border-warning/40 bg-base-100 p-4 shadow-2xl">
          <h3 className="text-lg font-black">أُلغي من الفاتورة</h3>
          <ActionFeedback tone="warning" message={warning} />
          <button
            type="button"
            className="btn btn-primary w-full rounded-xl"
            onClick={onClose}
          >
            حسناً
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-neutral/50"
        aria-label="إغلاق"
        disabled={pending}
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-md space-y-3 rounded-2xl border border-base-300 bg-base-100 p-4 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-error/10 text-error">
            <Ban className="size-5" />
          </span>
          <div>
            <h3 className="text-lg font-black">إلغاء من الفاتورة</h3>
            <p className="text-sm font-bold">{target.name}</p>
            <p className="text-xs text-base-content/55">
              في الفاتورة {target.qty}× · مطبخ {target.kitchenSent}×
            </p>
          </div>
        </div>

        <div>
          <span className="mb-2 block text-xs font-bold">كم نلغي؟</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-square rounded-xl"
              disabled={qty <= 1}
              onClick={() => setRemoveQty(qty - 1)}
            >
              <Minus className="size-5" />
            </button>
            <span className="min-w-12 text-center text-2xl font-black tabular-nums">
              {qty}
            </span>
            <button
              type="button"
              className="btn btn-square rounded-xl"
              disabled={qty >= target.qty}
              onClick={() => setRemoveQty(qty + 1)}
            >
              <Plus className="size-5" />
            </button>
            <button
              type="button"
              className="btn btn-outline flex-1 rounded-xl"
              onClick={() => setRemoveQty(target.qty)}
            >
              إلغاء الكل ({target.qty})
            </button>
          </div>
          <p className="mt-1 text-[11px] text-base-content/45">
            يبقى {target.qty - qty}× · يخصم {formatMoney(qty * target.unitPrice)}
          </p>
        </div>

        <div>
          <span className="mb-2 block text-xs font-bold">السبب</span>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((item) => (
              <button
                key={item}
                type="button"
                className={`btn btn-sm rounded-xl ${
                  reason === item && !custom ? "btn-error" : "btn-ghost border"
                }`}
                onClick={() => {
                  setReason(item);
                  setCustom(false);
                }}
              >
                {item}
              </button>
            ))}
            <button
              type="button"
              className={`btn btn-sm rounded-xl ${
                custom ? "btn-error" : "btn-ghost border"
              }`}
              onClick={() => {
                setCustom(true);
                if (REASONS.includes(reason as (typeof REASONS)[number])) {
                  setReason("");
                }
              }}
            >
              سبب آخر
            </button>
          </div>
          {custom ? (
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="textarea textarea-bordered mt-2 min-h-20 w-full"
              placeholder="اكتب السبب…"
              required
            />
          ) : null}
        </div>

        <ActionFeedback tone="error" message={error} />

        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-ghost flex-1 rounded-xl"
            disabled={pending}
            onClick={onClose}
          >
            رجوع
          </button>
          <button
            type="submit"
            className="btn btn-error flex-1 rounded-xl"
            disabled={pending || reason.trim().length < 2}
          >
            {pending ? "جاري الإلغاء…" : `إلغاء ${qty}×`}
          </button>
        </div>
      </form>
    </div>
  );
}
