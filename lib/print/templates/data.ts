import { receiptBrandBlock } from "@/lib/print/brand";
import {
  checkoutReceiptMethodLabel,
  type CheckoutReceiptData,
  type KitchenReceiptData,
  type ReportSummaryPrintData,
  type ShiftItemsPrintData,
  type ShiftReportPrintData,
} from "@/lib/print/receipts";
import type { DocumentData, DocumentSectionData } from "./types";

export type ReceiptDocumentSettings = {
  venueName: string;
  brandName: string;
  brandPhone: string;
  brandAddress: string;
  footer: string;
  logoAvailable: boolean;
};

function money(amount: number): string {
  return `${amount.toFixed(2)} د.ل`;
}

function amount(value: number): string {
  return value.toFixed(2);
}

export function receiptDocumentData(
  input: CheckoutReceiptData,
  settings: ReceiptDocumentSettings,
): DocumentData {
  const brand = receiptBrandBlock({
    venueName: input.venueName || settings.venueName,
    brandName: settings.brandName,
    brandPhone: settings.brandPhone,
    brandAddress: settings.brandAddress,
  });
  return {
    title: brand.title,
    subtitle: brand.subtitle,
    venue: input.venueName || settings.venueName,
    brandPhone: settings.brandPhone,
    brandAddress: settings.brandAddress,
    footer: settings.footer,
    status: "",
    logoAvailable: settings.logoAvailable,
    fields: {
      orderNo: input.orderNo ? String(input.orderNo) : null,
      invoiceId: input.orderId > 0 ? `#${input.orderId}` : "—",
      table: input.tableName || null,
      waiter: input.waiterName?.trim() || null,
      customer: input.customerName?.trim() || null,
      phone: input.customerPhone?.trim() || null,
      cashier: input.cashierName,
      payment: checkoutReceiptMethodLabel(input),
      time: input.paidAt,
    },
    items: input.lines.map((line) => ({
      name: line.name,
      qty: String(line.qty),
      unitPrice: amount(line.unitPrice),
      lineTotal: amount(line.lineTotal),
    })),
    itemNotes: input.lines.map((line) => line.note?.trim() || null),
    sections: {},
    summary: money(input.total),
  };
}

export function kitchenDocumentData(input: KitchenReceiptData): DocumentData {
  return {
    title: input.kind === "void" ? "إلغاء — لا تحضّر" : "طلبات المطبخ",
    subtitle: "",
    venue: input.venueName,
    brandPhone: "",
    brandAddress: "",
    footer: "",
    status: "",
    logoAvailable: false,
    fields: {
      orderNo: input.orderNo ? String(input.orderNo) : `#${input.orderId}`,
      invoiceId: `#${input.orderId}`,
      table: input.tableName,
      waiter: input.waiterName,
      time: input.createdAt,
      ticketPart: input.ticketPart ?? null,
    },
    items: input.lines.map((line) => ({
      name: line.name,
      qty: String(line.qty),
    })),
    itemNotes: input.lines.map((line) => line.note?.trim() || null),
    sections: {},
    summary: null,
  };
}

function differenceValue(difference: number | null): string | null {
  if (difference === null) return null;
  if (difference === 0) return "مطابق";
  if (difference > 0) return `زيادة ${money(difference)}`;
  return `عجز ${money(Math.abs(difference))}`;
}

export function shiftDocumentData(input: ShiftReportPrintData): DocumentData {
  const title =
    input.kind === "close"
      ? `إغلاق وردية #${input.shiftNumber}`
      : input.kind === "reprint"
        ? `إعادة طباعة وردية #${input.shiftNumber}`
        : `ملخص وردية #${input.shiftNumber}`;
  const status =
    input.kind === "summary" ? "الوردية ما زالت مفتوحة" : "تم إغلاق الوردية";
  const collection: DocumentSectionData = {
    kind: "kv",
    rows: [
      { labelId: "invoiceCount", value: String(input.invoiceCount) },
      { labelId: "total", value: money(input.totalSales), bold: true },
      ...input.paymentBreakdown.map((payment) => ({
        label: payment.name,
        value: money(payment.total),
      })),
      ...(input.paymentBreakdown.length === 0
        ? [{ labelId: "noPayments", value: money(0) }]
        : []),
      { labelId: "totalItems", value: String(input.totalItems) },
      {
        labelId: "tableQuick",
        value: `${input.tableSales} / ${input.quickSales}`,
      },
    ],
  };
  const expenses: DocumentSectionData = {
    kind: "kv",
    rows: [
      { labelId: "openingFloat", value: money(input.openingFloat) },
      ...input.expenses.map((expense) => ({
        label: expense.reason,
        value: money(expense.amount),
      })),
      ...(input.expenses.length === 0
        ? [{ label: "لا مصروفات في هذه الوردية", value: "" }]
        : []),
      { labelId: "expenseTotal", value: money(input.expenseTotal) },
    ],
  };
  const difference = differenceValue(input.difference);
  const reconciliation: DocumentSectionData = {
    kind: "kv",
    rows: [
      { labelId: "expectedCash", value: money(input.expectedCash) },
      {
        labelId: "countedCash",
        value: input.countedCash === null ? "—" : money(input.countedCash),
      },
      ...(difference ? [{ labelId: "difference", value: difference, bold: true }] : []),
    ],
  };
  return {
    title,
    subtitle: "",
    venue: input.venueName,
    brandPhone: "",
    brandAddress: "",
    footer: status,
    status,
    logoAvailable: false,
    fields: {
      workDate: input.workDate,
      openedAt: input.openedAt,
      closedAt: input.closedAt ?? "مفتوحة",
      printedAt: input.printedAt,
      printedByName: input.printedByName,
      openedByName: input.openedByName,
      closedByName: input.closedByName,
    },
    items: [],
    itemNotes: [],
    sections: { collection, expenses, reconciliation },
    summary: null,
  };
}

type TableRow = Record<string, string>;

function tableRows(
  rows: Array<{ name: string; qty: number; revenue: number }>,
): TableRow[] {
  return rows.map((row, index) => ({
    index: String(index + 1),
    name: row.name,
    qty: String(row.qty),
    revenue: amount(row.revenue),
  }));
}

export function itemsDocumentData(input: ShiftItemsPrintData): DocumentData {
  const byCategory = new Map<string, { qty: number; revenue: number }>();
  let totalQuantity = 0;
  for (const item of input.items) {
    const category = byCategory.get(item.categoryName) ?? { qty: 0, revenue: 0 };
    category.qty += item.qty;
    category.revenue += item.revenue;
    byCategory.set(item.categoryName, category);
    totalQuantity += item.qty;
  }
  const categoryRows = [...byCategory]
    .map(([name, totals]) => ({ name, qty: totals.qty, revenue: totals.revenue }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, "ar"));
  const itemRows = [...input.items].sort(
    (a, b) => b.qty - a.qty || a.name.localeCompare(b.name, "ar"),
  );
  const empty = input.items.length === 0;
  return {
    title: `تقرير أصناف الوردية #${input.shiftNumber}${
      input.kind === "reprint" ? " — إعادة طباعة" : ""
    }`,
    subtitle: "",
    venue: input.venueName,
    brandPhone: "",
    brandAddress: "",
    footer: "",
    status: "",
    logoAvailable: false,
    fields: {
      workDate: input.workDate,
      printedAt: input.printedAt,
      printedByName: input.printedByName,
    },
    items: [],
    itemNotes: [],
    sections: {
      overview: {
        kind: "kv",
        rows: empty
          ? []
          : [
              { labelId: "categoryCount", value: String(byCategory.size) },
              { labelId: "itemCount", value: String(input.items.length) },
              { labelId: "totalItems", value: String(totalQuantity), bold: true },
            ],
      },
      categories: {
        kind: "table",
        rows: [],
        table: tableRows(categoryRows),
        emptyText: "لا مجموعات في هذه الوردية",
      },
      itemsList: {
        kind: "table",
        rows: [],
        table: tableRows(itemRows),
        emptyText: "لا أصناف مبيعة في هذه الوردية",
      },
    },
    summary: empty ? null : `${totalQuantity} قطعة`,
  };
}

export function salesDocumentData(input: ReportSummaryPrintData): DocumentData {
  const totals: DocumentSectionData = {
    kind: "kv",
    rows: [
      { labelId: "total", value: money(input.totalSales), bold: true },
      { labelId: "invoiceCount", value: String(input.invoiceCount) },
      { labelId: "totalItems", value: String(input.totalItems) },
      {
        labelId: "tableQuick",
        value: `${input.tableSales} / ${input.quickSales}`,
      },
      ...input.paymentBreakdown.map((payment) => ({
        label: payment.name,
        value: money(payment.total),
      })),
      ...(input.paymentBreakdown.length === 0
        ? [{ labelId: "noPayments", value: money(0) }]
        : []),
    ],
  };
  const tableRows = (
    rows: Array<{ name: string; qty: number; revenue: number }>,
  ) =>
    rows.map((row, index) => ({
      index: String(index + 1),
      name: row.name,
      qty: String(row.qty),
      revenue: amount(row.revenue),
    }));
  return {
    title: "تقرير المبيعات",
    subtitle: "",
    venue: input.venueName,
    brandPhone: "",
    brandAddress: "",
    footer: "",
    status: "",
    logoAvailable: false,
    fields: {
      from: input.fromLabel,
      to: input.toLabel,
      printedAt: input.printedAt,
    },
    items: [],
    itemNotes: [],
    sections: {
      totals,
      categories: {
        kind: "table",
        rows: [],
        table: tableRows(input.categorySales),
        emptyText: "لا مجموعات في هذه الفترة",
      },
      itemsList: {
        kind: "table",
        rows: [],
        table: tableRows(input.itemSales),
        emptyText: "لا أصناف في هذه الفترة",
      },
    },
    summary: money(input.totalSales),
  };
}
