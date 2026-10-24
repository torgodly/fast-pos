import { db, getSqlite } from "@/lib/db";
import {
  adjustForInvoiceEdit as adjustForInvoiceEditCore,
  adjustItemStock as adjustItemStockCore,
  adjustStock as adjustStockCore,
  consumeForPaidOrder as consumeForPaidOrderCore,
  receivePurchaseInvoice as receivePurchaseInvoiceCore,
  reconsumeForRestoredOrder as reconsumeForRestoredOrderCore,
  returnForCancelledPaidOrder as returnForCancelledPaidOrderCore,
  type ConsumptionResult,
  type InventoryUser,
  type InvoiceDelta,
  type PurchaseInvoiceInput,
} from "./core";

export type { ConsumptionResult, InventoryUser, InvoiceDelta, PurchaseInvoiceInput };

function ctx() {
  return { db, sqlite: getSqlite() };
}

export function receivePurchaseInvoice(input: PurchaseInvoiceInput) {
  return receivePurchaseInvoiceCore(ctx(), input);
}

export function consumeForPaidOrder(orderId: number, user: InventoryUser) {
  return consumeForPaidOrderCore(ctx(), orderId, user);
}

export function returnForCancelledPaidOrder(
  orderId: number,
  user: InventoryUser,
) {
  return returnForCancelledPaidOrderCore(ctx(), orderId, user);
}

export function reconsumeForRestoredOrder(
  orderId: number,
  user: InventoryUser,
): ConsumptionResult {
  return reconsumeForRestoredOrderCore(ctx(), orderId, user);
}

export function adjustForInvoiceEdit(
  orderId: number,
  deltas: InvoiceDelta[],
  user: InventoryUser,
) {
  return adjustForInvoiceEditCore(ctx(), orderId, deltas, user);
}

export function adjustStock(input: {
  ingredientId: number;
  delta: number;
  unitId: number;
  note?: string | null;
  user: InventoryUser;
}) {
  return adjustStockCore(ctx(), input);
}

export function adjustItemStock(input: {
  itemId: number;
  delta: number;
  unitId: number;
  note?: string | null;
  user: InventoryUser;
}) {
  return adjustItemStockCore(ctx(), input);
}
