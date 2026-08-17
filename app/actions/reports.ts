"use server";

import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
import { recordSessionAudit } from "@/lib/audit";
import { buildReportSummaryEscPos } from "@/lib/print/escpos";
import { printToPrinter } from "@/lib/print/network";
import {
  buildDetailedSalesReportHtml,
  type ReportSummaryPrintData,
} from "@/lib/print/receipts";
import { type ReportFiltersInput } from "@/lib/reports/filters";
import { getReportSummary } from "@/lib/reports/summary";
import { formatPrintTimestamp } from "@/lib/venues";

async function assertAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("غير مصرح");
  }
  return session;
}

function byRevenue<T extends { revenue: number }>(rows: T[]) {
  return [...rows].sort((a, b) => b.revenue - a.revenue);
}

function summaryToPrintData(
  summary: ReturnType<typeof getReportSummary>,
): ReportSummaryPrintData {
  return {
    venueName: summary.venueName,
    fromLabel: formatPrintTimestamp(summary.fromSql),
    toLabel: formatPrintTimestamp(summary.toSql),
    printedAt: formatPrintTimestamp(new Date()),
    invoiceCount: summary.rows.length,
    totalSales: summary.totalSales,
    cashTotal: summary.cashTotal,
    cardTotal: summary.cardTotal,
    totalItems: summary.totalItems,
    tableSales: summary.tableSales,
    quickSales: summary.quickSales,
    cancelledCount: summary.cancelledCount,
    openCount: summary.openCount,
    openTotal: summary.openTotal,
    categorySales: byRevenue(summary.categorySales).map((row) => ({
      name: row.categoryName,
      qty: row.qty,
      revenue: row.revenue,
    })),
    itemSales: byRevenue(summary.itemSales).map((row) => ({
      name: row.itemName,
      qty: row.qty,
      revenue: row.revenue,
    })),
    waiterPerformance: [],
    cashierPerformance: [],
  };
}

export async function printReportSummary(
  filters: ReportFiltersInput,
  printerId: number,
): Promise<
  | { error: string }
  | { ok: true; message: string }
  | {
      ok: true;
      message: string;
      browserPrint: true;
      receiptHtml: string;
    }
> {
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

  if (printer.connectionType === "local") {
    recordSessionAudit(session, {
      venueId: summary.venue,
      kind: "report",
      printerName: printer.name,
      success: true,
      detail: `تقرير أصناف/مجموعات ${summary.fromSql} — ${summary.toSql} (متصفح)`,
    });
    return {
      ok: true,
      browserPrint: true,
      receiptHtml: buildDetailedSalesReportHtml(data),
      message: `اختر «${printer.name}» في نافذة الطباعة`,
    };
  }

  try {
    await printToPrinter({
      host: printer.host,
      port: printer.port,
      data: buildReportSummaryEscPos(data),
    });
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
