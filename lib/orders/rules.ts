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

export function quickSalePrinterFailureMessage(options: {
  orderId: number;
  kitchenFailed: boolean;
  receiptFailed: boolean;
  kitchenError?: string;
  receiptError?: string;
}) {
  const parts = [`تم الدفع — فاتورة #${options.orderId} محفوظة`];
  if (options.kitchenFailed) {
    parts.push(
      `فشلت طباعة المطبخ${
        options.kitchenError ? `: ${options.kitchenError}` : ""
      }. يمكنك طباعة المطبخ لاحقاً من مبيعاتي`,
    );
  }
  if (options.receiptFailed) {
    parts.push(
      `فشلت طباعة فاتورة العميل${
        options.receiptError ? `: ${options.receiptError}` : ""
      }. يمكنك إعادة الطباعة لاحقاً من مبيعاتي`,
    );
  }
  if (!options.kitchenFailed && !options.receiptFailed) {
    return `تم الدفع وطباعة الفاتورة — #${options.orderId}`;
  }
  return parts.join(" — ");
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
