import { describe, expect, it } from "vitest";
import { buildCheckoutReceiptHtml, type CheckoutReceiptData } from "./receipts";

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

describe("buildCheckoutReceiptHtml — customer", () => {
  it("prints the customer name and phone when attached", () => {
    const html = buildCheckoutReceiptHtml({
      ...base,
      customerName: "محمد سالم",
      customerPhone: "0910000000",
    });

    expect(html).toContain("العميل");
    expect(html).toContain("محمد سالم");
    expect(html).toContain("0910000000");
  });

  it("escapes customer values", () => {
    const html = buildCheckoutReceiptHtml({
      ...base,
      customerName: "<script>alert(1)</script>",
      customerPhone: '09"11',
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("09&quot;11");
  });

  it("omits customer rows when no customer is attached", () => {
    const html = buildCheckoutReceiptHtml(base);

    expect(html).not.toContain("العميل");
    expect(html).not.toContain("الهاتف");
  });
});
