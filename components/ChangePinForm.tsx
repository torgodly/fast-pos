"use client";

import { useState, useTransition } from "react";
import { KeyRound, LoaderCircle, LogOut, ShieldAlert } from "lucide-react";
import { changeStaffPin } from "@/app/actions/auth";
import { ActionFeedback } from "@/components/ActionFeedback";
import { LogoutButton } from "@/components/LogoutButton";

export function ChangePinForm({
  venueId,
  staffName,
}: {
  venueId: string;
  staffName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const currentPin = String(formData.get("currentPin") ?? "").trim();
    const newPin = String(formData.get("newPin") ?? "").trim();
    const confirmPin = String(formData.get("confirmPin") ?? "").trim();

    if (newPin === currentPin) {
      setError("الرمز الجديد لا يمكن أن يكون نفس الرمز القديم");
      return;
    }
    if (newPin !== confirmPin) {
      setError("تأكيد الرمز غير مطابق");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await changeStaffPin(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      window.location.href = result.redirectTo;
    });
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="glass-panel card">
        <div className="h-1 bg-gradient-to-l from-warning via-primary to-accent" />
        <div className="card-body gap-4 p-4 sm:p-6">
          <div className="grid size-11 place-items-center rounded-2xl bg-warning/15 text-warning sm:size-12">
            <ShieldAlert className="size-5 sm:size-6" />
          </div>
          <div>
            <h1 className="text-xl font-black sm:text-2xl">تغيير رمز الدخول</h1>
            <p className="mt-1 text-sm text-base-content/55">
              مرحباً {staffName} — عيّن رمزاً شخصياً جديداً قبل العمل.
            </p>
            <ul className="mt-2 list-disc space-y-1 pe-5 text-xs font-bold text-base-content/55">
              <li>لا يمكن أن يكون نفس الرمز القديم</li>
              <li>لا يمكن أن يكون مستخدماً من أي موظف آخر</li>
            </ul>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <input type="hidden" name="venueId" value={venueId} />
            <label className="form-control w-full">
              <span className="label-text mb-1.5 font-bold">الرمز الحالي</span>
              <input
                name="currentPin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                pattern="[0-9]{4,6}"
                className="input input-bordered w-full font-mono tracking-widest"
                placeholder="الرمز المؤقت"
                required
              />
            </label>
            <label className="form-control w-full">
              <span className="label-text mb-1.5 font-bold">الرمز الجديد</span>
              <input
                name="newPin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                pattern="[0-9]{4,6}"
                className="input input-bordered w-full font-mono tracking-widest"
                placeholder="4–6 أرقام"
                required
              />
            </label>
            <label className="form-control w-full">
              <span className="label-text mb-1.5 font-bold">تأكيد الرمز الجديد</span>
              <input
                name="confirmPin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                pattern="[0-9]{4,6}"
                className="input input-bordered w-full font-mono tracking-widest"
                placeholder="أعد إدخال الرمز"
                required
              />
            </label>

            <ActionFeedback tone="error" message={error} />

            <button
              type="submit"
              className="btn btn-primary btn-lg w-full gap-2 rounded-2xl"
              disabled={pending}
            >
              {pending ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : (
                <KeyRound className="size-5" />
              )}
              حفظ والمتابعة
            </button>
          </form>

          <LogoutButton className="btn btn-ghost btn-sm gap-2 text-error">
            <LogOut className="size-4" />
            تسجيل الخروج
          </LogoutButton>
        </div>
      </div>
    </div>
  );
}
