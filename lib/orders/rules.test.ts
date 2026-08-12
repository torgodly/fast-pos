import { describe, expect, it } from "vitest";
import {
  canMainCashierCancelKitchenLine,
  canWaiterCancelTable,
  canWaiterReduceLineQty,
  clampCancelQty,
  nextKitchenSentAfterCancel,
  orderHasKitchenPending,
  pendingKitchenQty,
  quickSalePrinterFailureMessage,
  shouldAbortOrderOnPrinterFailure,
} from "./rules";

describe("kitchen pending qty", () => {
  it("computes only unsent units", () => {
    expect(pendingKitchenQty(5, 2)).toBe(3);
    expect(pendingKitchenQty(3, 3)).toBe(0);
    expect(pendingKitchenQty(2, 5)).toBe(0);
  });

  it("detects any pending kitchen line on an order", () => {
    expect(
      orderHasKitchenPending([
        { qty: 2, kitchenSentQty: 2 },
        { qty: 1, kitchenSentQty: 0 },
      ]),
    ).toBe(true);
    expect(
      orderHasKitchenPending([{ qty: 2, kitchenSentQty: 2 }]),
    ).toBe(false);
  });
});

describe("waiter quantity / cancel rules", () => {
  it("blocks reducing below kitchen-sent qty", () => {
    expect(
      canWaiterReduceLineQty({ qty: 3, kitchenSentQty: 2, nextQty: 1 }),
    ).toBe(false);
    expect(
      canWaiterReduceLineQty({ qty: 3, kitchenSentQty: 2, nextQty: 2 }),
    ).toBe(true);
  });

  it("allows waiter to cancel table only before kitchen print", () => {
    expect(
      canWaiterCancelTable({
        role: "waiter",
        lines: [
          { kitchenSentQty: 0 },
          { kitchenSentQty: 0 },
        ],
      }),
    ).toBe(true);
    expect(
      canWaiterCancelTable({
        role: "waiter",
        lines: [{ kitchenSentQty: 1 }],
      }),
    ).toBe(false);
    expect(
      canWaiterCancelTable({
        role: "cashier",
        lines: [{ kitchenSentQty: 4 }],
      }),
    ).toBe(true);
  });
});

describe("main cashier kitchen cancel", () => {
  it("only on open orders after kitchen send", () => {
    expect(
      canMainCashierCancelKitchenLine({
        isMainCashier: true,
        orderStatus: "open",
        kitchenSentQty: 2,
      }),
    ).toBe(true);
    expect(
      canMainCashierCancelKitchenLine({
        isMainCashier: true,
        orderStatus: "paid",
        kitchenSentQty: 2,
      }),
    ).toBe(false);
    expect(
      canMainCashierCancelKitchenLine({
        isMainCashier: false,
        orderStatus: "open",
        kitchenSentQty: 2,
      }),
    ).toBe(false);
  });

  it("clamps cancel qty and kitchen-sent after cancel", () => {
    expect(clampCancelQty(2, 5)).toBe(2);
    expect(clampCancelQty(0, 5)).toBeNull();
    expect(clampCancelQty(9, 5)).toBeNull();
    expect(nextKitchenSentAfterCancel(3, 1)).toBe(1);
    expect(nextKitchenSentAfterCancel(3, 0)).toBe(0);
  });
});

describe("printer failure policy", () => {
  it("never aborts a saved order because a printer failed", () => {
    expect(shouldAbortOrderOnPrinterFailure()).toBe(false);
  });

  it("builds a clear keep-order message for quick sale", () => {
    const message = quickSalePrinterFailureMessage({
      orderId: 42,
      kitchenFailed: true,
      receiptFailed: false,
      kitchenError: "تعذر الاتصال",
    });
    expect(message).toContain("فاتورة #42 محفوظة");
    expect(message).toContain("فشلت طباعة المطبخ");
    expect(message).toContain("لاحقاً من مبيعاتي");
  });

  it("mentions both kitchen and receipt failures", () => {
    const message = quickSalePrinterFailureMessage({
      orderId: 7,
      kitchenFailed: true,
      receiptFailed: true,
      kitchenError: "مطبخ",
      receiptError: "شبكة",
    });
    expect(message).toContain("المطبخ");
    expect(message).toContain("العميل");
    expect(message).toContain("#7");
  });

  it("success path when nothing failed", () => {
    expect(
      quickSalePrinterFailureMessage({
        orderId: 1,
        kitchenFailed: false,
        receiptFailed: false,
      }),
    ).toContain("تم الدفع وطباعة الفاتورة");
  });
});
