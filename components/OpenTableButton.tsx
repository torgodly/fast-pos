"use client";

import { useId, useTransition } from "react";
import { Armchair, LoaderCircle, Users } from "lucide-react";
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
        className="flex min-h-24 w-full flex-col justify-between rounded-xl border border-base-300/70 bg-base-100 px-3 py-2.5 text-right hover:border-primary/40"
      >
        <div>
          <p className="font-black">{tableName}</p>
          <p className="text-xs text-base-content/45">متاحة</p>
        </div>
        <Armchair className="size-4 text-base-content/25" />
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
