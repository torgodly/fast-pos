import iconv from "iconv-lite";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/settings", () => ({
  getSettingValue: () => null,
  setSettingValue: () => {},
  deleteSettingValue: () => {},
  getBrandDetails: () => ({ name: "", phone: "", address: "" }),
  getReceiptFooterMessage: () => "",
}));
import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import type {
  CheckoutReceiptData,
  KitchenReceiptData,
  ReportSummaryPrintData,
} from "@/lib/print/receipts";

type BuildModule = typeof import("./build");
let build: BuildModule;

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  build = await import("./build");
});

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
    { name: "كابتشينو", qty: 2, unitPrice: 12, lineTotal: 24 },
    { name: "قهوة عربية", qty: 1, unitPrice: 8, lineTotal: 8 },
  ],
};

const kitchen: KitchenReceiptData = {
  venueName: "Fast Cafe",
  orderId: 12,
  tableName: "4",
  waiterName: "أحمد",
  createdAt: "14:05",
  kind: "order",
  lines: [{ name: "بيتزا", qty: 2 }],
};

const sales: ReportSummaryPrintData = {
  venueName: "Fast Cafe",
  fromLabel: "2026-10-30 00:00",
  toLabel: "2026-10-31 23:59",
  printedAt: "2026-10-31 18:00",
  invoiceCount: 2,
  totalSales: 30,
  cashTotal: 20,
  nonCashTotal: 10,
  paymentBreakdown: [{ name: "نقدي", total: 20, count: 1 }],
  totalItems: 3,
  tableSales: 1,
  quickSales: 1,
  cancelledCount: 0,
  openCount: 0,
  openTotal: 0,
  categorySales: [{ name: "مشروبات ساخنة", qty: 2, revenue: 20 }],
  itemSales: [{ name: "شاي", qty: 2, revenue: 20 }],
  waiterPerformance: [],
  cashierPerformance: [],
};

const receiptOverrides = {
  template: DEFAULT_REPORT_TEMPLATES.receipt,
  settings: { logoAvailable: false },
  logo: null,
};

function decode(bytes: Uint8Array) {
  return iconv.decode(Buffer.from(bytes), "win1256");
}

describe("template builders", () => {
  it("builds the receipt with the four-column item table", async () => {
    const text = decode(await build.buildReceiptEscPos(receipt, receiptOverrides));

    expect(text).toContain("رقم الطلب: 7");
    expect(text).toContain("فاتورة: #12");
    expect(text).toContain("محمد سالم");
    expect(text).toContain("0910000000");
    expect(text).toContain("الصنف");
    expect(text).toContain("الكمية");
    expect(text).toContain("السعر");
    expect(text).toContain("الإجمالي");
    expect(text).toContain("24.00");
    expect(text).toContain("32.00");
    expect(text).not.toMatch(/\d+ x /);
  });

  it("omits totals from kitchen tickets", async () => {
    const text = decode(
      await build.buildKitchenEscPos(kitchen, {
        template: DEFAULT_REPORT_TEMPLATES.kitchen,
        logo: null,
      }),
    );

    expect(text).toContain("طلبات المطبخ");
    expect(text).toContain("بيتزا");
    expect(text).not.toContain("الإجمالي");
    expect(text).not.toContain("د.ل");
  });

  it("renders the sales report sections and the final total", async () => {
    const text = decode(
      await build.buildSalesReportEscPos(sales, {
        template: DEFAULT_REPORT_TEMPLATES.sales,
        logo: null,
      }),
    );

    expect(text).toContain("تقرير المبيعات");
    expect(text).toContain("المجموعات");
    expect(text).toContain("مشروبات ساخنة");
    expect(text).toContain("الإجمالي النهائي");
  });

  it("builds a sample document from a validated template", async () => {
    const text = decode(
      await build.buildSampleEscPos(
        "receipt",
        DEFAULT_REPORT_TEMPLATES.receipt,
        { settings: { logoAvailable: false }, logo: null },
      ),
    );

    expect(text).toContain("كابتشينو");
    expect(text).toContain("الصنف");
  });
});
