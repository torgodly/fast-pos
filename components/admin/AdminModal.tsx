"use client";

import { LoaderCircle } from "lucide-react";

export function AdminModal({
  open,
  title,
  onClose,
  children,
  pending = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  pending?: boolean;
}) {
  if (!open) return null;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-lg">
        <h3 className="text-lg font-black">{title}</h3>
        <div className="mt-4">{children}</div>
        {pending ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-base-content/50">
            <LoaderCircle className="size-4 animate-spin" />
            جاري الحفظ...
          </div>
        ) : null}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose} disabled={pending}>
          close
        </button>
      </form>
    </dialog>
  );
}
