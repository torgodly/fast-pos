"use server";

import { getCashierStationContext } from "@/app/actions/station";
import { getSession } from "@/lib/auth/session";
import { buildReportSummaryEscPos } from "@/lib/print/escpos";
import type { ReportSummaryPrintData } from "@/lib/print/receipts";
import { printToPrinter } from "@/lib/print/network";
import {
  type ReportFiltersInput,
} from "@/lib/reports/filters";
import { getReportSummary } from "@/lib/reports/summary";
import { formatDateTime } from "@/lib/venues";

async function assertAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("غير مصرح");
  }
}

function summaryToPrintData(
  summary: ReturnType<typeof getReportSummary>,
): ReportSummaryPrintData {
  const printedAt = new Date().toISOString().slice(0, 19).replace("T", " ");

  return {
    venueName: summary.venueName,
    fromLabel: formatDateTime(summary.fromSql),
    toLabel: formatDateTime(summary.toSql),
    printedAt: formatDateTime(printedAt),
    invoiceCount: summary.rows.length,
    totalSales: summary.totalSales,
    cashTotal: summary.cashTotal,
    cardTotal: summary.cardTotal,
    averageTicket: summary.averageTicket,
    totalItems: summary.totalItems,
    tableSales: summary.tableSales,
    quickSales: summary.quickSales,
    cancelledCount: summary.cancelledCount,
    openCount: summary.openCount,
    openTotal: summary.openTotal,
    categorySales: summary.categorySales.slice(0, 8).map((row) => ({
      name: row.categoryName,
      qty: row.qty,
      revenue: row.revenue,
    })),
    itemSales: summary.itemSales.slice(0, 10).map((row) => ({
      name: row.itemName,
      qty: row.qty,
      revenue: row.revenue,
    })),
    waiterPerformance: summary.waiterPerformance.slice(0, 5).map((row) => ({
      name: row.name,
      invoices: row.invoices,
      sales: row.sales,
    })),
    cashierPerformance: summary.cashierPerformance.slice(0, 5).map((row) => ({
      name: row.name,
      invoices: row.invoices,
      cash: row.cash,
      card: row.card,
      sales: row.sales,
    })),
  };
}

export async function printReportSummary(
  filters: ReportFiltersInput,
): Promise<{ error: string } | { ok: true; message: string }> {
  try {
    await assertAdmin();
  } catch {
    return { error: "غير مصرح" };
  }

  const summary = getReportSummary(filters);
  const stationCtx = await getCashierStationContext(summary.venue);
  if ("error" in stationCtx) {
    return { error: stationCtx.error };
  }

  if (stationCtx.printer.connectionType === "local") {
    return {
      error:
        "طابعة Chrome المحلية لا تدعم طباعة التقارير من الإدارة — استخدم طابعة شبكة",
    };
  }

  try {
    const payload = buildReportSummaryEscPos(summaryToPrintData(summary));
    await printToPrinter({
      host: stationCtx.printer.host,
      port: stationCtx.printer.port,
      data: payload,
    });
    return {
      ok: true,
      message: `تمت طباعة التقرير على ${stationCtx.printer.name}`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : `تعذر الطباعة على ${stationCtx.printer.name}`,
    };
  }
}
