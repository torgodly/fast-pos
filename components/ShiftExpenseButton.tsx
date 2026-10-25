"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Wallet } from "lucide-react";
import { addShiftExpense } from "@/app/actions/shifts";
import { useToast } from "@/components/ToastProvider";
import { MAX_EXPENSE_REASON_LENGTH } from "@/lib/shifts/cash";

export function ShiftExpenseButton({ venueId }: { venueId: string }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  function reset() {
    setAmount("");
    setReason("");
  }

  function submit() {
    const value = Number.parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) {
      showToast("error", "أدخل مبلغ مصروف أكبر من صفر");
      return;
    }
    const trimmed = reason.trim();
    if (!trimmed) {
      showToast("error", "اكتب سبب المصروف");
      return;
    }

    startTransition(async () => {
      const result = await addShiftExpense(venueId, value, trimmed);
      if ("error" in result) {
        showToast("error", result.error);
        return;
      }
      showToast("success", result.message);
      reset();
      dialogRef.current?.close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm h-9 min-h-9 gap-1.5 rounded-lg px-2.5"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Wallet className="size-4" />
        <span className="hidden sm:inline">مصروف</span>
      </button>

      <dialog ref={dialogRef} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-md rounded-t-3xl sm:rounded-3xl">
          <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-warning/15 text-warning">
            <Wallet className="size-7" />
          </div>
          <h3 className="text-xl font-black">مصروف من الدرج</h3>
          <p className="mt-2 text-sm leading-7 text-base-content/60">
            يُسجل المصروف على الوردية المفتوحة ويُخصم من النقد المتوقع في الدرج.
          </p>

          <label className="form-control mt-3">
            <span className="label-text mb-1 text-xs font-bold">
              المبلغ (د.ل)
            </span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              className="input input-bordered h-12 rounded-xl text-lg font-black"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={pending}
              autoFocus
            />
          </label>

          <label className="form-control mt-3">
            <span className="label-text mb-1 text-xs font-bold">
              سبب المصروف
            </span>
            <input
              type="text"
              maxLength={MAX_EXPENSE_REASON_LENGTH}
              className="input input-bordered h-11 rounded-xl"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={pending}
              placeholder="مثال: شراء ثلج"
            />
          </label>

          <div className="modal-action mt-6 flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn btn-ghost rounded-xl"
              disabled={pending}
              onClick={() => {
                reset();
                dialogRef.current?.close();
              }}
            >
              إلغاء
            </button>
            <button
              type="button"
              className="btn btn-warning gap-2 rounded-xl"
              disabled={pending}
              onClick={submit}
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Wallet className="size-4" />
              )}
              تسجيل المصروف
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit" disabled={pending}>
            إغلاق
          </button>
        </form>
      </dialog>
    </>
  );
}
