import iconv from "iconv-lite";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/settings", () => ({
  getSettingValue: () => null,
  setSettingValue: () => {},
  deleteSettingValue: () => {},
  getBrandDetails: () => ({ name: "", phone: "", address: "" }),
  getReceiptFooterMessage: () => "",
}));
import type { CheckoutReceiptData } from "./receipts";
import { DEFAULT_REPORT_TEMPLATES } from "./templates/defaults";

type BuildFn = typeof import("./templates/build").buildReceiptEscPos;

let buildReceiptEscPos: BuildFn;

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  ({ buildReceiptEscPos } = await import("./templates/build"));
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

function receiptText(
  data: CheckoutReceiptData,
  settings: Record<string, string | boolean> = {},
) {
  return buildReceiptEscPos(data, {
    template: DEFAULT_REPORT_TEMPLATES.receipt,
    settings: { logoAvailable: false, ...settings },
    logo: null,
  }).then((bytes) => iconv.decode(Buffer.from(bytes), "win1256"));
}

describe("receipt brand header", () => {
  it("prints the brand name, venue subtitle, phone and address", async () => {
    const text = await receiptText({
      ...base,
      brandName: "Acme Corner",
      brandPhone: "0911234567",
      brandAddress: "Tripoli Main Street",
    }, {
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

  it("keeps the venue name as title when the brand name is empty", async () => {
    const text = await receiptText({
      ...base,
      brandName: "  ",
      brandPhone: "0911234567",
    }, {
      brandName: "  ",
      brandPhone: "0911234567",
    });

    expect(text).toContain("Fast Cafe");
    expect(text).toContain("إيصال الدفع");
    expect(text).toContain("0911234567");
  });
});
