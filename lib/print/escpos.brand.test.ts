import iconv from "iconv-lite";
import { beforeAll, describe, expect, it } from "vitest";
import type { CheckoutReceiptData } from "./receipts";

type BuildFn = typeof import("./escpos").buildCheckoutEscPos;

let buildCheckoutEscPos: BuildFn;

beforeAll(async () => {
  // Keep the test in text mode; no raster rendering needed for ASCII values.
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

function receiptText(data: CheckoutReceiptData) {
  return iconv.decode(Buffer.from(buildCheckoutEscPos(data)), "win1256");
}

describe("buildCheckoutEscPos — brand header", () => {
  it("prints the brand name, venue subtitle, phone and address", () => {
    const text = receiptText({
      ...base,
      brandName: "Acme Corner",
      brandPhone: "0911234567",
      brandAddress: "Tripoli Main Street",
    });

    expect(text).toContain("Acme Corner");
    expect(text).toContain("Fast Cafe");
    expect(text).toContain("إيصال الدفع");
    expect(text).toContain("0911234567");
    expect(text).toContain("Tripoli Main Street");
  });

  it("keeps the venue name as title when the brand name is empty", () => {
    const text = receiptText({
      ...base,
      brandName: "  ",
      brandPhone: "0911234567",
    });

    expect(text).toContain("Fast Cafe");
    expect(text).toContain("إيصال الدفع");
    expect(text).toContain("0911234567");
  });
});
