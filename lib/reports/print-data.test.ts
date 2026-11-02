// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatPrintTimestamp } from "@/lib/venues";
import type { ReportSummary } from "./summary";
import { summaryToPrintData } from "./print-data";

function summary(overrides: Partial<ReportSummary> = {}): ReportSummary {
  return {
    venue: "restaurant",
    venueName: "المطعم",
    from: "2026-10-30T00:00",
    to: "2026-10-31T23:59",
    fromSql: "2026-10-30 00:00:00",
    toSql: "2026-10-31 23:59:59",
    q: "",
    waiterId: null,
    cashierId: null,
    categoryId: null,
    payment: "all",
    saleType: "all",
    rows: [
      {
        id: 1,
        total: 30,
        paymentMethod: "cash",
        paidAt: "2026-10-30 10:00:00",
        createdAt: "2026-10-30 10:00:00",
        tableName: "4",
        waiterName: "سارة",
        cashierName: "أحمد",
        waiterId: 2,
        cashierId: 3,
        tableId: 4,
      },
      {
        id: 2,
        total: 20,
        paymentMethod: "card",
        paidAt: "2026-10-30 11:00:00",
        createdAt: "2026-10-30 11:00:00",
        tableName: null,
        waiterName: null,
        cashierName: "أحمد",
        waiterId: null,
        cashierId: 3,
        tableId: null,
      },
    ],
    itemSales: [
      { itemId: 1, itemName: "شاي", qty: 2, revenue: 10 },
      { itemId: 2, itemName: "كولا", qty: 3, revenue: 30 },
    ],
    categorySales: [
      { categoryId: 1, categoryName: "مشروبات ساخنة", qty: 2, revenue: 10 },
      { categoryId: 2, categoryName: "مشروبات باردة", qty: 3, revenue: 30 },
    ],
    totalSales: 50,
    totalItems: 5,
    cashTotal: 30,
    nonCashTotal: 20,
    paymentBreakdown: [{ code: "cash", name: "نقدي", total: 30, count: 1 }],
    averageTicket: 25,
    tableSales: 30,
    quickSales: 20,
    openCount: 1,
    openTotal: 40,
    cancelledCount: 0,
    waiterPerformance: [{ id: 2, name: "سارة", invoices: 1, sales: 30 }],
    cashierPerformance: [
      { id: 3, name: "أحمد", invoices: 2, sales: 50, cash: 30, nonCash: 20 },
    ],
    ...overrides,
  };
}

describe("summaryToPrintData", () => {
  it("maps the summary totals, labels, and payment breakdown", () => {
    const data = summaryToPrintData(summary());
    expect(data.venueName).toBe("المطعم");
    expect(data.fromLabel).toBe(formatPrintTimestamp("2026-10-30 00:00:00"));
    expect(data.toLabel).toBe(formatPrintTimestamp("2026-10-31 23:59:59"));
    expect(data.printedAt.length).toBeGreaterThan(0);
    expect(data.invoiceCount).toBe(2);
    expect(data.totalSales).toBe(50);
    expect(data.cashTotal).toBe(30);
    expect(data.nonCashTotal).toBe(20);
    expect(data.totalItems).toBe(5);
    expect(data.paymentBreakdown).toEqual([
      { name: "نقدي", total: 30, count: 1 },
    ]);
    expect(data.waiterPerformance).toEqual([]);
    expect(data.cashierPerformance).toEqual([]);
  });

  it("sorts categories and items by revenue", () => {
    const data = summaryToPrintData(summary());
    expect(data.categorySales.map((row) => row.name)).toEqual([
      "مشروبات باردة",
      "مشروبات ساخنة",
    ]);
    expect(data.itemSales.map((row) => row.name)).toEqual(["كولا", "شاي"]);
  });
});
