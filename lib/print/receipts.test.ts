import { describe, expect, it } from "vitest";
import { nowSqlTripoli } from "@/lib/time/tripoli";
import { formatDateTime } from "@/lib/venues";
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

describe("buildCheckoutReceiptHtml — paid time", () => {
  it("prints the Libya wall clock, not UTC", () => {
    const paidAt = formatDateTime(
      nowSqlTripoli(new Date("2026-10-25T12:13:22Z")),
    );
    const html = buildCheckoutReceiptHtml({ ...base, paidAt });

    expect(html).toContain("2:13");
    expect(html).not.toContain("12:13");
  });
});

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

  it("prints brand details above the venue subtitle", () => {
    const html = buildCheckoutReceiptHtml({
      ...base,
      brandName: "مطعم الأصيل",
      brandPhone: "0911234567",
      brandAddress: "طرابلس — شارع الجمهورية",
    });

    expect(html).toContain("مطعم الأصيل");
    expect(html).toContain("فاست بوس · إيصال الدفع");
    expect(html).toContain("0911234567");
    expect(html).toContain("طرابلس — شارع الجمهورية");
  });

  it("falls back to the venue name when the brand name is empty", () => {
    const html = buildCheckoutReceiptHtml({
      ...base,
      brandName: "   ",
      brandPhone: "0911234567",
    });

    expect(html).toContain(">فاست بوس</p>");
    expect(html).toContain("إيصال الدفع");
    expect(html).not.toContain("فاست بوس · إيصال الدفع");
    expect(html).toContain("0911234567");
  });

  it("escapes brand values", () => {
    const html = buildCheckoutReceiptHtml({
      ...base,
      brandName: "<b>علامتي</b>",
      brandAddress: 'شارع "الجمهورية"',
    });

    expect(html).not.toContain("<b>علامتي</b>");
    expect(html).toContain("&lt;b&gt;علامتي&lt;/b&gt;");
    expect(html).toContain("شارع &quot;الجمهورية&quot;");
  });
});
