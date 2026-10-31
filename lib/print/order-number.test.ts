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

const overrides = {
  template: DEFAULT_REPORT_TEMPLATES.receipt,
  settings: { logoAvailable: false },
  logo: null,
};

describe("order number on the checkout receipt", () => {
  it("prints the order number in the ESC/POS receipt", async () => {
    const text = iconv.decode(
      Buffer.from(
        await buildReceiptEscPos({ ...base, orderNo: 7 }, overrides),
      ),
      "win1256",
    );

    expect(text).toContain("رقم الطلب: 7");
    expect(text).toContain("فاتورة: #12");
    expect(text.indexOf("رقم الطلب")).toBeLessThan(text.indexOf("فاتورة:"));
  });

  it("omits the order number line in the ESC/POS receipt when absent", async () => {
    const text = iconv.decode(
      Buffer.from(await buildReceiptEscPos(base, overrides)),
      "win1256",
    );

    expect(text).not.toContain("رقم الطلب");
  });
});
