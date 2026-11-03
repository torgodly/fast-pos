import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canDownloadDesignPdf,
  canDownloadOrderPdf,
  canDownloadPurchasesPdf,
  canDownloadSalesPdf,
  canDownloadShiftPdf,
} from "@/lib/print/pdf/access";
import {
  itemsPdf,
  kitchenPdfForOrder,
  purchasesPdf,
  receiptPdfForOrder,
  salesPdf,
  samplePdf,
  shiftPdf,
  type PdfResult,
} from "@/lib/print/pdf/documents";
import { parseReportTemplateJson } from "@/lib/print/templates/schema";
import { isReportDocument } from "@/lib/print/templates/types";
import {
  purchasesToPrintData,
  summaryToPrintData,
} from "@/lib/reports/print-data";
import type { ReportFiltersInput } from "@/lib/reports/filters";
import {
  getPurchaseSummary,
  type PurchaseFiltersInput,
} from "@/lib/reports/purchases";
import { getReportSummary } from "@/lib/reports/summary";
import { buildShiftReportData, getShiftById } from "@/lib/shifts/core";

export const runtime = "nodejs";

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function pdfResponse(result: PdfResult) {
  const filename = result.filename.replace(/[^\w.\-]+/g, "-");
  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(result.bytes.length),
      "Cache-Control": "no-store",
    },
  });
}

function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail(401, "غير مصرح");

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!body || !isReportDocument(body.document)) {
    return fail(400, "تقرير غير معروف");
  }
  const document = body.document;

  try {
    if (body.source === "design") {
      if (!canDownloadDesignPdf(session)) return fail(403, "غير مصرح");
      const json = typeof body.template === "string" ? body.template : "";
      const parsed = parseReportTemplateJson(json, document);
      if (!parsed.ok) return fail(400, parsed.errors.join("؛ "));
      return pdfResponse(await samplePdf(document, parsed.template));
    }

    if (document === "receipt" || document === "kitchen") {
      const orderId = positiveId(body.orderId);
      if (!orderId) return fail(400, "فاتورة غير صالحة");
      if (!canDownloadOrderPdf(session, orderId)) return fail(403, "غير مصرح");
      const result =
        document === "receipt"
          ? await receiptPdfForOrder(orderId)
          : await kitchenPdfForOrder(orderId);
      if ("error" in result) return fail(404, result.error);
      return pdfResponse(result);
    }

    if (document === "shift" || document === "items") {
      const shiftId = positiveId(body.shiftId);
      if (!shiftId) return fail(400, "وردية غير صالحة");
      if (!canDownloadShiftPdf(session)) return fail(403, "غير مصرح");
      const shift = getShiftById(shiftId);
      if (!shift) return fail(404, "الوردية غير موجودة");
      const data = buildShiftReportData(
        shift.id,
        session.name,
        shift.status === "closed" ? "reprint" : "summary",
      );
      if (!data) return fail(404, "تعذر تجهيز تقرير الوردية");
      return pdfResponse(
        document === "shift" ? await shiftPdf(data) : await itemsPdf(data),
      );
    }

    if (document === "purchases") {
      if (!canDownloadPurchasesPdf(session)) return fail(403, "غير مصرح");
      const filters = (
        body.filters && typeof body.filters === "object" ? body.filters : {}
      ) as PurchaseFiltersInput;
      const summary = getPurchaseSummary(filters);
      const result = await purchasesPdf(
        purchasesToPrintData(summary, {
          venueName: "المخزن",
          printedByName: session.name,
        }),
        undefined,
        { from: summary.fromSql ?? "", to: summary.toSql ?? "" },
      );
      return pdfResponse(result);
    }

    if (!canDownloadSalesPdf(session)) return fail(403, "غير مصرح");
    const filters = (
      body.filters && typeof body.filters === "object" ? body.filters : {}
    ) as ReportFiltersInput;
    const summary = getReportSummary(filters);
    const result = await salesPdf(summaryToPrintData(summary), undefined, {
      from: summary.fromSql,
      to: summary.toSql,
    });
    return pdfResponse(result);
  } catch (error) {
    console.error("PDF export failed:", error);
    return fail(500, "تعذر إنشاء ملف PDF");
  }
}
