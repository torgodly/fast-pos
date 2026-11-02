import {
  kitchenPage,
  itemsPage,
  receiptPage,
  salesPage,
  samplePage,
  shiftPage,
  type DocumentPage,
} from "../templates/build";
import { loadReportTemplate } from "../templates/store";
import type { ReportDocument, ReportTemplate } from "../templates/types";
import {
  loadCheckoutReceiptForOrder,
  loadKitchenReceiptForOrder,
} from "../order-documents";
import type {
  ReportSummaryPrintData,
  ShiftItemsPrintData,
  ShiftReportPrintData,
} from "../receipts";
import { imagePdf } from "./image-pdf";
import { renderLayoutPage } from "./render-page";

export type PdfResult = { bytes: Uint8Array; filename: string };

export type PdfFilenameInput = {
  document: ReportDocument;
  design?: boolean;
  orderNo?: number | null;
  orderId?: number;
  shiftNumber?: number;
  from?: string;
  to?: string;
};

function datePart(value: string | undefined): string {
  return (value ?? "").trim().slice(0, 10);
}

export function pdfFilename(input: PdfFilenameInput): string {
  if (input.design) {
    return `design-${input.document}.pdf`;
  }
  if (input.document === "receipt" || input.document === "kitchen") {
    const number = input.orderNo ?? input.orderId;
    return `${input.document}-${number ?? "order"}.pdf`;
  }
  if (input.document === "shift" || input.document === "items") {
    return `${input.document}-${input.shiftNumber ?? "report"}.pdf`;
  }
  if (input.document === "sales") {
    const from = datePart(input.from);
    const to = datePart(input.to);
    if (!from && !to) return "sales-report.pdf";
    return `sales-${from || to}_${to || from}.pdf`;
  }
  return `${input.document}.pdf`;
}

async function pageToPdf(page: DocumentPage): Promise<Uint8Array> {
  const rendered = await renderLayoutPage(page.lines, {
    logoPng: page.logoPng,
  });
  return imagePdf(rendered);
}

export async function receiptPdfForOrder(
  orderId: number,
): Promise<PdfResult | { error: string }> {
  const loaded = await loadCheckoutReceiptForOrder(orderId);
  if ("error" in loaded) return loaded;
  return {
    bytes: await pageToPdf(await receiptPage(loaded.receipt)),
    filename: pdfFilename({
      document: "receipt",
      orderId: loaded.receipt.orderId,
      orderNo: loaded.receipt.orderNo,
    }),
  };
}

export async function kitchenPdfForOrder(
  orderId: number,
): Promise<PdfResult | { error: string }> {
  const loaded = loadKitchenReceiptForOrder(orderId);
  if ("error" in loaded) return loaded;
  return {
    bytes: await pageToPdf(await kitchenPage(loaded.kitchen)),
    filename: pdfFilename({
      document: "kitchen",
      orderId: loaded.kitchen.orderId,
      orderNo: loaded.kitchen.orderNo,
    }),
  };
}

export async function shiftPdf(
  data: ShiftReportPrintData,
  template?: ReportTemplate,
): Promise<PdfResult> {
  return {
    bytes: await pageToPdf(await shiftPage(data, { template })),
    filename: pdfFilename({
      document: "shift",
      shiftNumber: data.shiftNumber,
    }),
  };
}

export async function itemsPdf(
  data: ShiftItemsPrintData,
  template?: ReportTemplate,
): Promise<PdfResult> {
  return {
    bytes: await pageToPdf(await itemsPage(data, { template })),
    filename: pdfFilename({
      document: "items",
      shiftNumber: data.shiftNumber,
    }),
  };
}

export type PdfRange = { from: string; to: string };

export async function salesPdf(
  data: ReportSummaryPrintData,
  template?: ReportTemplate,
  range?: PdfRange,
): Promise<PdfResult> {
  return {
    bytes: await pageToPdf(await salesPage(data, { template })),
    filename: pdfFilename({
      document: "sales",
      from: range?.from,
      to: range?.to,
    }),
  };
}

export async function samplePdf(
  document: ReportDocument,
  template?: ReportTemplate,
): Promise<PdfResult> {
  const page = await samplePage(
    document,
    template ?? loadReportTemplate(document),
  );
  return {
    bytes: await pageToPdf(page),
    filename: pdfFilename({ document, design: true }),
  };
}
