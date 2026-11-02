import type { DocumentData } from "./types";

export function receiptQrPayload(data: DocumentData): string | null {
  const invoice = data.fields.invoiceId?.trim() ?? "";
  const total = data.summary?.trim() ?? "";
  const time = data.fields.time?.trim() ?? "";
  if (!invoice || invoice === "—" || !total || !time) return null;
  return `INV-${invoice.replace(/^#/, "")}|${total}|${time}`;
}
