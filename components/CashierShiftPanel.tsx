"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  LoaderCircle,
  Lock,
  LockOpen,
  Printer,
  RotateCcw,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  closeCashierShift,
  deleteShiftExpense,
  openCashierShift,
  printShiftSummary,
  reprintShiftReport,
} from "@/app/actions/shifts";
import { useToast } from "@/components/ToastProvider";
import { DEFAULT_OPENING_FLOAT } from "@/lib/shifts/cash";
import type {
  ShiftExpenseItem,
  ShiftListItem,
  ShiftTotals,
} from "@/lib/shifts/core";
import { formatDateTime, formatMoney } from "@/lib/venues";

type ActionResult = { error: string } | { ok: true; message: string; warning?: string };

function DifferenceValue({ value }: { value: number | null }) {
  if (value === null) return <span className="text-base-content/40">—</span>;
  if (value === 0) {
    return <span className="font-bold text-success">مطابق</span>;
  }
  if (value > 0) {
    return (
      <span className="font-bold text-info" dir="ltr">
        +{formatMoney(value)}
      </span>
    );
  }
  return (
    <span className="font-bold text-error" dir="ltr">
      -{formatMoney(Math.abs(value))}
    </span>
  );
}

export function CashierShiftPanel({
  venueId,
  venueLabel,
  openShift,
  totals,
  expenses,
  history,
}: {
  venueId: string;
  venueLabel: string;
  openShift: {
    shiftId: number;
    shiftNumber: number;
    openedAt: string;
    openingFloat: number;
  } | null;
  totals: ShiftTotals;
  expenses: ShiftExpenseItem[];
  history: ShiftListItem[];
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openingFloat, setOpeningFloat] = useState(
    String(DEFAULT_OPENING_FLOAT),
  );
  const [countedCash, setCountedCash] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const counted = Number.parseFloat(countedCash);
  const countedValid = Number.isFinite(counted) && counted >= 0;
  const expectedCash = openShift
    ? Math.round(
        (openShift.openingFloat + totals.cashTotal - totals.expenseTotal) * 100,
      ) / 100
    : 0;
  const difference = countedValid
    ? Math.round((counted - expectedCash) * 100) / 100
    : null;

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        showToast("error", result.error);
        return;
      }
      if (result.warning) {
        showToast("warning", result.warning);
      } else {
        showToast("success", result.message);
      }
      onSuccess?.();
      router.refresh();
    });
  }

  function submitOpen() {
    const value = Number.parseFloat(openingFloat);
    if (!Number.isFinite(value) || value < 0) {
      showToast("error", "أدخل عهدة افتتاحية صحيحة");
      return;
    }
    run(() => openCashierShift(venueId, value));
  }

  function submitClose() {
    if (!countedValid) {
      showToast("error", "أدخل المبلغ المعدود من الدرج");
      return;
    }
    run(
      () => closeCashierShift(venueId, counted),
      () => {
        dialogRef.current?.close();
        setCountedCash("");
      },
    );
  }

  function submitDeleteExpense(expense: ShiftExpenseItem) {
    if (!openShift) return;
    if (
      !window.confirm(
        `حذف مصروف «${expense.reason}» بمبلغ ${formatMoney(expense.amount)}؟`,
      )
    ) {
      return;
    }
    run(() => deleteShiftExpense(venueId, openShift.shiftId, expense.id));
  }

  return (
    <>
      {openShift ? (
        <section className="rounded-xl border border-success/30 bg-base-100 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-base-content/45">
                وردية {venueLabel} — مفتوحة
              </p>
              <h3 className="text-lg font-black">
                وردية #{openShift.shiftNumber}
              </h3>
              <p className="mt-1 text-sm text-base-content/50">
                فتحها الكاشير الرئيسي · {formatDateTime(openShift.openedAt)}
              </p>
            </div>
            <span className="badge badge-success badge-lg gap-1 font-bold">
              <LockOpen className="size-4" />
              البيع متاح
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-lg border border-base-300 px-2 py-1.5">
              <p className="text-[11px] text-base-content/45">فواتير</p>
              <p className="font-black">{totals.invoiceCount}</p>
            </div>
            <div className="rounded-lg border border-base-300 px-2 py-1.5">
              <p className="text-[11px] text-base-content/45">الإجمالي</p>
              <p className="font-black text-primary">
                {formatMoney(totals.totalSales)}
              </p>
            </div>
            <div className="rounded-lg border border-base-300 px-2 py-1.5">
              <p className="text-[11px] text-base-content/45">نقدي</p>
              <p className="font-black">{formatMoney(totals.cashTotal)}</p>
            </div>
            <div className="rounded-lg border border-base-300 px-2 py-1.5">
              <p className="text-[11px] text-base-content/45">بطاقة</p>
              <p className="font-black">{formatMoney(totals.cardTotal)}</p>
            </div>
            <div className="rounded-lg border border-base-300 px-2 py-1.5">
              <p className="text-[11px] text-base-content/45">عهدة افتتاحية</p>
              <p className="font-black">{formatMoney(openShift.openingFloat)}</p>
            </div>
            <div className="rounded-lg border border-warning/40 bg-warning/5 px-2 py-1.5">
              <p className="text-[11px] text-base-content/45">مصروفات</p>
              <p className="font-black text-warning">
                {formatMoney(totals.expenseTotal)}
              </p>
            </div>
            <div className="rounded-lg border border-base-300 px-2 py-1.5">
              <p className="text-[11px] text-base-content/45">النقد المتوقع</p>
              <p className="font-black text-success">
                {formatMoney(expectedCash)}
              </p>
              <p className="text-[10px] text-base-content/35">
                عهدة + نقدي − مصروفات
              </p>
            </div>
            <div className="rounded-lg border border-base-300 px-2 py-1.5">
              <p className="text-[11px] text-base-content/45">قطع مباعة</p>
              <p className="font-black">{totals.totalItems}</p>
            </div>
            <div className="rounded-lg border border-base-300 px-2 py-1.5">
              <p className="text-[11px] text-base-content/45">طاولات / سريع</p>
              <p className="font-black">
                {totals.tableSales} / {totals.quickSales}
              </p>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-base-300">
            <div className="flex items-center justify-between gap-2 border-b border-base-300/70 bg-base-200/40 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-black">
                <Wallet className="size-3.5 text-warning" />
                مصروفات الوردية
              </span>
              <span className="text-xs font-black text-warning">
                {formatMoney(totals.expenseTotal)}
              </span>
            </div>
            {expenses.length === 0 ? (
              <p className="px-3 py-3 text-xs text-base-content/45">
                لا مصروفات مسجلة في هذه الوردية
              </p>
            ) : (
              <ul className="divide-y divide-base-300/60">
                {expenses.map((expense) => (
                  <li
                    key={expense.id}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">
                        {expense.reason}
                      </p>
                      <p className="text-[11px] text-base-content/45">
                        {expense.createdByName} ·{" "}
                        {formatDateTime(expense.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-sm font-black tabular-nums">
                        {formatMoney(expense.amount)}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs h-7 min-h-7 gap-1 rounded-md text-error"
                        disabled={pending}
                        onClick={() => submitDeleteExpense(expense)}
                        title="حذف المصروف"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="btn btn-outline gap-2 rounded-xl"
              disabled={pending}
              onClick={() => run(() => printShiftSummary(venueId))}
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Printer className="size-4" />
              )}
              طباعة ملخص الوردية
            </button>
            <button
              type="button"
              className="btn btn-error gap-2 rounded-xl"
              disabled={pending}
              onClick={() => dialogRef.current?.showModal()}
            >
              <Lock className="size-4" />
              إغلاق الوردية
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-warning/40 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/20 text-warning">
              <AlertTriangle className="size-5" />
            </span>
            <div>
              <h3 className="font-black">لا توجد وردية مفتوحة — البيع موقوف</h3>
              <p className="mt-1 text-sm text-base-content/60">
                افتح وردية جديدة وحدد العهدة الافتتاحية للدرج، ثم يصبح البيع
                والدفع متاحين. تُربط كل الفواتير المدفوعة بهذه الوردية.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="form-control w-full sm:max-w-xs">
              <span className="label-text mb-1 text-xs font-bold">
                العهدة الافتتاحية (د.ل)
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="input input-bordered h-11 rounded-xl"
                value={openingFloat}
                onChange={(event) => setOpeningFloat(event.target.value)}
                disabled={pending}
              />
            </label>
            <button
              type="button"
              className="btn btn-success gap-2 rounded-xl"
              disabled={pending}
              onClick={submitOpen}
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <LockOpen className="size-4" />
              )}
              فتح الوردية
            </button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-base-300 bg-base-100">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div>
            <h3 className="font-black">سجل الورديات</h3>
            <p className="text-xs text-base-content/45">
              آخر {history.length} وردية مغلقة لـ {venueLabel}
            </p>
          </div>
          <Banknote className="size-5 text-primary" />
        </div>
        <div className="overflow-x-auto border-t border-base-300/70">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>رقم</th>
                <th>التاريخ</th>
                <th>الفتح / الإغلاق</th>
                <th>فواتير</th>
                <th>الإجمالي</th>
                <th>نقدي</th>
                <th>مصروفات</th>
                <th>متوقع</th>
                <th>معدود</th>
                <th>الفرق</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="py-10 text-center text-base-content/45"
                  >
                    لا توجد ورديات مغلقة بعد
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.shiftId}>
                    <td className="font-black tabular-nums">
                      #{row.shiftNumber}
                    </td>
                    <td className="whitespace-nowrap font-bold tabular-nums">
                      {row.workDate}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      <p>{formatDateTime(row.openedAt)}</p>
                      <p className="text-base-content/45">
                        {formatDateTime(row.closedAt)}
                      </p>
                      <p className="text-base-content/40">
                        {row.openedByName ?? "—"} → {row.closedByName ?? "—"}
                      </p>
                    </td>
                    <td className="tabular-nums">{row.invoiceCount}</td>
                    <td className="font-black tabular-nums">
                      {formatMoney(row.totalSales)}
                    </td>
                    <td className="tabular-nums">
                      {formatMoney(row.cashTotal)}
                    </td>
                    <td className="tabular-nums text-warning">
                      {formatMoney(row.expenseTotal)}
                    </td>
                    <td className="tabular-nums">
                      {row.expectedCash === null
                        ? "—"
                        : formatMoney(row.expectedCash)}
                    </td>
                    <td className="tabular-nums">
                      {row.countedCash === null
                        ? "—"
                        : formatMoney(row.countedCash)}
                    </td>
                    <td>
                      <DifferenceValue value={row.difference} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs h-7 min-h-7 gap-1 rounded-md"
                        disabled={pending}
                        onClick={() => run(() => reprintShiftReport(row.shiftId))}
                        title="إعادة طباعة تقرير الإغلاق"
                      >
                        <RotateCcw className="size-3.5" />
                        طباعة
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <dialog ref={dialogRef} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-md rounded-t-3xl sm:rounded-3xl">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-error/10 text-error">
            <AlertTriangle className="size-7" />
          </div>
          <h3 className="text-xl font-black">إغلاق الوردية</h3>
          <p className="mt-2 text-sm leading-7 text-base-content/60">
            عدّ النقد الموجود في الدرج وأدخله. سيُقفل البيع حتى تفتح وردية
            جديدة، وسيُطبع تقرير الإغلاق مع تقرير الأصناف والفرق بين المتوقع
            والمعدود.
          </p>

          <div className="mt-3 rounded-xl border border-base-300 bg-base-200/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-base-content/55">النقد المتوقع</span>
              <span className="font-black">{formatMoney(expectedCash)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-base-content/55">مصروفات الوردية</span>
              <span className="font-black text-warning">
                {formatMoney(totals.expenseTotal)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-base-content/55">الفرق</span>
              <DifferenceValue value={difference} />
            </div>
          </div>

          <label className="form-control mt-3">
            <span className="label-text mb-1 text-xs font-bold">
              المبلغ المعدود (د.ل)
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="input input-bordered h-12 rounded-xl text-lg font-black"
              value={countedCash}
              onChange={(event) => setCountedCash(event.target.value)}
              disabled={pending}
              autoFocus
            />
          </label>

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
              disabled={pending || !countedValid}
              onClick={submitClose}
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Lock className="size-4" />
              )}
              تأكيد الإغلاق والطباعة
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
