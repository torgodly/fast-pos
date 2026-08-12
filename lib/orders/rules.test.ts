import { describe, expect, it } from "vitest";
import {
  canMainCashierCancelKitchenLine,
  canWaiterCancelTable,
  canWaiterReduceLineQty,
  clampCancelQty,
  nextKitchenSentAfterCancel,
  orderHasKitchenPending,
  pendingKitchenQty,
  quickSalePayNotice,
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

  it("keeps the sale and names only what failed", () => {
    const notice = quickSalePayNotice({
      orderId: 42,
      kitchenFailed: true,
      receiptFailed: false,
    });
    expect(notice.title).toBe("تم الدفع");
    expect(notice.lines.map((line) => line.text)).toEqual([
      "فاتورة #42 محفوظة",
      "المطبخ لم يُطبع",
      "أعد الطباعة من مبيعاتي",
    ]);
  });

  it("lists kitchen and customer print failures without error dumps", () => {
    const notice = quickSalePayNotice({
      orderId: 7,
      kitchenFailed: true,
      receiptFailed: true,
    });
    expect(notice.lines.map((line) => line.text)).toEqual([
      "فاتورة #7 محفوظة",
      "المطبخ لم يُطبع",
      "فاتورة العميل لم تُطبع",
      "أعد الطباعة من مبيعاتي",
    ]);
  });

  it("success path when nothing failed", () => {
    const notice = quickSalePayNotice({
      orderId: 1,
      kitchenFailed: false,
      receiptFailed: false,
    });
    expect(notice.title).toBe("تم الدفع");
    expect(notice.lines.map((line) => line.text)).toEqual(["فاتورة #1"]);
  });
});
