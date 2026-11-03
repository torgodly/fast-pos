import type { ReportDocument } from "@/lib/print/templates/types";
import type { ReportFiltersInput } from "@/lib/reports/filters";
import type { PurchaseFiltersInput } from "@/lib/reports/purchases";

export type PdfRequest = {
  document: ReportDocument;
  source?: "design";
  orderId?: number;
  shiftId?: number;
  filters?: ReportFiltersInput | PurchaseFiltersInput;
  template?: string;
};

export type PdfDownloadResult = { ok: true; filename: string } | { error: string };

const FALLBACK_FILENAME = "document.pdf";

export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] ?? null;
}

export async function downloadPdf(request: PdfRequest): Promise<PdfDownloadResult> {
  let response: Response;
  try {
    response = await fetch("/api/reports/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    return { error: "تعذر الاتصال بالخادم" };
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: unknown }
      | null;
    return {
      error:
        typeof payload?.error === "string" ? payload.error : "تعذر إنشاء ملف PDF",
    };
  }

  const blob = await response.blob();
  const filename =
    filenameFromDisposition(response.headers.get("Content-Disposition")) ??
    FALLBACK_FILENAME;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { ok: true, filename };
}
