import iconv from "iconv-lite";
import { beforeAll, describe, expect, it } from "vitest";
import { nowSqlTripoli } from "@/lib/time/tripoli";
import { formatDateTime } from "@/lib/venues";
import type { CheckoutReceiptData } from "./receipts";

type BuildFn = typeof import("./escpos").buildCheckoutEscPos;

let buildCheckoutEscPos: BuildFn;

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  ({ buildCheckoutEscPos } = await import("./escpos"));
});

const base: CheckoutReceiptData = {
  venueName: "فاست بوس",
  orderId: 12,
  tableName: "بيع سريع",
  waiterName: null,
  cashierName: "كاشير",
  paymentMethod: "cash",
  paidAt: "2026-10-24 10:00:00",
  total: 10,
  lines: [{ name: "شاي", qty: 1, unitPrice: 10, lineTotal: 10 }],
};

function receiptText(data: CheckoutReceiptData) {
  return iconv.decode(Buffer.from(buildCheckoutEscPos(data)), "win1256");
}

describe("checkout receipt text", () => {
  it("prints the Libya wall clock, not UTC", () => {
    const paidAt = formatDateTime(
      nowSqlTripoli(new Date("2026-10-25T12:13:22Z")),
    );
    const text = receiptText({ ...base, paidAt });

    expect(text).toContain("2:13");
    expect(text).not.toContain("12:13");
  });

  it("prints the customer name and phone when attached", () => {
    const text = receiptText({
      ...base,
      customerName: "محمد سالم",
      customerPhone: "0910000000",
    });

    expect(text).toContain("العميل: محمد سالم");
    expect(text).toContain("الهاتف: 0910000000");
  });

  it("omits customer rows when no customer is attached", () => {
    const text = receiptText(base);

    expect(text).not.toContain("العميل:");
    expect(text).not.toContain("الهاتف:");
  });

  it("prints the configured payment method label", () => {
    const text = receiptText({
      ...base,
      paymentMethod: "custom",
      paymentMethodLabel: "آجل",
    });

    expect(text).toContain("الدفع: آجل");
  });
});
