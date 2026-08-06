import type { CheckoutReceiptData, KitchenReceiptData } from "./receipts";
import {
  encodePrinterText,
  hasArabicText,
  normalizePrinterText,
  printerInitBytes,
  printerProfile,
  restorePrinterTextMode,
  useArabicRaster,
} from "./encoding";
import { appendLogo } from "./logo";
import { textToEscPosRaster } from "./text-raster";

const ESC = 0x1b;
const GS = 0x1d;

const LINE_WIDTH = 32;

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function cmd(...bytes: number[]) {
  return new Uint8Array(bytes);
}

function textLine(value = "") {
  return concat(encodePrinterText(value), new Uint8Array([0x0a]));
}

function money(amount: number) {
  return `${amount.toFixed(2)} د.ل`;
}

function init() {
  return printerInitBytes();
}

function align(mode: "left" | "center" | "right") {
  const n = mode === "left" ? 0 : mode === "center" ? 1 : 2;
  return cmd(ESC, 0x61, n);
}

function bold(on: boolean) {
  return cmd(ESC, 0x45, on ? 1 : 0);
}

function doubleSize(on: boolean) {
  return cmd(GS, 0x21, on ? 0x11 : 0x00);
}

function cut() {
  return concat(textLine(), textLine(), cmd(GS, 0x56, 0x00));
}

function separator() {
  return textLine("--------------------------------");
}

function printLine(
  parts: Uint8Array[],
  value: string,
  options: {
    bold?: boolean;
    center?: boolean;
    fontSize?: number;
  } = {},
) {
  const normalized = normalizePrinterText(value);
  if (!normalized) {
    parts.push(textLine(""));
    return;
  }

  const alignMode = options.center ? "center" : "right";

  if (useArabicRaster() && hasArabicText(normalized)) {
    parts.push(align(alignMode));
    parts.push(
      textToEscPosRaster(normalized, {
        bold: options.bold,
        fontSize: options.fontSize,
        align: alignMode,
      }),
    );
    parts.push(restorePrinterTextMode(alignMode));
    return;
  }

  if (options.bold) parts.push(bold(true));
  if (options.fontSize && options.fontSize >= 32) parts.push(doubleSize(true));
  parts.push(textLine(normalized));
  if (options.fontSize && options.fontSize >= 32) parts.push(doubleSize(false));
  if (options.bold) parts.push(bold(false));
}

function fieldLine(parts: Uint8Array[], label: string, value: string) {
  printLine(parts, `${label}: ${value}`);
}

function wrapText(value: string, maxLen = LINE_WIDTH): string[] {
  const trimmed = normalizePrinterText(value);
  if (!trimmed) return [""];
  if (trimmed.length <= maxLen) return [trimmed];

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLen && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [trimmed.slice(0, maxLen)];
}

function printWrappedName(parts: Uint8Array[], name: string, bold = true) {
  for (const row of wrapText(name)) {
    printLine(parts, row, { bold, fontSize: bold ? 30 : 26 });
  }
}

function headerBlock(parts: Uint8Array[], title: string, subtitle?: string) {
  printLine(parts, title, { bold: true, center: true, fontSize: 34 });
  if (subtitle) {
    printLine(parts, subtitle, { center: true, fontSize: 28 });
  }
  parts.push(align("right"));
}

export function buildKitchenEscPos(
  data: KitchenReceiptData,
  logo: Uint8Array | null = null,
): Uint8Array {
  const parts: Uint8Array[] = [init()];
  appendLogo(parts, logo);
  headerBlock(parts, "طلب المطبخ", data.venueName);
  parts.push(separator());
  fieldLine(parts, "فاتورة", `#${data.orderId}`);
  fieldLine(parts, "الطاولة", data.tableName);
  fieldLine(parts, "السفرادجي", data.waiterName);
  fieldLine(parts, "الوقت", data.createdAt);
  parts.push(separator());

  for (const item of data.lines) {
    printWrappedName(parts, item.name, true);
    printLine(parts, `الكمية: ${item.qty}`, { bold: true, fontSize: 30 });
  }

  parts.push(
    separator(),
    align("center"),
  );
  printLine(parts, "أرسل للمطبخ — يرجى التحضير", { center: true });
  parts.push(cut());

  return concat(...parts);
}

export function buildCheckoutEscPos(
  data: CheckoutReceiptData,
  logo: Uint8Array | null = null,
): Uint8Array {
  const method = data.paymentMethod === "cash" ? "نقدي" : "بطاقة";
  const footer = data.footerMessage?.trim() || "شكراً لزيارتكم";
  const parts: Uint8Array[] = [init()];
  appendLogo(parts, logo);
  headerBlock(parts, data.venueName, "إيصال الدفع");
  parts.push(separator());
  fieldLine(parts, "فاتورة", `#${data.orderId}`);
  fieldLine(parts, "الطاولة", data.tableName);

  if (data.waiterName) {
    fieldLine(parts, "السفرادجي", data.waiterName);
  }

  printLine(parts, `الكاشير: ${data.cashierName}`, { bold: true });
  fieldLine(parts, "الدفع", method);
  fieldLine(parts, "الوقت", data.paidAt);
  parts.push(
    separator(),
  );
  printLine(parts, "الأصناف", { bold: true });
  parts.push(separator());

  for (const item of data.lines) {
    printWrappedName(parts, item.name, true);
    printLine(
      parts,
      `${item.qty} x ${money(item.unitPrice)}  =  ${money(item.lineTotal)}`,
    );
  }

  parts.push(separator());
  printLine(parts, `الإجمالي: ${money(data.total)}`, {
    bold: true,
    fontSize: 34,
  });
  parts.push(align("center"));
  printLine(parts, footer, { center: true });
  parts.push(cut());

  return concat(...parts);
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
  parts.push(
    separator(),
    align("center"),
  );
  printLine(parts, "تم الاتصال بالطابعة", { center: true });
  parts.push(cut());

  return concat(...parts);
}
