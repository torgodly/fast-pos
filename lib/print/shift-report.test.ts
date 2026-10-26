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
  items: [
    { name: "شاي", qty: 2, categoryName: "مشروبات ساخنة" },
    { name: "قهوة", qty: 1, categoryName: "مشروبات ساخنة" },
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

describe("shift report financial sections", () => {
  it("prints only financial records and keeps sales counts", () => {
    const text = reportText(base);

    expect(text).toContain("التحصيل");
    expect(text).toContain("العهدة والمصروفات");
    expect(text).toContain("مطابقة النقد");
    expect(text).toContain("الفواتير: 2");
    expect(text).toContain("قطع مباعة: 3");
    expect(text).toContain("طاولات / سريع: 1 / 1");
    expect(text).not.toContain("المبيعات حسب المجموعة");
    expect(text).not.toContain("مشروبات ساخنة");
  });
});

describe("shift items ticket", () => {
  function itemsText(items: ShiftReportPrintData["items"], totalItems: number) {
    return iconv.decode(
      Buffer.from(buildShiftItemsEscPos({ ...base, items, totalItems })),
      "win1256",
    );
  }

  it("groups items under bold category headers with subtotals", () => {
    const text = itemsText(
      [
        { name: "كولا", qty: 3, categoryName: "مشروبات باردة" },
        { name: "شاي", qty: 2, categoryName: "مشروبات ساخنة" },
        { name: "قهوة", qty: 1, categoryName: "مشروبات ساخنة" },
      ],
      6,
    );

    expect(text).toContain("تقرير أصناف الوردية #3");
    expect(text).toContain("المجموعات: 2");
    expect(text).toContain("الأصناف: 3");
    expect(text).toContain("إجمالي القطع: 6");
    expect(text).toContain("— مشروبات باردة —");
    expect(text).toContain("— مشروبات ساخنة —");
    expect(text.indexOf("— مشروبات باردة —")).toBeLessThan(
      text.indexOf("— مشروبات ساخنة —"),
    );
    expect(text).toMatch(/كولا\s+\.+\s+3/);
    expect(text).toMatch(/شاي\s+\.+\s+2/);
    expect(text).toMatch(/قهوة\s+\.+\s+1/);
    expect(text).toContain("إجمالي المجموعة: 3 قطعة");
    expect(text).toContain("الإجمالي العام: 6 قطعة");
    expect(text).toContain("نهاية تقرير الأصناف");
  });

  it("prints an empty-sales line instead of a blank list", () => {
    const text = itemsText([], 0);

    expect(text).toContain("لا أصناف مبيعة في هذه الوردية");
  });
});
