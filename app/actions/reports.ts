"use server";

import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
import { recordSessionAudit } from "@/lib/audit";
import { buildSalesReportEscPos } from "@/lib/print/templates/build";
import { printToPrinter } from "@/lib/print/network";
import { printRawToWindowsPrinter } from "@/lib/print/windows-raw";
import { type ReportFiltersInput } from "@/lib/reports/filters";
import { summaryToPrintData } from "@/lib/reports/print-data";
import { getReportSummary } from "@/lib/reports/summary";

async function assertAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("غير مصرح");
  }
  return session;
}

export async function printReportSummary(
  filters: ReportFiltersInput,
  printerId: number,
): Promise<{ error: string } | { ok: true; message: string }> {
  let session;
  try {
    session = await assertAdmin();
  } catch {
    return { error: "غير مصرح" };
  }

  if (!Number.isFinite(printerId) || printerId < 1) {
    return { error: "اختر طابعة" };
  }

  const printer = db
    .select()
    .from(printers)
    .where(and(eq(printers.id, printerId), eq(printers.active, true)))
    .get();
  if (!printer) {
    return { error: "الطابعة غير موجودة أو معطّلة" };
  }

  const summary = getReportSummary(filters);
  const data = summaryToPrintData(summary);

  try {
    const bytes = await buildSalesReportEscPos(data);
    if (printer.connectionType === "local") {
      await printRawToWindowsPrinter(printer.host, bytes);
    } else {
      await printToPrinter({
        host: printer.host,
        port: printer.port,
        data: bytes,
      });
    }
    recordSessionAudit(session, {
      venueId: summary.venue,
      kind: "report",
      printerName: printer.name,
      success: true,
      detail: `تقرير أصناف/مجموعات ${summary.fromSql} — ${summary.toSql} · ${data.itemSales.length} صنف · ${data.categorySales.length} مجموعة`,
    });
    return {
      ok: true,
      message: `طُبع التقرير على ${printer.name}`,
    };
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : `تعذر الطباعة على ${printer.name}`;
    recordSessionAudit(session, {
      venueId: summary.venue,
      kind: "report",
      printerName: printer.name,
      success: false,
      detail,
    });
    return { error: detail };
  }
}
