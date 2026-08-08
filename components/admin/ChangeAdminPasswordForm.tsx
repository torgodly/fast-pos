"use client";

import { useState, useTransition } from "react";
import { KeyRound, LoaderCircle, Save } from "lucide-react";
import { changeAdminPassword } from "@/app/actions/admin";
import { ActionFeedback } from "@/components/ActionFeedback";
import { useToast } from "@/components/ToastProvider";

export function ChangeAdminPasswordForm() {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      setError(null);
      const result = await changeAdminPassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast("success", "تم تغيير كلمة مرور المدير بنجاح");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="form-control w-full">
        <span className="label-text mb-1.5 font-bold">كلمة المرور الحالية</span>
        <input
          type="password"
          autoComplete="current-password"
          className="input input-bordered w-full"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
      </label>
      <label className="form-control w-full">
        <span className="label-text mb-1.5 font-bold">كلمة المرور الجديدة</span>
        <input
          type="password"
          autoComplete="new-password"
          className="input input-bordered w-full"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          minLength={6}
          required
        />
        <span className="label-text-alt mt-1.5 text-base-content/45">
          6 أحرف على الأقل
        </span>
      </label>
      <label className="form-control w-full">
        <span className="label-text mb-1.5 font-bold">تأكيد كلمة المرور</span>
        <input
          type="password"
          autoComplete="new-password"
          className="input input-bordered w-full"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          minLength={6}
          required
        />
      </label>
      <ActionFeedback tone="error" message={error} />
      <button type="submit" className="btn btn-primary gap-2" disabled={pending}>
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            جاري الحفظ...
          </>
        ) : (
          <>
            <Save className="size-4" />
            حفظ كلمة المرور
          </>
        )}
      </button>
      <p className="flex items-center gap-2 text-xs text-base-content/45">
        <KeyRound className="size-3.5" />
        ستُستخدم كلمة المرور الجديدة في تسجيل الدخول والتهيئة المتقدمة
      </p>
    </form>
  );
}
