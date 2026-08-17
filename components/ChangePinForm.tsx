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
              مرحباً {staffName} — يجب تعيين رمز شخصي جديد قبل بدء العمل، ولا
              يمكن أن يكون نفس الرمز الحالي.
            </p>
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
                pattern="\d{4,6}"
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
                pattern="\d{4,6}"
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
                pattern="\d{4,6}"
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
