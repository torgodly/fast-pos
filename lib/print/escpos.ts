import type { CheckoutReceiptData, KitchenReceiptData } from "./receipts";

const ESC = 0x1b;
const GS = 0x1d;

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
  return new TextEncoder().encode(value);
}

function line(value = "") {
  return text(`${value}\n`);
}

function money(amount: number) {
  return `${amount.toFixed(2)} د.ل`;
}

function init() {
  return concat(
    cmd(ESC, 0x40), // initialize
    cmd(ESC, 0x74, 0x00), // code page
    // UTF-8 / multilingual where supported by many XPrinter firmware builds
    cmd(ESC, 0x61, 0x01), // center
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
  return concat(line(), line(), cmd(GS, 0x56, 0x00));
}

function separator() {
  return line("--------------------------------");
}

function row(left: string, right: string) {
  const width = 32;
  const gap = Math.max(1, width - left.length - right.length);
  return line(`${left}${" ".repeat(gap)}${right}`);
}

export function buildKitchenEscPos(data: KitchenReceiptData): Uint8Array {
  const parts: Uint8Array[] = [
    init(),
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
  ];

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

export function buildCheckoutEscPos(data: CheckoutReceiptData): Uint8Array {
  const method = data.paymentMethod === "cash" ? "نقدي" : "بطاقة";
  const parts: Uint8Array[] = [
    init(),
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
  ];

  if (data.waiterName) {
    parts.push(row("السفرادجي", data.waiterName));
  }

  parts.push(
    row("الكاشير", data.cashierName),
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
    line("شكراً لزيارتكم"),
    cut(),
  );

  return concat(...parts);
}

export function buildTestEscPos(printerName: string): Uint8Array {
  return concat(
    init(),
    doubleSize(true),
    bold(true),
    line("اختبار طباعة"),
    doubleSize(false),
    bold(false),
    line(printerName),
    align("left"),
    separator(),
    line("Fast POS — الطابعة تعمل"),
    cut(),
  );
}
