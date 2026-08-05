"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { factoryResetDatabase } from "@/app/actions/admin";
import { ActionFeedback } from "@/components/ActionFeedback";

export function FactoryResetPanel() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function revealPanel() {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, 2000);

    if (tapCount.current >= 5) {
      tapCount.current = 0;
      setOpen(true);
      setError(null);
    }
  }

  function closePanel() {
    if (pending) return;
    setOpen(false);
    setPassword("");
    setConfirmText("");
    setError(null);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmText.trim() !== "RESET") {
      setError('اكتب RESET بالحروف الإنجليزية للتأكيد');
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await factoryResetDatabase(password);
      if (result && "ok" in result && result.ok) {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/admin/login?reset=1";
        return;
      }
      if (result && "error" in result) {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={revealPanel}
        className="mx-auto mt-2 block text-[10px] text-base-content/20 transition hover:text-base-content/40"
        aria-label="إعدادات متقدمة"
      >
        ···
      </button>

      {open ? (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-lg">
            <h3 className="flex items-center gap-2 text-lg font-black text-error">
              <RotateCcw className="size-5" />
              إعادة تهيئة النظام
            </h3>
            <p className="mt-3 text-sm leading-7 text-base-content/65">
              سيتم حذف جميع المبيعات والموظفين والإعدادات الحالية، واستبدالها
              ببيانات البداية: مدير واحد، قائمة الأصناف الكاملة، طاولات
              وطابعات افتراضية — بدون أي مبيعات.
            </p>

            <div className="alert alert-warning mt-4 text-sm">
              <AlertTriangle className="size-5 shrink-0" />
              <span>هذا الإجراء لا يمكن التراجع عنه.</span>
            </div>

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <label className="form-control w-full">
                <span className="label-text mb-2 font-bold">
                  كلمة مرور المدير
                </span>
                <input
                  type="password"
                  className="input input-bordered w-full"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>

              <label className="form-control w-full">
                <span className="label-text mb-2 font-bold">
                  اكتب RESET للتأكيد
                </span>
                <input
                  type="text"
                  className="input input-bordered w-full font-mono uppercase"
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder="RESET"
                  required
                />
              </label>

              <ActionFeedback tone="error" message={error} />

              <div className="modal-action mt-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={closePanel}
                  disabled={pending}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-error"
                  disabled={pending}
                >
                  {pending ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      جاري التهيئة...
                    </>
                  ) : (
                    "تأكيد إعادة التهيئة"
                  )}
                </button>
              </div>
            </form>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={closePanel}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
    </>
  );
}
