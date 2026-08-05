"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { factoryResetDatabase } from "@/app/actions/admin";
import { ActionFeedback } from "@/components/ActionFeedback";

export function FactoryResetPanel() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      setError("اكتب RESET بالحروف الإنجليزية للتأكيد");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await factoryResetDatabase(password);
      if (result && "ok" in result && result.ok) {
        window.location.reload();
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
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
        className="btn btn-ghost btn-sm mt-2 w-full justify-start gap-2 rounded-xl text-base-content/45 hover:text-error"
      >
        <RotateCcw className="size-4" />
        تهيئة المبيعات والطابعات
      </button>

      {open ? (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-lg">
            <h3 className="flex items-center gap-2 text-lg font-black text-error">
              <RotateCcw className="size-5" />
              تهيئة المبيعات والطابعات
            </h3>
            <p className="mt-3 text-sm leading-7 text-base-content/65">
              سيتم حذف:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-base-content/65">
              <li>جميع المبيعات والفواتير</li>
              <li>جميع الطابعات ومحطات الكاشير</li>
              <li>جميع الموظفين (السفرادجية والكاشير)</li>
            </ul>
            <p className="mt-3 text-sm font-bold text-success">
              لن يتم المساس بالأصناف أو التصنيفات أو الطاولات.
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
                    "تأكيد التهيئة"
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
