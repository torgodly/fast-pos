"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCashierStationContext } from "@/app/actions/station";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { shifts, users } from "@/lib/db/schema";
import { buildShiftReportEscPos } from "@/lib/print/escpos";
import { printToPrinter } from "@/lib/print/network";
import {
  buildDayReportData,
  buildLastZReprintData,
  buildZReportByShiftId,
  getDayReportStatus,
  recordZClose,
} from "@/lib/shifts/core";
import { isWithinZWindow } from "@/lib/settings";
import { isVenueId } from "@/lib/venues";
import { recordSessionAudit } from "@/lib/audit";

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

async function printDayReport(
  venueId: string,
  kind: "X" | "Z",
): Promise<{ error: string } | { ok: true; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "cashier" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }
  if (!requireMainCashier(session.userId)) {
    return { error: "فقط الكاشير الرئيسي يمكنه طباعة تقارير X و Z" };
  }

  if (kind === "Z" && !isWithinZWindow(new Date(), venueId)) {
    const status = getDayReportStatus(venueId);
    return {
      error: `لا يمكن إقفال اليوم الآن — طباعة Z مسموحة فقط بين ${status.zWindowStart} و ${status.zWindowEnd}`,
    };
  }

  const stationCtx = await getCashierStationContext(venueId);
  if ("error" in stationCtx) {
    return { error: stationCtx.error };
  }
  if (stationCtx.printer.connectionType === "local") {
    return {
      error:
        "طابعة Chrome المحلية لا تدعم تقارير X/Z — استخدم طابعة شبكة",
    };
  }

  try {
    // Build period BEFORE recording Z so the slip includes today's sales
    const data = buildDayReportData(venueId, kind, session.name);
    if (kind === "Z") {
      recordZClose(venueId, session.userId);
    }
    await printToPrinter({
      host: stationCtx.printer.host,
      port: stationCtx.printer.port,
      data: buildShiftReportEscPos(data),
    });
    recordSessionAudit(session, {
      venueId,
      kind: kind === "Z" ? "z_report" : "x_report",
      printerName: stationCtx.printer.name,
      success: true,
      detail:
        kind === "Z"
          ? `إقفال Z لـ ${data.venueName}`
          : `طباعة X لـ ${data.venueName}`,
    });
    revalidateCashier(venueId);
    return {
      ok: true,
      message:
        kind === "Z"
          ? `تمت طباعة Z لـ ${data.venueName} وبدء يوم جديد لهذا الفرع فقط`
          : `تمت طباعة X لـ ${data.venueName} (من آخر Z لهذا الفرع حتى الآن)`,
    };
  } catch (error) {
    recordSessionAudit(session, {
      venueId,
      kind: kind === "Z" ? "z_report" : "x_report",
      printerName: stationCtx.printer.name,
      success: false,
      detail:
        error instanceof Error
          ? error.message
          : `تعذر طباعة تقرير ${kind}`,
    });
    revalidateCashier(venueId);
    return {
      error:
        error instanceof Error
          ? error.message
          : `تعذر طباعة تقرير ${kind}`,
    };
  }
}

export async function printShiftXReport(venueId: string) {
  return printDayReport(venueId, "X");
}

export async function closeShiftWithZReport(venueId: string) {
  return printDayReport(venueId, "Z");
}

/** Reprint the last closed Z for this venue — does not start a new day. */
export async function reprintLastZReport(
  venueId: string,
): Promise<{ error: string } | { ok: true; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "cashier" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }
  if (!requireMainCashier(session.userId)) {
    return { error: "فقط الكاشير الرئيسي يمكنه إعادة طباعة Z" };
  }

  const last = buildLastZReprintData(venueId, session.name);
  if (!last) {
    return { error: "لا يوجد تقرير Z سابق لإعادة طباعته" };
  }

  return printZReportData(venueId, last, session, "إعادة طباعة آخر Z");
}

/** Admin: reprint any historical Z by shift id. */
export async function adminReprintZReport(
  shiftId: number,
): Promise<{ error: string } | { ok: true; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { error: "غير مصرح" };
  }

  const shift = db.select().from(shifts).where(eq(shifts.id, shiftId)).get();
  if (!shift?.closedAt || !isVenueId(shift.venueId)) {
    return { error: "تقرير Z غير موجود" };
  }

  const data = buildZReportByShiftId(shiftId, session.name);
  if (!data) {
    return { error: "تقرير Z غير موجود" };
  }

  return printZReportData(
    shift.venueId,
    data,
    session,
    `إعادة طباعة Z #${shiftId} من الإدارة`,
  );
}

async function printZReportData(
  venueId: import("@/lib/types").VenueId,
  data: import("@/lib/shifts/core").DayReportData,
  session: { userId: number; name: string; role: string },
  detailPrefix: string,
): Promise<{ error: string } | { ok: true; message: string }> {
  const stationCtx = await getCashierStationContext(venueId);
  if ("error" in stationCtx) {
    return { error: stationCtx.error };
  }
  if (stationCtx.printer.connectionType === "local") {
    return {
      error:
        "طابعة Chrome المحلية لا تدعم تقارير X/Z — استخدم طابعة شبكة",
    };
  }

  try {
    await printToPrinter({
      host: stationCtx.printer.host,
      port: stationCtx.printer.port,
      data: buildShiftReportEscPos(data),
    });
    recordSessionAudit(session, {
      venueId,
      kind: "z_report",
      printerName: stationCtx.printer.name,
      success: true,
      detail: `${detailPrefix} لـ ${data.venueName}`,
    });
    revalidateCashier(venueId);
    return {
      ok: true,
      message: `تمت إعادة طباعة Z لـ ${data.venueName}`,
    };
  } catch (error) {
    recordSessionAudit(session, {
      venueId,
      kind: "z_report",
      printerName: stationCtx.printer.name,
      success: false,
      detail:
        error instanceof Error
          ? error.message
          : "تعذر إعادة طباعة تقرير Z",
    });
    return {
      error:
        error instanceof Error
          ? error.message
          : "تعذر إعادة طباعة تقرير Z",
    };
  }
}

/** @deprecated removed — kept so old imports fail clearly at typecheck if used */
export async function openCashierShift(_venueId: string) {
  return { error: "فتح الوردية لم يعد مستخدماً" };
}
