"use client";

import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export function ConfirmSheet({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "رجوع",
  tone = "primary",
  pending = false,
  icon,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "error";
  pending?: boolean;
  icon?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const confirmClass =
    tone === "error" ? "btn-error" : "btn-primary";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-neutral/55"
        aria-label="إغلاق"
        disabled={pending}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-sheet-title"
        className="relative w-full max-w-md rounded-t-3xl border border-base-300 bg-base-100 p-5 shadow-2xl sm:rounded-3xl"
        style={{
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
        }}
      >
        {icon ? (
          <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-base-200">
            {icon}
          </div>
        ) : null}
        <h3 id="confirm-sheet-title" className="text-xl font-black">
          {title}
        </h3>
        <div className="mt-2 text-sm leading-7 text-base-content/65">
          {description}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            className="btn h-12 flex-1 rounded-2xl"
            disabled={pending}
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn h-12 flex-1 rounded-2xl ${confirmClass}`}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                جاري التنفيذ…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
