import iconv from "iconv-lite";
import { beforeAll, describe, expect, it } from "vitest";
import type { ShiftReportPrintData } from "./receipts";

type BuildReport = typeof import("./escpos").buildShiftReportEscPos;
type BuildItems = typeof import("./escpos").buildShiftItemsEscPos;

let buildShiftReportEscPos: BuildReport;
let buildShiftItemsEscPos: BuildItems;

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  ({ buildShiftReportEscPos, buildShiftItemsEscPos } = await import(
    "./escpos"
  ));
});

const base: ShiftReportPrintData = {
  kind: "close",
  shiftNumber: 3,
  venueName: "مطعم",
  workDate: "2026-10-25",
  openedAt: "2026-10-25 09:00:00",
  closedAt: "2026-10-25 18:00:00",
  printedAt: "2026-10-25 18:00:00",
  printedByName: "كاشير رئيسي",
  openedByName: "كاشير رئيسي",
  closedByName: "كاشير رئيسي",
  invoiceCount: 2,
  totalSales: 30,
  cashTotal: 20,
  nonCashTotal: 10,
  paymentBreakdown: [
    { name: "نقدي", total: 20, count: 1 },
    { name: "بطاقة", total: 10, count: 1 },
  ],
  totalItems: 3,
  tableSales: 1,
  quickSales: 1,
  groups: [{ name: "مشروبات ساخنة", qty: 3, revenue: 30 }],
  items: [
    { name: "شاي", qty: 2 },
    { name: "قهوة", qty: 1 },
  ],
  openingFloat: 30,
  expenseTotal: 12.5,
  expenses: [
    { reason: "شراء ثلج", amount: 12.5, createdByName: "كاشير" },
  ],
  expectedCash: 37.5,
  countedCash: 40,
  difference: 2.5,
};

function reportText(data: ShiftReportPrintData) {
  return iconv.decode(Buffer.from(buildShiftReportEscPos(data)), "win1256");
}

describe("shift report expenses", () => {
  it("itemizes expenses and prints the deducted expected cash", () => {
    const text = reportText(base);

    expect(text).toContain("المصروفات");
    expect(text).toContain("شراء ثلج");
    expect(text).toContain("12.50");
    expect(text).toContain("إجمالي المصروفات");
    expect(text).toContain("37.50");
    expect(text).toContain("زيادة 2.50");
  });

  it("prints an empty-expenses line when none were recorded", () => {
    const text = reportText({
      ...base,
      expenses: [],
      expenseTotal: 0,
      expectedCash: 50,
    });

    expect(text).toContain("لا مصروفات في هذه الوردية");
  });
});

describe("shift report payment methods", () => {
  it("prints every configured payment method total, including custom ones", () => {
    const text = reportText({
      ...base,
      paymentBreakdown: [
        { name: "نقدي", total: 20, count: 1 },
        { name: "بريستو", total: 10, count: 1 },
      ],
    });

    expect(text).toContain("نقدي");
    expect(text).toContain("بريستو");
    expect(text).toContain("10.00");
  });

  it("prints a no-payments line when nothing was collected", () => {
    const text = reportText({
      ...base,
      paymentBreakdown: [],
      invoiceCount: 0,
      totalSales: 0,
      cashTotal: 0,
      nonCashTotal: 0,
    });

    expect(text).toContain("لا مدفوعات");
  });
});

describe("shift items ticket", () => {
  it("lists item quantities and totals on a separate ticket", () => {
    const text = iconv.decode(
      Buffer.from(buildShiftItemsEscPos(base)),
      "win1256",
    );

    expect(text).toContain("أصناف وردية #3");
    expect(text).toContain("شاي: 2");
    expect(text).toContain("قهوة: 1");
    expect(text).toContain("إجمالي القطع: 3");
    expect(text).toContain("نهاية تقرير الأصناف");
  });

  it("prints an empty-sales line instead of a blank list", () => {
    const text = iconv.decode(
      Buffer.from(buildShiftItemsEscPos({ ...base, items: [], totalItems: 0 })),
      "win1256",
    );

    expect(text).toContain("لا أصناف مبيعة في هذه الوردية");
  });
});
