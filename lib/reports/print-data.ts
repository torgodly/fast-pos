import type { ReportSummaryPrintData } from "@/lib/print/receipts";
import { formatPrintTimestamp } from "@/lib/venues";
import type { ReportSummary } from "./summary";

function byRevenue<T extends { revenue: number }>(rows: T[]) {
  return [...rows].sort((a, b) => b.revenue - a.revenue);
}

export function summaryToPrintData(
  summary: ReportSummary,
): ReportSummaryPrintData {
  return {
    venueName: summary.venueName,
    fromLabel: formatPrintTimestamp(summary.fromSql),
    toLabel: formatPrintTimestamp(summary.toSql),
    printedAt: formatPrintTimestamp(new Date()),
    invoiceCount: summary.rows.length,
    totalSales: summary.totalSales,
    cashTotal: summary.cashTotal,
    nonCashTotal: summary.nonCashTotal,
    paymentBreakdown: summary.paymentBreakdown.map((item) => ({
      name: item.name,
      total: item.total,
      count: item.count,
    })),
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
