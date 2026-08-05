"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { loginAdmin } from "@/app/actions/auth";

export function AdminLoginForm({ resetNotice = false }: { resetNotice?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await loginAdmin(
        String(formData.get("username") ?? ""),
        String(formData.get("password") ?? ""),
      );
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="glass-panel card w-full max-w-md overflow-hidden">
      <div className="h-1.5 bg-gradient-to-l from-primary via-secondary to-accent" />
      <div className="card-body p-6 sm:p-9">
        <div className="mb-2 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheck className="size-7" />
        </div>
        <h1 className="card-title mt-2 text-3xl font-black">دخول الإدارة</h1>
        <p className="text-sm leading-6 text-base-content/55">
          سجّل الدخول لإدارة الأصناف والموظفين ومتابعة المبيعات
        </p>

        {resetNotice ? (
          <div className="alert alert-success alert-soft mt-4 text-sm">
            <span>
              تمت إعادة تهيئة النظام. سجّل الدخول باستخدام admin / admin123
              ثم غيّر كلمة المرور.
            </span>
          </div>
        ) : null}

        <form action={onSubmit} className="mt-5 flex flex-col gap-4">
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">اسم المستخدم</span>
            <div className="relative">
              <UserRound className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-base-content/35" />
              <input
                name="username"
                className="input input-bordered h-13 w-full pr-12 focus:border-primary"
                defaultValue="admin"
                required
              />
            </div>
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">كلمة المرور</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-base-content/35" />
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                className="input input-bordered h-13 w-full px-12 focus:border-primary"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="btn btn-circle btn-ghost btn-sm absolute left-2 top-1/2 -translate-y-1/2"
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </label>

          {error && (
            <div className="alert alert-error alert-soft text-sm">
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg mt-1 rounded-2xl shadow-lg shadow-primary/20"
            disabled={pending}
          >
            {pending ? (
              <>
                <LoaderCircle className="size-5 animate-spin" />
                جاري الدخول...
              </>
            ) : (
              <>
                دخول لوحة الإدارة
                <ArrowLeft className="size-5" />
              </>
            )}
          </button>
        </form>

        <Link
          href="/"
          className="btn btn-ghost mt-2 gap-2 rounded-xl text-base-content/55"
        >
          <ArrowRight className="size-4" />
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}
