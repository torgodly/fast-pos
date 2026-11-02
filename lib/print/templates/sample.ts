import type {
  CheckoutReceiptData,
  KitchenReceiptData,
  ReportSummaryPrintData,
  ShiftReportPrintData,
} from "@/lib/print/receipts";
import {
  itemsDocumentData,
  kitchenDocumentData,
  receiptDocumentData,
  salesDocumentData,
  shiftDocumentData,
  type ReceiptDocumentSettings,
} from "./data";
import type { DocumentData, ReportDocument } from "./types";

export const sampleSettings: ReceiptDocumentSettings = {
  venueName: "فاست بوس",
  brandName: "REST",
  brandPhone: "0911234567",
  brandAddress: "طرابلس — الشارع الرئيسي",
  footer: "شكراً لزيارتكم — نراكم قريباً",
  logoAvailable: true,
};

const sampleReceipt: CheckoutReceiptData = {
  venueName: "فاست بوس",
  orderId: 148,
  orderNo: 12,
  tableName: "4",
  waiterName: "أحمد",
  customerName: "محمد سالم",
  customerPhone: "0910000000",
  cashierName: "سارة",
  paymentMethod: "cash",
  paymentMethodLabel: "نقدي",
  paidAt: "2026-10-31 14:05",
  total: 38,
  lines: [
    { name: "كابتشينو", qty: 2, unitPrice: 12, lineTotal: 24 },
    { name: "قهوة عربية", qty: 1, unitPrice: 8, lineTotal: 8, note: "بدون سكر" },
    { name: "كرواسون", qty: 1, unitPrice: 6, lineTotal: 6 },
  ],
};

const sampleKitchen: KitchenReceiptData = {
  venueName: "فاست بوس",
  orderId: 148,
  orderNo: 12,
  tableName: "4",
  waiterName: "أحمد",
  createdAt: "14:05",
  ticketPart: "1/2",
  kind: "order",
  lines: [
    { name: "كابتشينو", qty: 2 },
    { name: "قهوة عربية", qty: 1, note: "بدون سكر" },
  ],
};

const sampleShift: ShiftReportPrintData = {
  kind: "close",
  shiftNumber: 4,
  venueName: "فاست بوس",
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
    { name: "شاي", qty: 2, categoryName: "مشروبات ساخنة", revenue: 20 },
    { name: "كولا", qty: 3, categoryName: "مشروبات باردة", revenue: 30 },
    { name: "قهوة", qty: 1, categoryName: "مشروبات ساخنة", revenue: 10 },
  ],
  openingFloat: 50,
  expenseTotal: 12.5,
  expenses: [{ reason: "شراء ثلج", amount: 12.5, createdByName: "سارة" }],
  expectedCash: 500,
  countedCash: 505,
  difference: 5,
};

const sampleSales: ReportSummaryPrintData = {
  venueName: "فاست بوس",
  fromLabel: "2026-10-30 00:00",
  toLabel: "2026-10-31 23:59",
  printedAt: "2026-10-31 18:00",
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
  cancelledCount: 1,
  openCount: 2,
  openTotal: 45,
  categorySales: [
    { name: "مشروبات ساخنة", qty: 18, revenue: 420.5 },
    { name: "مشروبات باردة", qty: 10, revenue: 220 },
  ],
  itemSales: [
    { name: "شاي", qty: 12, revenue: 120 },
    { name: "كابتشينو", qty: 6, revenue: 72 },
  ],
  waiterPerformance: [],
  cashierPerformance: [],
};

export function buildSampleDocuments(
  settings: ReceiptDocumentSettings,
): Record<ReportDocument, DocumentData> {
  return {
    receipt: receiptDocumentData(
      { ...sampleReceipt, venueName: settings.venueName },
      settings,
    ),
    kitchen: kitchenDocumentData({
      ...sampleKitchen,
      venueName: settings.venueName,
    }),
    shift: shiftDocumentData({ ...sampleShift, venueName: settings.venueName }),
    items: itemsDocumentData({ ...sampleShift, venueName: settings.venueName }),
    sales: salesDocumentData({ ...sampleSales, venueName: settings.venueName }),
  };
}
