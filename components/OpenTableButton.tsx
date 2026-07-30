"use client";

import { useId, useTransition } from "react";
import { Armchair, CheckCircle2, LoaderCircle, Users } from "lucide-react";
import { openTableOrder } from "@/app/actions/orders";

export function OpenTableButton({
  venueId,
  tableId,
  tableName,
}: {
  venueId: string;
  tableId: number;
  tableName: string;
}) {
  const dialogId = useId().replace(/:/g, "");
  const [pending, startTransition] = useTransition();

  function openModal() {
    const dialog = document.getElementById(dialogId) as HTMLDialogElement | null;
    dialog?.showModal();
  }

  function closeModal() {
    const dialog = document.getElementById(dialogId) as HTMLDialogElement | null;
    dialog?.close();
  }

  function confirmOpen() {
    startTransition(async () => {
      await openTableOrder(venueId, tableId);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="group card min-h-44 w-full border border-base-300/70 bg-base-100 text-right shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg sm:min-h-52"
      >
        <div className="card-body justify-between p-4 sm:p-5">
          <div className="flex items-start justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-base-200 text-base-content/35">
              <Armchair className="size-5" />
            </span>
            <span className="badge badge-ghost badge-sm gap-1 text-base-content/55">
              <CheckCircle2 className="size-3" />
              متاحة
            </span>
          </div>
          <div>
            <h3 className="text-xl font-black sm:text-2xl">{tableName}</h3>
            <p className="mt-1 text-xs text-base-content/45">
              اضغط لفتح فاتورة
            </p>
          </div>
        </div>
      </button>

      <dialog id={dialogId} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-md rounded-t-3xl sm:rounded-3xl">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Users className="size-7" />
          </div>
          <h3 className="text-2xl font-black">تأكيد فتح الطاولة</h3>
          <p className="mt-2 leading-7 text-base-content/60">
            هل تريد أخذ{" "}
            <span className="font-black text-base-content">{tableName}</span>{" "}
            للزبائن الآن؟ ستصبح هذه الطاولة ضمن طاولاتك.
          </p>
          <div className="modal-action mt-6 flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn btn-ghost rounded-xl"
              onClick={closeModal}
              disabled={pending}
            >
              إلغاء
            </button>
            <button
              type="button"
              className="btn btn-primary rounded-xl"
              onClick={confirmOpen}
              disabled={pending}
            >
              {pending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الفتح...
                </>
              ) : (
                "نعم، افتح الطاولة"
              )}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit" disabled={pending}>
            إغلاق
          </button>
        </form>
      </dialog>
    </>
  );
}
