import { paymentMethodLabel } from "@/lib/payments/core";

export type ReceiptLine = {
  name: string;
  qty: number;
  unitPrice?: number;
  lineTotal?: number;
  note?: string | null;
};

export type ReportSummaryPrintData = {
  venueName: string;
  fromLabel: string;
  toLabel: string;
  printedAt: string;
  invoiceCount: number;
  totalSales: number;
  cashTotal: number;
  nonCashTotal: number;
  paymentBreakdown: Array<{ name: string; total: number; count: number }>;
  totalItems: number;
  tableSales: number;
  quickSales: number;
  cancelledCount: number;
  openCount: number;
  openTotal: number;
  categorySales: Array<{ name: string; qty: number; revenue: number }>;
  itemSales: Array<{ name: string; qty: number; revenue: number }>;
  waiterPerformance: Array<{ name: string; invoices: number; sales: number }>;
  cashierPerformance: Array<{
    name: string;
    invoices: number;
    cash: number;
    nonCash: number;
    sales: number;
  }>;
};

export type PurchasesReportPrintData = {
  venueName: string;
  fromLabel: string;
  toLabel: string;
  supplierLabel: string;
  printedAt: string;
  printedByName: string;
  invoiceCount: number;
  totalSpent: number;
  lineCount: number;
  supplierCount: number;
  invoices: Array<{
    invoiceNumber: string;
    supplierName: string;
    date: string;
    lineCount: number;
    totalCost: number;
  }>;
};

export type ShiftReportPrintData = {
  kind: "summary" | "close" | "reprint";
  shiftNumber: number;
  venueName: string;
  workDate: string;
  openedAt: string;
  closedAt: string | null;
  printedAt: string;
  printedByName: string;
  openedByName: string | null;
  closedByName: string | null;
  invoiceCount: number;
  totalSales: number;
  cashTotal: number;
  nonCashTotal: number;
  paymentBreakdown: Array<{ name: string; total: number; count: number }>;
  totalItems: number;
  tableSales: number;
  quickSales: number;
  items: Array<{ name: string; qty: number; categoryName: string; revenue: number }>;
  openingFloat: number;
  expenseTotal: number;
  expenses: Array<{
    reason: string;
    amount: number;
    createdByName: string;
  }>;
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
};

export type ShiftItemsPrintData = Pick<
  ShiftReportPrintData,
  | "kind"
  | "shiftNumber"
  | "venueName"
  | "workDate"
  | "printedAt"
  | "printedByName"
  | "items"
  | "totalItems"
>;

export type KitchenReceiptData = {
  venueName: string;
  orderId: number;
  /** Per-shift invoice sequence; omitted on previews and legacy rows. */
  orderNo?: number | null;
  tableName: string;
  waiterName: string;
  createdAt: string;
  lines: ReceiptLine[];
  /** e.g. "2/3" when order is split across multiple kitchen tickets */
  ticketPart?: string;
  kind?: "order" | "void";
};

export type CheckoutReceiptData = {
  venueName: string;
  orderId: number;
  /** Per-shift invoice sequence; omitted on unpaid previews and legacy rows. */
  orderNo?: number | null;
  tableName: string;
  waiterName: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  brandName?: string | null;
  brandPhone?: string | null;
  brandAddress?: string | null;
  cashierName: string;
  paymentMethod: string;
  /** Configured display name; falls back to legacy cash/card labels. */
  paymentMethodLabel?: string | null;
  paidAt: string;
  total: number;
  footerMessage?: string;
  lines: Array<ReceiptLine & { unitPrice: number; lineTotal: number }>;
};

export function checkoutReceiptMethodLabel(
  data: Pick<CheckoutReceiptData, "paymentMethod" | "paymentMethodLabel">,
) {
  if (data.paymentMethod === "preview") return "غير مدفوعة";
  const configured = data.paymentMethodLabel?.trim();
  return configured || paymentMethodLabel(data.paymentMethod, []);
}
