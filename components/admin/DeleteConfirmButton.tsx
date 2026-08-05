"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

type DeleteResult = { ok: true } | { error: string } | void;

export function DeleteConfirmButton({
  itemName,
  onDelete,
  disabled,
}: {
  itemName: string;
  onDelete: () => Promise<DeleteResult>;
  disabled?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
  }

  function confirm() {
    startTransition(async () => {
      const result = await onDelete();
      if (result && "error" in result) {
        showToast("error", result.error);
        return;
      }
      showToast("success", `تم حذف «${itemName}»`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-square btn-ghost btn-sm text-error hover:bg-error/10"
        title="حذف"
        disabled={disabled || pending}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
      </button>

      {open ? (
        <dialog className="modal modal-open z-[60]">
          <div className="modal-box max-w-md rounded-3xl">
            <h3 className="text-lg font-black text-error">تأكيد الحذف</h3>
            <p className="mt-3 text-sm leading-7 text-base-content/65">
              هل تريد حذف <span className="font-black">{itemName}</span>؟ لا
              يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="modal-action mt-4">
              <button
                type="button"
                className="btn btn-ghost rounded-xl"
                onClick={close}
                disabled={pending}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-error rounded-xl"
                onClick={confirm}
                disabled={pending}
              >
                {pending ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    جاري الحذف...
                  </>
                ) : (
                  "حذف نهائياً"
                )}
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={close}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
    </>
  );
}
