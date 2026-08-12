/** Business rules for POS order / print / cancel flows (pure, testable). */

export function pendingKitchenQty(qty: number, kitchenSentQty: number) {
  return Math.max(0, qty - Math.max(0, kitchenSentQty));
}

export function orderHasKitchenPending(
  lines: Array<{ qty: number; kitchenSentQty?: number | null }>,
) {
  return lines.some(
    (line) => pendingKitchenQty(line.qty, line.kitchenSentQty ?? 0) > 0,
  );
}

export function canWaiterReduceLineQty(options: {
  qty: number;
  kitchenSentQty: number;
  nextQty: number;
}) {
  return options.nextQty >= options.kitchenSentQty;
}

export function canWaiterCancelTable(options: {
  role: "waiter" | "cashier" | "admin";
  lines: Array<{ kitchenSentQty?: number | null }>;
}) {
  if (options.role === "cashier" || options.role === "admin") return true;
  return options.lines.every((line) => (line.kitchenSentQty ?? 0) === 0);
}

export function canMainCashierCancelKitchenLine(options: {
  isMainCashier: boolean;
  orderStatus: "open" | "paid" | "cancelled";
  kitchenSentQty: number;
}) {
  return (
    options.isMainCashier &&
    options.orderStatus === "open" &&
    options.kitchenSentQty > 0
  );
}

/** Printer failure must never delete a saved sale. */
export function shouldAbortOrderOnPrinterFailure() {
  return false;
}

export type PayNoticeLine = {
  text: string;
  tone?: "error" | "muted";
};

export type PayNotice = {
  title: string;
  lines: PayNoticeLine[];
};

export function quickSalePayNotice(options: {
  orderId: number;
  kitchenFailed: boolean;
  receiptFailed: boolean;
}): PayNotice {
  if (!options.kitchenFailed && !options.receiptFailed) {
    return {
      title: "تم الدفع",
      lines: [{ text: `فاتورة #${options.orderId}` }],
    };
  }

  const lines: PayNoticeLine[] = [
    { text: `فاتورة #${options.orderId} محفوظة` },
  ];
  if (options.kitchenFailed) {
    lines.push({ text: "المطبخ لم يُطبع", tone: "error" });
  }
  if (options.receiptFailed) {
    lines.push({ text: "فاتورة العميل لم تُطبع", tone: "error" });
  }
  lines.push({ text: "أعد الطباعة من مبيعاتي", tone: "muted" });

  return { title: "تم الدفع", lines };
}

export function clampCancelQty(removeQty: number, lineQty: number) {
  const qty = Math.trunc(removeQty);
  if (!Number.isFinite(qty) || qty < 1) return null;
  if (qty > lineQty) return null;
  return qty;
}

export function nextKitchenSentAfterCancel(
  kitchenSentQty: number,
  qtyAfter: number,
) {
  return Math.min(Math.max(0, kitchenSentQty), Math.max(0, qtyAfter));
}
