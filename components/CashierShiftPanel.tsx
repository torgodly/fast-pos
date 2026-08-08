"use client";

import { useState, useTransition } from "react";
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
  const [confirmZ, setConfirmZ] = useState(false);

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
      setConfirmZ(false);
    });
  }

  return (
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
                ? `فُتحت ${formatDateTime(openShift.openedAt)} — طباعة X في أي وقت، Z تقفل الوردية`
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
            {!confirmZ ? (
              <button
                type="button"
                className="btn btn-error btn-lg gap-2 rounded-2xl"
                disabled={pending}
                onClick={() => setConfirmZ(true)}
              >
                <Lock className="size-5" />
                إقفال الوردية (Z)
              </button>
            ) : (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <div className="alert alert-error rounded-2xl py-3">
                  <AlertTriangle className="size-5" />
                  <span className="text-sm font-bold">
                    تأكيد: إقفال الوردية {openShift.shiftNumber} وطباعة Z؟ لا يمكن
                    التراجع.
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost rounded-xl"
                    disabled={pending}
                    onClick={() => setConfirmZ(false)}
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    className="btn btn-error rounded-xl gap-2"
                    disabled={pending}
                    onClick={() => run(() => closeShiftWithZReport(venueId))}
                  >
                    {pending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Printer className="size-4" />
                    )}
                    تأكيد وطباعة Z
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
