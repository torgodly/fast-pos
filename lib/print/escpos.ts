import iconv from "iconv-lite";
import type { CheckoutReceiptData, KitchenReceiptData } from "./receipts";
import { appendLogo } from "./logo";

const ESC = 0x1b;
const GS = 0x1d;
const FS = 0x1c;

/** Windows Arabic — matches most XPrinter firmware in Libya. */
const CODE_PAGE_WPC1256 = 46;

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

function text(value: string) {
  return new Uint8Array(iconv.encode(value, "win1256"));
}

function line(value = "") {
  return text(`${value}\n`);
}

function money(amount: number) {
  return `${amount.toFixed(2)} د.ل`;
}

function init() {
  return concat(
    cmd(ESC, 0x40),
    cmd(ESC, 0x74, CODE_PAGE_WPC1256),
    cmd(FS, 0x26),
    cmd(ESC, 0x61, 0x01),
  );
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
  return concat(line(), line(), cmd(GS, 0x56, 0x00), cmd(FS, 0x2e));
}

function separator() {
  return line("--------------------------------");
}

function row(left: string, right: string) {
  const width = 32;
  const gap = Math.max(1, width - left.length - right.length);
  return line(`${left}${" ".repeat(gap)}${right}`);
}

export function buildKitchenEscPos(
  data: KitchenReceiptData,
  logo: Uint8Array | null = null,
): Uint8Array {
  const parts: Uint8Array[] = [init()];
  appendLogo(parts, logo);
  parts.push(
    doubleSize(true),
    bold(true),
    line("طلب المطبخ"),
    doubleSize(false),
    bold(false),
    line(data.venueName),
    align("left"),
    separator(),
    row("فاتورة", `#${data.orderId}`),
    row("الطاولة", data.tableName),
    row("السفرادجي", data.waiterName),
    row("الوقت", data.createdAt),
    separator(),
  );

  for (const item of data.lines) {
    parts.push(doubleSize(true), bold(true));
    parts.push(row(item.name, `x${item.qty}`));
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
  parts.push(
    doubleSize(true),
    bold(true),
    line(data.venueName),
    doubleSize(false),
    line("إيصال الدفع"),
    bold(false),
    align("left"),
    separator(),
    row("فاتورة", `#${data.orderId}`),
    row("الطاولة", data.tableName),
  );

  if (data.waiterName) {
    parts.push(row("السفرادجي", data.waiterName));
  }

  parts.push(
    bold(true),
    row("الكاشير", data.cashierName),
    bold(false),
    row("الدفع", method),
    row("الوقت", data.paidAt),
    separator(),
  );

  for (const item of data.lines) {
    parts.push(row(item.name, `x${item.qty}`));
    parts.push(row(money(item.unitPrice), money(item.lineTotal)));
  }

  parts.push(
    separator(),
    bold(true),
    doubleSize(true),
    row("الإجمالي", money(data.total)),
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
    .replace(/\u200f/g, "");

  const parts: Uint8Array[] = [init()];
  appendLogo(parts, logo);
  parts.push(
    doubleSize(true),
    bold(true),
    line("اختبار طباعة"),
    doubleSize(false),
    bold(false),
    line("Fast POS"),
    align("left"),
    separator(),
    row("الطابعة", printerName),
    row("الحالة", "تعمل بنجاح"),
    row("الوقت", now),
    separator(),
    align("center"),
    line("Maison Kayser Tripoli"),
    line("تم الاتصال بالطابعة"),
    cut(),
  );

  return concat(...parts);
}
