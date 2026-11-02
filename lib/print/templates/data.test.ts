import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import {
  itemsDocumentData,
  kitchenDocumentData,
  receiptDocumentData,
  salesDocumentData,
  shiftDocumentData,
  type ReceiptDocumentSettings,
} from "./data";
import { layoutTemplate } from "./layout";
import { buildSampleDocuments } from "./sample";
import type { CheckoutReceiptData, ReportSummaryPrintData, ShiftReportPrintData } from "@/lib/print/receipts";
import { REPORT_DOCUMENTS, type LayoutLine } from "./types";

const settings: ReceiptDocumentSettings = {
  venueName: "Fast Cafe",
  brandName: "Acme Corner",
  brandPhone: "0911234567",
  brandAddress: "Tripoli Main Street",
  footer: "شكراً لزيارتكم",
  logoAvailable: false,
};

const receipt: CheckoutReceiptData = {
  venueName: "Fast Cafe",
  orderId: 12,
  orderNo: 7,
  tableName: "4",
  waiterName: "أحمد",
  customerName: "محمد سالم",
  customerPhone: "0910000000",
  cashierName: "سارة",
  paymentMethod: "cash",
  paymentMethodLabel: "نقدي",
  paidAt: "2026-10-31 14:05",
  total: 32,
  lines: [
    { name: "كابتشينو", qty: 2, unitPrice: 12, lineTotal: 24, note: "بدون سكر" },
    { name: "قهوة عربية", qty: 1, unitPrice: 8, lineTotal: 8 },
  ],
};

const shift: ShiftReportPrintData = {
  kind: "close",
  shiftNumber: 4,
  venueName: "Fast Cafe",
  workDate: "2026-10-31",
  openedAt: "2026-10-31 09:00",
  closedAt: "2026-10-31 18:00",
  printedAt: "2026-10-31 18:00",
  printedByName: "سارة",
  openedByName: "سارة",
  closedByName: "سارة",
  invoiceCount: 12,
  totalSales: 640.5,
  cashTotal: 500.5,
  nonCashTotal: 140,
  paymentBreakdown: [
    { name: "نقدي", total: 500.5, count: 9 },
    { name: "بطاقة", total: 140, count: 3 },
  ],
  totalItems: 28,
  tableSales: 9,
  quickSales: 3,
  items: [
    { name: "شاي", qty: 2, categoryName: "مشروبات ساخنة", revenue: 10 },
    { name: "كولا", qty: 3, categoryName: "مشروبات باردة", revenue: 30 },
    { name: "قهوة", qty: 1, categoryName: "مشروبات ساخنة", revenue: 8 },
  ],
  openingFloat: 50,
  expenseTotal: 12.5,
  expenses: [{ reason: "شراء ثلج", amount: 12.5, createdByName: "سارة" }],
  expectedCash: 500,
  countedCash: 505,
  difference: 5,
};

const sales: ReportSummaryPrintData = {
  venueName: "Fast Cafe",
  fromLabel: "2026-10-30 00:00",
  toLabel: "2026-10-31 23:59",
  printedAt: "2026-10-31 18:00",
  invoiceCount: 12,
  totalSales: 640.5,
  cashTotal: 500.5,
  nonCashTotal: 140,
  paymentBreakdown: [{ name: "نقدي", total: 500.5, count: 9 }],
  totalItems: 28,
  tableSales: 9,
  quickSales: 3,
  cancelledCount: 1,
  openCount: 2,
  openTotal: 45,
  categorySales: [{ name: "مشروبات ساخنة", qty: 18, revenue: 420.5 }],
  itemSales: [{ name: "شاي", qty: 12, revenue: 120 }],
  waiterPerformance: [],
  cashierPerformance: [],
};

describe("receiptDocumentData", () => {
  it("maps brand, fields, four item cells, notes, and the total", () => {
    const data = receiptDocumentData(receipt, settings);
    expect(data.title).toBe("Acme Corner");
    expect(data.subtitle).toBe("Fast Cafe · إيصال الدفع");
    expect(data.fields).toMatchObject({
      orderNo: "7",
      invoiceId: "#12",
      table: "4",
      waiter: "أحمد",
      customer: "محمد سالم",
      payment: "نقدي",
      time: "2026-10-31 14:05",
    });
    expect(data.items[0]).toEqual({
      name: "كابتشينو",
      qty: "2",
      unitPrice: "12.00",
      lineTotal: "24.00",
    });
    expect(data.itemNotes).toEqual(["بدون سكر", null]);
    expect(data.summary).toBe("32.00 د.ل");
    expect(data.footer).toBe("شكراً لزيارتكم");
  });

  it("falls back to the venue title and hides empty optionals", () => {
    const data = receiptDocumentData(
      { ...receipt, waiterName: null, customerName: null, customerPhone: null },
      { ...settings, brandName: "", brandAddress: "" },
    );
    expect(data.title).toBe("Fast Cafe");
    expect(data.subtitle).toBe("إيصال الدفع");
    expect(data.fields.waiter).toBeNull();
    expect(data.fields.customer).toBeNull();
  });
});

describe("kitchenDocumentData", () => {
  it("marks void tickets and keeps ticket parts", () => {
    const data = kitchenDocumentData({
      venueName: "Fast Cafe",
      orderId: 7,
      tableName: "T1",
      waiterName: "علي",
      createdAt: "12:30",
      ticketPart: "2/3",
      kind: "void",
      lines: [{ name: "بيتزا", qty: 1, note: "بدون بصل" }],
    });
    expect(data.title).toBe("إلغاء — لا تحضّر");
    expect(data.fields).toMatchObject({
      orderNo: "#7",
      invoiceId: "#7",
      table: "T1",
      waiter: "علي",
      time: "12:30",
      ticketPart: "2/3",
    });
    expect(data.items[0]).toEqual({ name: "بيتزا", qty: "1" });
    expect(data.summary).toBeNull();
  });

  it("prints the per-shift order number and exposes the invoice id", () => {
    const data = kitchenDocumentData({
      venueName: "Fast Cafe",
      orderId: 7,
      orderNo: 42,
      tableName: "T1",
      waiterName: "علي",
      createdAt: "12:30",
      lines: [{ name: "بيتزا", qty: 1 }],
    });
    expect(data.fields.orderNo).toBe("42");
    expect(data.fields.invoiceId).toBe("#7");
  });
});

describe("shiftDocumentData", () => {
  it("maps the three sections, expenses, difference, and status", () => {
    const data = shiftDocumentData(shift);
    expect(data.title).toBe("إغلاق وردية #4");
    expect(data.sections.collection!.rows.map((row) => row.labelId)).toEqual([
      "invoiceCount",
      "total",
      undefined,
      undefined,
      "totalItems",
      "tableQuick",
    ]);
    expect(
      data.sections.expenses!.rows.map((row) => row.labelId ?? row.label),
    ).toEqual(["openingFloat", "شراء ثلج", "expenseTotal"]);
    expect(data.sections.reconciliation!.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labelId: "difference", value: "زيادة 5.00 د.ل", bold: true }),
      ]),
    );
    expect(data.footer).toBe("تم إغلاق الوردية");
    expect(data.status).toBe("تم إغلاق الوردية");
  });

  it("marks a reprinted closed shift as closed", () => {
    const data = shiftDocumentData({ ...shift, kind: "reprint" });
    expect(data.title).toBe("إعادة طباعة وردية #4");
    expect(data.status).toBe("تم إغلاق الوردية");
  });

  it("words matching and short cash differences", () => {
    const matching = shiftDocumentData({ ...shift, countedCash: 500, difference: 0 });
    expect(
      matching.sections.reconciliation!.rows.find((row) => row.labelId === "difference")
        ?.value,
    ).toBe("مطابق");
    const short = shiftDocumentData({ ...shift, countedCash: 492.5, difference: -7.5 });
    expect(
      short.sections.reconciliation!.rows.find((row) => row.labelId === "difference")
        ?.value,
    ).toBe("عجز 7.50 د.ل");
  });

  it("uses the empty-expenses text and an open status", () => {
    const data = shiftDocumentData({
      ...shift,
      kind: "summary",
      expenses: [],
      expenseTotal: 0,
      difference: null,
      countedCash: null,
    });
    expect(
      data.sections.expenses!.rows.map((row) => row.labelId ?? row.label),
    ).toEqual(["openingFloat", "لا مصروفات في هذه الوردية", "expenseTotal"]);
    expect(data.sections.expenses!.rows[1]).toEqual({
      label: "لا مصروفات في هذه الوردية",
      value: "",
    });
    expect(data.status).toBe("الوردية ما زالت مفتوحة");
    expect(
      data.sections.reconciliation!.rows.some((row) => row.labelId === "difference"),
    ).toBe(false);
  });
});

describe("items and sales documents", () => {
  it("prints the items ticket as numbered category and item tables", () => {
    const data = itemsDocumentData(shift);
    expect(data.title).toBe("تقرير أصناف الوردية #4");
    expect(data.sections.overview!.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labelId: "categoryCount", value: "2" }),
        expect.objectContaining({ labelId: "itemCount", value: "3" }),
      ]),
    );
    expect(data.sections.categories!.table).toEqual([
      { index: "1", name: "مشروبات باردة", qty: "3", revenue: "30.00" },
      { index: "2", name: "مشروبات ساخنة", qty: "3", revenue: "18.00" },
    ]);
    expect(data.sections.itemsList!.table).toEqual([
      { index: "1", name: "كولا", qty: "3", revenue: "30.00" },
      { index: "2", name: "شاي", qty: "2", revenue: "10.00" },
      { index: "3", name: "قهوة", qty: "1", revenue: "8.00" },
    ]);
    expect(data.summary).toBe("6 قطعة");
  });

  it("renders the empty items state", () => {
    const data = itemsDocumentData({ ...shift, items: [] });
    expect(data.sections.overview!.rows).toEqual([]);
    expect(data.sections.categories!.table).toEqual([]);
    expect(data.sections.categories!.emptyText).toBe("لا مجموعات في هذه الوردية");
    expect(data.sections.itemsList!.emptyText).toBe("لا أصناف مبيعة في هذه الوردية");
    expect(data.summary).toBeNull();
  });

  it("maps the sales report totals and both tables", () => {
    const data = salesDocumentData(sales);
    expect(data.title).toBe("تقرير المبيعات");
    expect(data.sections.totals!.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labelId: "total", value: "640.50 د.ل", bold: true }),
        expect.objectContaining({ label: "نقدي", value: "500.50 د.ل" }),
      ]),
    );
    expect(data.sections.categories!.table![0]).toEqual({
      index: "1",
      name: "مشروبات ساخنة",
      qty: "18",
      revenue: "420.50",
    });
    expect(data.sections.itemsList!.table![0]).toEqual({
      index: "1",
      name: "شاي",
      qty: "12",
      revenue: "120.00",
    });
    expect(data.summary).toBe("640.50 د.ل");
  });

  it("prints a no-payments row when nothing was collected", () => {
    const data = salesDocumentData({
      ...sales,
      paymentBreakdown: [],
      totalSales: 0,
      invoiceCount: 0,
    });
    expect(data.sections.totals!.rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ labelId: "noPayments" })]),
    );
  });
});

describe("sample documents", () => {
  it("builds a renderable sample for every document", () => {
    const samples = buildSampleDocuments(settings);
    for (const doc of REPORT_DOCUMENTS) {
      const lines = layoutTemplate(DEFAULT_REPORT_TEMPLATES[doc], samples[doc]);
      expect(lines.length, doc).toBeGreaterThan(0);
    }
    const texts = (doc: (typeof REPORT_DOCUMENTS)[number]) =>
      layoutTemplate(DEFAULT_REPORT_TEMPLATES[doc], samples[doc])
        .filter((line): line is Extract<LayoutLine, { kind: "text" }> => line.kind === "text")
        .map((line) => line.text)
        .join("\n");
    expect(samples.receipt.items).toHaveLength(3);
    expect(samples.receipt.summary).toBe("38.00 د.ل");
    expect(
      JSON.stringify(layoutTemplate(DEFAULT_REPORT_TEMPLATES.receipt, samples.receipt)),
    ).toContain("كرواسون");
    expect(JSON.stringify(samples.kitchen)).toContain("كابتشينو");
    expect(texts("shift")).toContain("إغلاق وردية #4");
    expect(texts("items")).toContain("المجموعات");
    expect(
      JSON.stringify(layoutTemplate(DEFAULT_REPORT_TEMPLATES.items, samples.items)),
    ).toContain("مشروبات ساخنة");
    expect(texts("sales")).toContain("تقرير المبيعات");
  });
});
