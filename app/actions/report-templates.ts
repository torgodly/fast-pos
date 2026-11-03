"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recordSessionAudit } from "@/lib/audit";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
import { printToPrinter } from "@/lib/print/network";
import { buildSampleEscPos } from "@/lib/print/templates/build";
import { parseReportTemplateJson } from "@/lib/print/templates/schema";
import {
  deleteReportTemplate,
  persistReportTemplate,
} from "@/lib/print/templates/store";
import {
  isReportDocument,
  type ReportDocument,
} from "@/lib/print/templates/types";
import { printRawToWindowsPrinter } from "@/lib/print/windows-raw";

type ActionResult = { ok: true } | { error: string };
type PrintResult = { ok: true; message: string } | { error: string };

const DOCUMENT_LABELS: Record<ReportDocument, string> = {
  receipt: "إيصال الدفع",
  kitchen: "تذكرة المطبخ",
  shift: "تقرير الوردية",
  items: "تذكرة الأصناف",
  sales: "تقرير المبيعات",
  purchases: "تقرير المشتريات",
};

async function assertAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("غير مصرح");
  }
  return session;
}

function toDocument(value: string): ReportDocument | null {
  return isReportDocument(value) ? value : null;
}

export async function saveReportTemplate(
  document: string,
  json: string,
): Promise<ActionResult> {
  const session = await assertAdmin();
  const doc = toDocument(document);
  if (!doc) return { error: "نوع التقرير غير معروف" };

  const result = persistReportTemplate(doc, json);
  if (!result.ok) return { error: result.errors.join("\n") };

  recordSessionAudit(session, {
    kind: "settings",
    success: true,
    detail: `حفظ تصميم ${DOCUMENT_LABELS[doc]}`,
  });
  revalidatePath("/admin/reports/design");
  return { ok: true };
}

export async function resetReportTemplate(
  document: string,
): Promise<ActionResult> {
  const session = await assertAdmin();
  const doc = toDocument(document);
  if (!doc) return { error: "نوع التقرير غير معروف" };

  deleteReportTemplate(doc);
  recordSessionAudit(session, {
    kind: "settings",
    success: true,
    detail: `استعادة التصميم الافتراضي ل${DOCUMENT_LABELS[doc]}`,
  });
  revalidatePath("/admin/reports/design");
  return { ok: true };
}

export async function testPrintReportTemplate(
  document: string,
  json: string,
  printerId: number,
): Promise<PrintResult> {
  const session = await assertAdmin();
  const doc = toDocument(document);
  if (!doc) return { error: "نوع التقرير غير معروف" };

  const parsed = parseReportTemplateJson(json, doc);
  if (!parsed.ok) return { error: parsed.errors.join("\n") };

  const printer = db
    .select()
    .from(printers)
    .where(eq(printers.id, printerId))
    .get();
  if (!printer || !printer.active) {
    return { error: "الطابعة غير موجودة أو معطّلة" };
  }

  try {
    const data = await buildSampleEscPos(doc, parsed.template);
    if (printer.connectionType === "local") {
      await printRawToWindowsPrinter(printer.host, data);
    } else {
      await printToPrinter({
        host: printer.host,
        port: printer.port,
        data,
      });
    }
    recordSessionAudit(session, {
      venueId: printer.venueId,
      kind: "test",
      printerName: printer.name,
      success: true,
      detail: `معاينة ${DOCUMENT_LABELS[doc]} على ${printer.name}`,
    });
    return {
      ok: true,
      message: `تم إرسال معاينة التصميم إلى ${printer.name}`,
    };
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : `تعذر الاتصال بالطابعة ${printer.name}`;
    recordSessionAudit(session, {
      venueId: printer.venueId,
      kind: "test",
      printerName: printer.name,
      success: false,
      detail,
    });
    return { error: detail };
  }
}
