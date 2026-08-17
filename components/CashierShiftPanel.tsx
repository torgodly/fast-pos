"use client";

import { useRef, useTransition } from "react";
import {
  AlertTriangle,
  LoaderCircle,
  Lock,
  Printer,
  RotateCcw,
} from "lucide-react";
import {
  closeShiftWithZReport,
  printShiftXReport,
  reprintLastZReport,
} from "@/app/actions/shifts";
import { useToast } from "@/components/ToastProvider";
import { formatMoney } from "@/lib/venues";

export function CashierShiftPanel({
  venueId,
  venueLabel,
  lastZLabel,
  zWindowStart,
  zWindowEnd,
  canPrintZ,
  canReprintZ,
  zAlreadyClosedThisWindow,
  preview,
}: {
  venueId: string;
  venueLabel: string;
  lastZLabel: string | null;
  zWindowStart: string;
  zWindowEnd: string;
  canPrintZ: boolean;
  canReprintZ: boolean;
  zAlreadyClosedThisWindow: boolean;
  preview: {
    invoiceCount: number;
    totalSales: number;
    cashTotal: number;
    cardTotal: number;
  };
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

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
      <section className="rounded-xl border border-base-300 bg-base-100 p-4">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-bold text-base-content/45">
              تقارير {venueLabel} فقط — مستقلة عن الفرع الآخر
            </p>
            <h3 className="text-lg font-black">X أي وقت · Z مرة واحدة عند الإقفال</h3>
            <p className="mt-1 text-sm text-base-content/50">
              المبيعات المعروضة: من {lastZLabel ?? "أول فاتورة / بداية التشغيل"}{" "}
              حتى الآن
            </p>
            <p className="text-xs text-base-content/45">
              زر Z يعمل فقط بين {zWindowStart} و {zWindowEnd} (توقيت طرابلس)،
              ومرة واحدة لكل فترة إقفال — بعدها استخدم إعادة الطباعة
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-lg border border-base-300 px-2 py-1.5">
              <p className="text-[11px] text-base-content/45">فواتير</p>
              <p className="font-black">{preview.invoiceCount}</p>
            </div>
            <div className="rounded-lg border border-base-300 px-2 py-1.5">
              <p className="text-[11px] text-base-content/45">الإجمالي</p>
              <p className="font-black text-primary">
                {formatMoney(preview.totalSales)}
              </p>
            </div>
            <div className="rounded-lg border border-base-300 px-2 py-1.5">
              <p className="text-[11px] text-base-content/45">نقدي</p>
              <p className="font-black">{formatMoney(preview.cashTotal)}</p>
            </div>
            <div className="rounded-lg border border-base-300 px-2 py-1.5">
              <p className="text-[11px] text-base-content/45">بطاقة</p>
              <p className="font-black">{formatMoney(preview.cardTotal)}</p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="btn btn-outline gap-2 rounded-xl"
              disabled={pending}
              onClick={() => run(() => printShiftXReport(venueId))}
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Printer className="size-4" />
              )}
              طباعة تقرير X
            </button>
            <button
              type="button"
              className="btn btn-error gap-2 rounded-xl"
              disabled={pending || !canPrintZ}
              onClick={() => dialogRef.current?.showModal()}
              title={
                canPrintZ
                  ? undefined
                  : zAlreadyClosedThisWindow
                    ? "تم إقفال Z لهذه الفترة — استخدم إعادة الطباعة"
                    : `متاح فقط من ${zWindowStart} إلى ${zWindowEnd} (طرابلس)`
              }
            >
              <Lock className="size-4" />
              طباعة تقرير Z
            </button>
          </div>

          <button
            type="button"
            className={`btn h-10 w-full gap-2 rounded-xl ${
              zAlreadyClosedThisWindow
                ? "btn-warning"
                : "btn-ghost border border-base-300"
            }`}
            disabled={pending || !canReprintZ}
            onClick={() => run(() => reprintLastZReport(venueId))}
            title={
              canReprintZ
                ? lastZLabel
                  ? `آخر Z: ${lastZLabel} — بدون إقفال جديد`
                  : "بدون إقفال جديد"
                : "لا يوجد Z سابق"
            }
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            إعادة طباعة آخر Z
          </button>

          {zAlreadyClosedThisWindow ? (
            <p className="text-xs font-bold text-warning">
              تم إقفال Z لهذه الفترة — لا إقفال ثانٍ حتى نافذة الغد. إن فشلت
              الطباعة استخدم «إعادة طباعة آخر Z».
            </p>
          ) : !canPrintZ ? (
            <p className="text-xs font-bold text-warning">
              لا يمكن طباعة Z الآن — انتظروا وقت الإقفال ({zWindowStart}–
              {zWindowEnd} بتوقيت طرابلس)
            </p>
          ) : null}
        </div>
      </section>

      <dialog ref={dialogRef} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-md rounded-t-3xl sm:rounded-3xl">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-error/10 text-error">
            <AlertTriangle className="size-7" />
          </div>
          <h3 className="text-xl font-black">تأكيد تقرير Z</h3>
          <p className="mt-2 text-sm leading-7 text-base-content/60">
            سيُطبع ملخص مبيعات {venueLabel} من آخر Z (أو أول فاتورة) حتى الآن،
            ثم يُقفل اليوم مرة واحدة لهذه الفترة. بعدها لا يمكن إقفال Z مرة أخرى
            حتى نافذة الغد — فقط إعادة طباعة. البيع يستمر بدون فتح وردية.
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
        <form method="dialog" className="modal-backdrop">
          <button type="submit" disabled={pending}>
            إغلاق
          </button>
        </form>
      </dialog>
    </>
  );
}
