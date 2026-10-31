import { printerProfile } from "./encoding";
import { appendLogo } from "./logo";
import {
  align,
  concat,
  cut,
  init,
  printLine,
  separator,
} from "./primitives";

function fieldLine(parts: Uint8Array[], label: string, value: string) {
  printLine(parts, `${label}: ${value}`);
}

function headerBlock(
  parts: Uint8Array[],
  title: string,
  subtitle?: string,
  contacts: string[] = [],
) {
  printLine(parts, title, { bold: true, align: "center", fontSize: 34 });
  if (subtitle) {
    printLine(parts, subtitle, { align: "center", fontSize: 28 });
  }
  for (const contact of contacts) {
    printLine(parts, contact, { align: "center", fontSize: 26 });
  }
  parts.push(align("right"));
}

/** Max items per kitchen ticket — avoids printer buffer overflow. */
export const KITCHEN_ITEMS_PER_TICKET = 18;

export function chunkKitchenLines<T>(
  lines: T[],
  size = KITCHEN_ITEMS_PER_TICKET,
): T[][] {
  if (lines.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < lines.length; i += size) {
    chunks.push(lines.slice(i, i + size));
  }
  return chunks;
}

export function buildTestEscPos(
  printerName: string,
  logo: Uint8Array | null = null,
): Uint8Array {
  const now = new Date()
    .toLocaleString("ar-LY", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(/[\u200e\u200f\u061c]/g, "");

  const parts: Uint8Array[] = [init()];
  appendLogo(parts, logo);
  headerBlock(parts, "اختبار طباعة", "Fast POS");
  parts.push(separator());
  fieldLine(parts, "الطابعة", printerName);
  fieldLine(parts, "الحالة", "تعمل بنجاح");
  fieldLine(parts, "الوقت", now);
  fieldLine(parts, "النوع", printerProfile.label);
  fieldLine(parts, "Code page", String(printerProfile.codePage));
  parts.push(separator());
  printLine(parts, "كابتشينو", { bold: true });
  printLine(parts, "قهوة عربية", { bold: true });
  printLine(parts, "2 x 12.00 د.ل  =  24.00 د.ل");
  parts.push(separator(), align("center"));
  printLine(parts, "تم الاتصال بالطابعة", { align: "center" });
  parts.push(cut());

  return concat(...parts);
}
