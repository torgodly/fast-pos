"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCashierStationContext } from "@/app/actions/station";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { shifts } from "@/lib/db/schema";
import { buildShiftReportEscPos } from "@/lib/print/escpos";
import { printToPrinter } from "@/lib/print/network";
import {
  buildShiftReportData,
  getOpenShift,
  nextShiftNumber,
  nowSql,
  workDateToday,
} from "@/lib/shifts/core";
import { isVenueId } from "@/lib/venues";

function revalidateCashier(venueId: string) {
  revalidatePath(`/cashier/${venueId}`);
  revalidatePath(`/cashier/${venueId}/quick`);
  revalidatePath(`/cashier/${venueId}/sales`);
}

export async function openCashierShift(
  venueId: string,
): Promise<{ error: string } | { ok: true; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "cashier" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }

  if (getOpenShift(venueId)) {
    return { error: "توجد وردية مفتوحة بالفعل — أقفلها بتقرير Z أولاً" };
  }

  const workDate = workDateToday();
  const number = nextShiftNumber(venueId, workDate);
  if (number == null) {
    return {
      error: "انتهى يوم العمل (ورديتان) — يمكن فتح وردية جديدة غداً",
    };
  }

  db.insert(shifts)
    .values({
      venueId,
      workDate,
      shiftNumber: number,
      status: "open",
      openedBy: session.userId,
      openedAt: nowSql(),
    })
    .run();

  revalidateCashier(venueId);
  return {
    ok: true,
    message: `تم فتح الوردية ${number} ليوم ${workDate}`,
  };
}

async function printShiftReport(
  venueId: string,
  kind: "X" | "Z",
): Promise<{ error: string } | { ok: true; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "cashier" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }

  const open = getOpenShift(venueId);
  if (!open) {
    return { error: "لا توجد وردية مفتوحة" };
  }

  const stationCtx = await getCashierStationContext(venueId);
  if ("error" in stationCtx) {
    return { error: stationCtx.error };
  }
  if (stationCtx.printer.connectionType === "local") {
    return {
      error:
        "طابعة Chrome المحلية لا تدعم تقارير الوردية — استخدم طابعة شبكة",
    };
  }

  if (kind === "Z") {
    db.update(shifts)
      .set({
        status: "closed",
        closedBy: session.userId,
        closedAt: nowSql(),
      })
      .where(eq(shifts.id, open.id))
      .run();
  } else {
    db.update(shifts)
      .set({ xPrintedAt: nowSql() })
      .where(eq(shifts.id, open.id))
      .run();
  }

  const refreshed =
    db.select().from(shifts).where(eq(shifts.id, open.id)).get() ?? open;

  try {
    const data = buildShiftReportData(refreshed, kind);
    await printToPrinter({
      host: stationCtx.printer.host,
      port: stationCtx.printer.port,
      data: buildShiftReportEscPos(data),
    });
    revalidateCashier(venueId);
    return {
      ok: true,
      message:
        kind === "Z"
          ? `تم إقفال الوردية ${open.shiftNumber} وطباعة تقرير Z`
          : `تمت طباعة تقرير X للوردية ${open.shiftNumber}`,
    };
  } catch (error) {
    revalidateCashier(venueId);
    return {
      error:
        error instanceof Error
          ? `${kind === "Z" ? "تم إقفال الوردية لكن فشلت الطباعة: " : ""}${error.message}`
          : `تعذر طباعة تقرير ${kind}`,
    };
  }
}

export async function printShiftXReport(venueId: string) {
  return printShiftReport(venueId, "X");
}

export async function closeShiftWithZReport(venueId: string) {
  return printShiftReport(venueId, "Z");
}
