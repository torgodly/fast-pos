"use client";

import { useEffect, useRef, useTransition } from "react";
import {
  AlertTriangle,
  LoaderCircle,
  Lock,
  Printer,
  Unlock,
} from "lucide-react";
import {
  closeShiftWithZReport,
  openCashierShift,
  printShiftXReport,
} from "@/app/actions/shifts";
import { useToast } from "@/components/ToastProvider";
import { formatDateTime } from "@/lib/venues";

type ShiftRow = {
  id: number;
  shiftNumber: number;
  status: string;
  openedAt: string;
  closedAt: string | null;
};

export function CashierShiftPanel({
  venueId,
  workDate,
  openShift,
  canOpen,
  nextShiftNumber,
  dayComplete,
}: {
  venueId: string;
  workDate: string;
  openShift: ShiftRow | null;
  canOpen: boolean;
  nextShiftNumber: number | null;
  dayComplete: boolean;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!openShift) dialogRef.current?.close();
  }, [openShift]);

  function run(
    action: () => Promise<{ error: string } | { ok: true; message: string }>,
  ) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        showToast("error", result.error);
        return;
      }
      showToast("success", result.message);
      dialogRef.current?.close();
    });
  }

  return (
    <>
      <section className="premium-card card">
        <div className="card-body gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-base-content/45">
                ورديات اليوم · {workDate}
              </p>
              <h3 className="text-xl font-black">
                {openShift
                  ? `الوردية ${openShift.shiftNumber} مفتوحة`
                  : dayComplete
                    ? "انتهى يوم العمل"
                    : "لا توجد وردية مفتوحة"}
              </h3>
              <p className="mt-1 text-sm text-base-content/50">
                {openShift
                  ? `فُتحت ${formatDateTime(openShift.openedAt)} — تقرير X في أي وقت، Z تقفل الوردية`
                  : dayComplete
                    ? "تم إقفال الورديتين — الوردية التالية غداً"
                    : nextShiftNumber
                      ? `الخطوة التالية: فتح الوردية ${nextShiftNumber}`
                      : "افتح الوردية قبل أي بيع أو تحصيل"}
              </p>
            </div>
            <span
              className={`badge gap-1.5 ${
                openShift
                  ? "badge-success"
                  : dayComplete
                    ? "badge-neutral"
                    : "badge-warning"
              }`}
            >
              {openShift ? (
                <Unlock className="size-3.5" />
              ) : (
                <Lock className="size-3.5" />
              )}
              {openShift ? "مفتوحة" : dayComplete ? "مكتمل" : "مقفلة"}
            </span>
          </div>

          {!openShift && canOpen ? (
            <button
              type="button"
              className="btn btn-primary btn-lg gap-2 rounded-2xl"
              disabled={pending}
              onClick={() => run(() => openCashierShift(venueId))}
            >
              {pending ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : (
                <Unlock className="size-5" />
              )}
              فتح الوردية {nextShiftNumber}
            </button>
          ) : null}

          {!openShift && !canOpen && !dayComplete ? (
            <div className="alert alert-warning rounded-2xl">
              <AlertTriangle className="size-5" />
              <span>لا يمكن فتح وردية الآن</span>
            </div>
          ) : null}

          {openShift ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="btn btn-outline btn-lg gap-2 rounded-2xl"
                disabled={pending}
                onClick={() => run(() => printShiftXReport(venueId))}
              >
                {pending ? (
                  <LoaderCircle className="size-5 animate-spin" />
                ) : (
                  <Printer className="size-5" />
                )}
                طباعة تقرير X
              </button>
              <button
                type="button"
                className="btn btn-error btn-lg gap-2 rounded-2xl"
                disabled={pending}
                onClick={() => dialogRef.current?.showModal()}
              >
                <Lock className="size-5" />
                إقفال الوردية (Z)
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <dialog ref={dialogRef} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-md rounded-t-3xl sm:rounded-3xl">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-error/10 text-error">
            <AlertTriangle className="size-7" />
          </div>
          <h3 className="text-2xl font-black">تأكيد إقفال الوردية</h3>
          <p className="mt-2 leading-7 text-base-content/60">
            سيتم إقفال الوردية{" "}
            <span className="font-black text-base-content">
              {openShift?.shiftNumber ?? ""}
            </span>{" "}
            وطباعة تقرير{" "}
            <span className="font-black text-error">Z</span>. لا يمكن التراجع عن
            هذا الإجراء.
          </p>
          <div className="modal-action mt-6 flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn btn-ghost rounded-xl"
              disabled={pending}
              onClick={() => dialogRef.current?.close()}
            >
              إلغاء
            </button>
            <button
              type="button"
              className="btn btn-error gap-2 rounded-xl"
              disabled={pending || !openShift}
              onClick={() => run(() => closeShiftWithZReport(venueId))}
            >
              {pending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الإقفال...
                </>
              ) : (
                <>
                  <Printer className="size-4" />
                  تأكيد وطباعة Z
                </>
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
