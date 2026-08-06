import type { CheckoutReceiptData, KitchenReceiptData } from "./receipts";
import {
  encodePrinterText,
  normalizePrinterText,
  printerInitBytes,
  restorePrinterTextMode,
} from "./encoding";
import { appendLogo } from "./logo";

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

function line(value = "") {
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
  return concat(line(), line(), cmd(GS, 0x56, 0x00));
}

function separator() {
  return line("--------------------------------");
}

function fieldLine(label: string, value: string) {
  return line(`${label}: ${value}`);
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

function printWrappedName(parts: Uint8Array[], name: string) {
  for (const row of wrapText(name)) {
    parts.push(line(row));
  }
}

function headerBlock(parts: Uint8Array[], title: string, subtitle?: string) {
  parts.push(
    align("center"),
    doubleSize(true),
    bold(true),
    line(title),
    doubleSize(false),
    bold(false),
  );
  if (subtitle) {
    parts.push(line(subtitle));
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
  parts.push(
    separator(),
    fieldLine("فاتورة", `#${data.orderId}`),
    fieldLine("الطاولة", data.tableName),
    fieldLine("السفرادجي", data.waiterName),
    fieldLine("الوقت", data.createdAt),
    separator(),
  );

  for (const item of data.lines) {
    parts.push(doubleSize(true), bold(true));
    printWrappedName(parts, item.name);
    parts.push(line(`الكمية: ${item.qty}`));
    parts.push(doubleSize(false), bold(false));
  }

  parts.push(
    separator(),
    align("center"),
    line("أرسل للمطبخ — يرجى التحضير"),
    cut(),
  );

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
  parts.push(
    separator(),
    fieldLine("فاتورة", `#${data.orderId}`),
    fieldLine("الطاولة", data.tableName),
  );

  if (data.waiterName) {
    parts.push(fieldLine("السفرادجي", data.waiterName));
  }

  parts.push(
    bold(true),
    fieldLine("الكاشير", data.cashierName),
    bold(false),
    fieldLine("الدفع", method),
    fieldLine("الوقت", data.paidAt),
    separator(),
    bold(true),
    line("الأصناف"),
    bold(false),
    separator(),
  );

  for (const item of data.lines) {
    parts.push(bold(true));
    printWrappedName(parts, item.name);
    parts.push(bold(false));
    parts.push(
      line(
        `${item.qty} x ${money(item.unitPrice)}  =  ${money(item.lineTotal)}`,
      ),
    );
  }

  parts.push(
    separator(),
    bold(true),
    doubleSize(true),
    fieldLine("الإجمالي", money(data.total)),
    doubleSize(false),
    bold(false),
    align("center"),
    line(footer),
    cut(),
  );

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
  parts.push(
    separator(),
    fieldLine("الطابعة", printerName),
    fieldLine("الحالة", "تعمل بنجاح"),
    fieldLine("الوقت", now),
    separator(),
    bold(true),
    line("كابتشينو"),
    line("قهوة عربية"),
    bold(false),
    line("2 x 12.00 د.ل  =  24.00 د.ل"),
    separator(),
    align("center"),
    line("Maison Kayser Tripoli"),
    line("تم الاتصال بالطابعة"),
    cut(),
  );

  return concat(...parts);
}
