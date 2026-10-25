"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCashierStationContext } from "@/app/actions/station";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { printers, users } from "@/lib/db/schema";
import {
  buildShiftItemsEscPos,
  buildShiftReportEscPos,
} from "@/lib/print/escpos";
import { printToPrinter } from "@/lib/print/network";
import {
  resolveShiftReportPrintMode,
  shiftReportPrintError,
} from "@/lib/print/report-print";
import { printRawToWindowsPrinter } from "@/lib/print/windows-raw";
import {
  addShiftExpense as addShiftExpenseCore,
  buildShiftReportData,
  closeShift,
  getOpenShift,
  getShiftById,
  listShiftExpenses,
  openShift,
  removeShiftExpense as removeShiftExpenseCore,
  type ShiftReportData,
} from "@/lib/shifts/core";
import type { VenueId } from "@/lib/types";
import { isVenueId } from "@/lib/venues";
import { recordSessionAudit } from "@/lib/audit";

type ShiftActionResult =
  | { error: string }
  | { ok: true; message: string; warning?: string };

function revalidateCashier(venueId: string) {
  revalidatePath(`/cashier/${venueId}`);
  revalidatePath(`/cashier/${venueId}/shift`);
  revalidatePath(`/cashier/${venueId}/quick`);
  revalidatePath(`/cashier/${venueId}/sales`);
}

function requireMainCashier(userId: number) {
  return (
    db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          eq(users.role, "cashier"),
          eq(users.active, true),
          eq(users.isMainCashier, true),
        ),
      )
      .get() ?? null
  );
}

async function sendShiftReport(
  printer: typeof printers.$inferSelect,
  data: Uint8Array,
  mode: "network" | "windows",
) {
  if (mode === "windows") {
    await printRawToWindowsPrinter(printer.host, data);
    return;
  }
  await printToPrinter({
    host: printer.host,
    port: printer.port,
    data,
  });
}

type ShiftPrintOutcome =
  | { ok: true; printerName: string; warning?: string }
  | { error: string; printerName: string | null };

/**
 * Sends a shift report followed by its items ticket to the cashier station
 * printer. Never throws — the caller decides whether a print failure should
 * block the operation.
 */
async function printShiftReportData(
  venueId: VenueId,
  data: ShiftReportData,
): Promise<ShiftPrintOutcome> {
  const stationCtx = await getCashierStationContext(venueId);
  if ("error" in stationCtx) {
    return { error: stationCtx.error, printerName: null };
  }

  const printMode = resolveShiftReportPrintMode(stationCtx.printer);
  if (printMode === "unsupported") {
    return {
      error:
        shiftReportPrintError(stationCtx.printer) ??
        "هذه الطابعة لا تدعم طباعة التقارير",
      printerName: stationCtx.printer.name,
    };
  }

  try {
    await sendShiftReport(
      stationCtx.printer,
      buildShiftReportEscPos(data),
      printMode,
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "تعذر الاتصال بالطابعة",
      printerName: stationCtx.printer.name,
    };
  }

  try {
    await sendShiftReport(
      stationCtx.printer,
      buildShiftItemsEscPos(data),
      printMode,
    );
    return { ok: true, printerName: stationCtx.printer.name };
  } catch (error) {
    return {
      ok: true,
      printerName: stationCtx.printer.name,
      warning: `طُبع تقرير الوردية، لكن تعذرت طباعة تقرير الأصناف: ${
        error instanceof Error ? error.message : "تعذر الاتصال بالطابعة"
      }`,
    };
  }
}

export async function openCashierShift(
  venueId: string,
  openingFloat: number,
): Promise<ShiftActionResult> {
  const session = await getSession();
  if (!session || session.role !== "cashier" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }
  if (!requireMainCashier(session.userId)) {
    return { error: "فقط الكاشير الرئيسي يمكنه فتح الوردية" };
  }

  const result = openShift(venueId, session.userId, openingFloat);
  if ("error" in result) {
    return result;
  }

  recordSessionAudit(session, {
    venueId,
    kind: "shift_open",
    success: true,
    detail: `فتح وردية #${result.shift.shiftNumber} بعهدة ${result.shift.openingFloat.toFixed(2)} د.ل`,
  });
  revalidateCashier(venueId);
  return {
    ok: true,
    message: `تم فتح الوردية #${result.shift.shiftNumber} — البيع متاح الآن`,
  };
}

export async function addShiftExpense(
  venueId: string,
  amount: number,
  reason: string,
): Promise<ShiftActionResult> {
  const session = await getSession();
  if (!session || session.role !== "cashier" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }

  const shift = getOpenShift(venueId);
  if (!shift) {
    return { error: "لا توجد وردية مفتوحة — افتح الوردية أولاً" };
  }

  const result = addShiftExpenseCore({
    shiftId: shift.id,
    userId: session.userId,
    userName: session.name,
    amount,
    reason,
  });
  if ("error" in result) return result;

  recordSessionAudit(session, {
    venueId,
    kind: "shift_expense",
    success: true,
    detail: `إضافة مصروف لوردية #${shift.shiftNumber}: ${result.expense.reason} — ${result.expense.amount.toFixed(2)} د.ل`,
  });
  revalidateCashier(venueId);
  revalidatePath("/admin/shifts");
  return {
    ok: true,
    message: `تم تسجيل مصروف ${result.expense.amount.toFixed(2)} د.ل من درج الوردية`,
  };
}

export async function deleteShiftExpense(
  venueId: string,
  shiftId: number,
  expenseId: number,
): Promise<ShiftActionResult> {
  const session = await getSession();
  if (!session || session.role !== "cashier" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }
  if (!requireMainCashier(session.userId)) {
    return { error: "فقط الكاشير الرئيسي يمكنه حذف المصروفات" };
  }

  const shift = getShiftById(shiftId);
  if (!shift || shift.venueId !== venueId || shift.status !== "open") {
    return { error: "لا يمكن حذف مصروف بعد إغلاق الوردية" };
  }

  const expense = listShiftExpenses(shift.id).find(
    (row) => row.id === expenseId,
  );
  if (!expense) {
    return { error: "المصروف غير موجود" };
  }

  const result = removeShiftExpenseCore(expenseId);
  if ("error" in result) return result;

  recordSessionAudit(session, {
    venueId,
    kind: "shift_expense",
    success: true,
    detail: `حذف مصروف من وردية #${shift.shiftNumber}: ${expense.reason} — ${expense.amount.toFixed(2)} د.ل`,
  });
  revalidateCashier(venueId);
  revalidatePath("/admin/shifts");
  return { ok: true, message: "تم حذف المصروف" };
}

export async function printShiftSummary(venueId: string): Promise<ShiftActionResult> {
  const session = await getSession();
  if (!session || session.role !== "cashier" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }
  if (!requireMainCashier(session.userId)) {
    return { error: "فقط الكاشير الرئيسي يمكنه طباعة تقرير الوردية" };
  }

  const shift = getOpenShift(venueId);
  if (!shift) {
    return { error: "لا توجد وردية مفتوحة — افتح الوردية أولاً" };
  }

  const data = buildShiftReportData(shift.id, session.name, "summary");
  if (!data) {
    return { error: "تعذر تجهيز تقرير الوردية" };
  }

  const outcome = await printShiftReportData(venueId, data);
  recordSessionAudit(session, {
    venueId,
    kind: "shift_report",
    printerName: outcome.printerName,
    success: "ok" in outcome,
    detail:
      "ok" in outcome
        ? outcome.warning
          ? `ملخص وردية #${shift.shiftNumber} — تعذرت طباعة الأصناف`
          : `ملخص وردية #${shift.shiftNumber} + الأصناف`
        : `ملخص وردية #${shift.shiftNumber} — ${outcome.error}`,
  });
  if ("error" in outcome) {
    return { error: outcome.error };
  }

  revalidateCashier(venueId);
  return {
    ok: true,
    message: `تمت طباعة ملخص الوردية #${shift.shiftNumber} وتقرير الأصناف`,
    ...(outcome.warning ? { warning: outcome.warning } : {}),
  };
}

export async function closeCashierShift(
  venueId: string,
  countedCash: number,
): Promise<ShiftActionResult> {
  const session = await getSession();
  if (!session || session.role !== "cashier" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }
  if (!requireMainCashier(session.userId)) {
    return { error: "فقط الكاشير الرئيسي يمكنه إغلاق الوردية" };
  }

  const shift = getOpenShift(venueId);
  if (!shift) {
    return { error: "لا توجد وردية مفتوحة" };
  }

  const closed = closeShift(shift.id, session.userId, countedCash);
  if ("error" in closed) {
    return closed;
  }

  const data = buildShiftReportData(shift.id, session.name, "close");
  const outcome = data
    ? await printShiftReportData(venueId, data)
    : { error: "تعذر تجهيز تقرير الإغلاق", printerName: null };

  const cashDetail = `متوقع ${closed.shift.expectedCash?.toFixed(2) ?? "0.00"}، معدود ${closed.shift.countedCash?.toFixed(2) ?? "0.00"}، فرق ${closed.shift.difference?.toFixed(2) ?? "0.00"}`;
  recordSessionAudit(session, {
    venueId,
    kind: "shift_close",
    printerName: outcome.printerName,
    success: "ok" in outcome,
    detail:
      "ok" in outcome
        ? outcome.warning
          ? `إغلاق وردية #${shift.shiftNumber} — ${cashDetail} — تعذرت طباعة الأصناف`
          : `إغلاق وردية #${shift.shiftNumber} — ${cashDetail} + الأصناف`
        : `إغلاق وردية #${shift.shiftNumber} — ${cashDetail} — فشلت الطباعة: ${outcome.error}`,
  });

  revalidateCashier(venueId);

  if ("error" in outcome) {
    return {
      ok: true,
      warning: `تم إغلاق الوردية، لكن تعذرت طباعة التقرير: ${outcome.error}. استخدم إعادة الطباعة من سجل الورديات`,
      message: `تم إغلاق الوردية #${shift.shiftNumber}`,
    };
  }

  return {
    ok: true,
    message: `تم إغلاق الوردية #${shift.shiftNumber} وطباعة تقرير الإغلاق`,
    ...(outcome.warning ? { warning: outcome.warning } : {}),
  };
}

export async function reprintShiftReport(
  shiftId: number,
): Promise<ShiftActionResult> {
  const session = await getSession();
  if (!session || session.role !== "cashier") {
    return { error: "غير مصرح" };
  }
  if (!requireMainCashier(session.userId)) {
    return { error: "فقط الكاشير الرئيسي يمكنه إعادة طباعة تقارير الورديات" };
  }

  const shift = getShiftById(shiftId);
  if (!shift || shift.status !== "closed" || !isVenueId(shift.venueId)) {
    return { error: "الوردية غير موجودة أو ما زالت مفتوحة" };
  }

  const data = buildShiftReportData(shift.id, session.name, "reprint");
  if (!data) {
    return { error: "تعذر تجهيز تقرير الوردية" };
  }

  const outcome = await printShiftReportData(shift.venueId, data);
  recordSessionAudit(session, {
    venueId: shift.venueId,
    kind: "shift_report",
    printerName: outcome.printerName,
    success: "ok" in outcome,
    detail:
      "ok" in outcome
        ? outcome.warning
          ? `إعادة طباعة وردية #${shift.shiftNumber} — تعذرت طباعة الأصناف`
          : `إعادة طباعة وردية #${shift.shiftNumber} + الأصناف`
        : `إعادة طباعة وردية #${shift.shiftNumber} — ${outcome.error}`,
  });
  if ("error" in outcome) {
    return { error: outcome.error };
  }

  return {
    ok: true,
    message: `تمت إعادة طباعة تقرير الوردية #${shift.shiftNumber} وتقرير الأصناف`,
    ...(outcome.warning ? { warning: outcome.warning } : {}),
  };
}

/** Admin: reprint any historical shift report. */
export async function adminReprintShiftReport(
  shiftId: number,
): Promise<ShiftActionResult> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { error: "غير مصرح" };
  }

  const shift = getShiftById(shiftId);
  if (!shift || shift.status !== "closed" || !isVenueId(shift.venueId)) {
    return { error: "الوردية غير موجودة أو ما زالت مفتوحة" };
  }

  const data = buildShiftReportData(shift.id, session.name, "reprint");
  if (!data) {
    return { error: "تعذر تجهيز تقرير الوردية" };
  }

  const outcome = await printShiftReportData(shift.venueId, data);
  recordSessionAudit(session, {
    venueId: shift.venueId,
    kind: "shift_report",
    printerName: outcome.printerName,
    success: "ok" in outcome,
    detail:
      "ok" in outcome
        ? outcome.warning
          ? `إعادة طباعة وردية #${shift.shiftNumber} من الإدارة — تعذرت طباعة الأصناف`
          : `إعادة طباعة وردية #${shift.shiftNumber} من الإدارة + الأصناف`
        : `إعادة طباعة وردية #${shift.shiftNumber} من الإدارة — ${outcome.error}`,
  });
  if ("error" in outcome) {
    return { error: outcome.error };
  }

  return {
    ok: true,
    message: `تمت إعادة طباعة تقرير الوردية #${shift.shiftNumber} وتقرير الأصناف`,
    ...(outcome.warning ? { warning: outcome.warning } : {}),
  };
}
