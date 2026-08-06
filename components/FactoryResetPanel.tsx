"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import {
  factoryResetDatabase,
  type FactoryResetOptions,
} from "@/app/actions/admin";
import { ActionFeedback } from "@/components/ActionFeedback";

const defaultOptions: FactoryResetOptions = {
  sales: true,
  printers: true,
  staff: true,
  menu: false,
  tables: false,
  receiptSettings: false,
};

const resetChoices: {
  key: keyof FactoryResetOptions;
  label: string;
  hint: string;
}[] = [
  {
    key: "sales",
    label: "المبيعات والفواتير",
    hint: "جميع الطلبات وسجل الدفع",
  },
  {
    key: "printers",
    label: "الطابعات",
    hint: "إعدادات الطباعة وربط الأصناف بالمطبخ",
  },
  {
    key: "staff",
    label: "الموظفون (عدا المدير)",
    hint: "السفرادجية والكاشير — يبقى حساب المدير",
  },
  {
    key: "menu",
    label: "الأصناف والتصنيفات",
    hint: "يحذف القائمة بالكامل — يشمل المبيعات تلقائياً",
  },
  {
    key: "tables",
    label: "الطاولات",
    hint: "أسماء وترقيم الطاولات",
  },
  {
    key: "receiptSettings",
    label: "إعدادات الإيصال",
    hint: "رسالة أسفل الفاتورة",
  },
];

type FactoryResetPanelProps = {
  open: boolean;
  onClose: () => void;
};

export function FactoryResetPanel({ open, onClose }: FactoryResetPanelProps) {
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [options, setOptions] =
    useState<FactoryResetOptions>(defaultOptions);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function closePanel() {
    if (pending) return;
    onClose();
    setPassword("");
    setConfirmText("");
    setOptions(defaultOptions);
    setError(null);
  }

  function toggleOption(key: keyof FactoryResetOptions) {
    setOptions((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (key === "menu" && next.menu) {
        next.sales = true;
      }
      return next;
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Object.values(options).some(Boolean)) {
      setError("اختر عنصراً واحداً على الأقل للتهيئة");
      return;
    }
    if (confirmText.trim() !== "RESET") {
      setError("اكتب RESET بالحروف الإنجليزية للتأكيد");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await factoryResetDatabase(password, options);
      if (result && "ok" in result && result.ok) {
        window.location.reload();
        return;
      }
      if (result && "error" in result) {
        setError(result.error);
      }
    });
  }

  if (!open) return null;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-lg">
        <h3 className="flex items-center gap-2 text-lg font-black text-error">
          <RotateCcw className="size-5" />
          تهيئة البيانات
        </h3>
        <p className="mt-3 text-sm leading-7 text-base-content/65">
          اختر ما تريد حذفه. لا يمكن التراجع عن هذا الإجراء.
        </p>

        <div className="mt-4 space-y-2 rounded-2xl border border-base-300/60 bg-base-200/40 p-3">
          {resetChoices.map((choice) => (
            <label
              key={choice.key}
              className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-base-100/70"
            >
              <input
                type="checkbox"
                className="checkbox checkbox-error checkbox-sm mt-0.5"
                checked={options[choice.key]}
                onChange={() => toggleOption(choice.key)}
                disabled={
                  pending || (choice.key === "sales" && options.menu)
                }
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold">{choice.label}</span>
                <span className="block text-xs text-base-content/45">
                  {choice.hint}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="alert alert-warning mt-4 text-sm">
          <AlertTriangle className="size-5 shrink-0" />
          <span>الأصناف والطاولات والمدير لن يُمسّوا إلا إذا اخترتها أعلاه.</span>
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">كلمة مرور المدير</span>
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
            <span className="label-text mb-2 font-bold">اكتب RESET للتأكيد</span>
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
            <button type="submit" className="btn btn-error" disabled={pending}>
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
  );
}
