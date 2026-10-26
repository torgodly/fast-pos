import iconv from "iconv-lite";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCheckoutReceiptHtml } from "./receipts";
import type { CheckoutReceiptData } from "./receipts";

type BuildFn = typeof import("./escpos").buildCheckoutEscPos;

let buildCheckoutEscPos: BuildFn;

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  ({ buildCheckoutEscPos } = await import("./escpos"));
});

const base: CheckoutReceiptData = {
  venueName: "Fast Cafe",
  orderId: 12,
  tableName: "Quick sale",
  waiterName: null,
  cashierName: "Cashier",
  paymentMethod: "cash",
  paidAt: "2026-10-24 10:00:00",
  total: 10,
  lines: [{ name: "Tea", qty: 1, unitPrice: 10, lineTotal: 10 }],
};

describe("order number on the checkout receipt", () => {
  it("prints the order number above the invoice number in HTML", () => {
    const html = buildCheckoutReceiptHtml({ ...base, orderNo: 7 });

    expect(html).toContain("رقم الطلب");
    expect(html).toContain("رقم الفاتورة");
    expect(html.indexOf("رقم الطلب")).toBeLessThan(
      html.indexOf("رقم الفاتورة"),
    );
    expect(html).toContain(">7<");
  });

  it("omits the order number row when there is none", () => {
    const html = buildCheckoutReceiptHtml(base);

    expect(html).not.toContain("رقم الطلب");
    expect(html).toContain("رقم الفاتورة");
  });

  it("prints the order number in the ESC/POS receipt", () => {
    const text = iconv.decode(
      Buffer.from(buildCheckoutEscPos({ ...base, orderNo: 7 })),
      "win1256",
    );

    expect(text).toContain("رقم الطلب: 7");
    expect(text).toContain("فاتورة: #12");
    expect(text.indexOf("رقم الطلب")).toBeLessThan(text.indexOf("فاتورة:"));
  });

  it("omits the order number line in the ESC/POS receipt when absent", () => {
    const text = iconv.decode(
      Buffer.from(buildCheckoutEscPos(base)),
      "win1256",
    );

    expect(text).not.toContain("رقم الطلب");
  });
});
