import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, orderItems, orders, tables, users } from "@/lib/db/schema";
import { paymentMethodLabel } from "@/lib/payments/core";
import { getPaymentMethod } from "@/lib/payments/store";
import type {
  CheckoutReceiptData,
  KitchenReceiptData,
} from "@/lib/print/receipts";
import type { VenueId } from "@/lib/types";
import { formatDateTime, getVenueName, isVenueId } from "@/lib/venues";

function receiptPaymentMethodLabel(code: string) {
  const method = getPaymentMethod(code);
  return paymentMethodLabel(code, method ? [method] : []);
}

export function receiptCustomer(customerId: number | null | undefined) {
  if (!customerId) return null;
  return (
    db
      .select({ name: customers.name, phone: customers.phone })
      .from(customers)
      .where(eq(customers.id, customerId))
      .get() ?? null
  );
}

export async function loadCheckoutReceiptForOrder(
  orderId: number,
): Promise<{ error: string } | { receipt: CheckoutReceiptData; venueId: VenueId }> {
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || order.status !== "paid") {
    return { error: "الفاتورة غير مدفوعة أو غير موجودة" };
  }
  if (!isVenueId(order.venueId)) {
    return { error: "فرع غير صالح" };
  }
  if (!order.paymentMethod) {
    return { error: "بيانات الدفع غير مكتملة" };
  }

  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();
  if (lines.length === 0) {
    return { error: "الفاتورة فارغة" };
  }

  const table = order.tableId
    ? db.select().from(tables).where(eq(tables.id, order.tableId)).get()
    : null;
  const waiter = order.waiterId
    ? db.select().from(users).where(eq(users.id, order.waiterId)).get()
    : null;
  const cashier = order.cashierId
    ? db.select().from(users).where(eq(users.id, order.cashierId)).get()
    : null;
  const customer = receiptCustomer(order.customerId);
  const isQuickSale = order.tableId === null;

  return {
    venueId: order.venueId,
    receipt: {
      venueName: getVenueName(order.venueId),
      orderId: order.id,
      orderNo: order.orderNo,
      tableName: table?.name ?? (isQuickSale ? "بيع سريع" : "بدون طاولة"),
      waiterName: waiter?.name ?? null,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      cashierName: cashier?.name ?? "كاشير",
      paymentMethod: order.paymentMethod,
      paymentMethodLabel: receiptPaymentMethodLabel(order.paymentMethod),
      paidAt: formatDateTime(order.paidAt ?? order.createdAt),
      total: order.total,
      lines: lines.map((line) => ({
        name: line.itemName,
        qty: line.qty,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
    },
  };
}

/** A printable copy of the kitchen ticket for a saved order (all lines). */
export function loadKitchenReceiptForOrder(
  orderId: number,
): { error: string } | { kitchen: KitchenReceiptData; venueId: VenueId } {
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) {
    return { error: "الفاتورة غير موجودة" };
  }
  if (!isVenueId(order.venueId)) {
    return { error: "فرع غير صالح" };
  }

  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();
  if (lines.length === 0) {
    return { error: "الفاتورة فارغة" };
  }

  const table = order.tableId
    ? db.select().from(tables).where(eq(tables.id, order.tableId)).get()
    : null;
  const waiter = order.waiterId
    ? db.select().from(users).where(eq(users.id, order.waiterId)).get()
    : null;
  const cashier = order.cashierId
    ? db.select().from(users).where(eq(users.id, order.cashierId)).get()
    : null;
  const createdAt = new Date(order.paidAt ?? order.createdAt)
    .toLocaleTimeString("ar-LY", { hour: "2-digit", minute: "2-digit" })
    .replace(/[\u200e\u200f\u061c]/g, "");

  return {
    venueId: order.venueId,
    kitchen: {
      venueName: getVenueName(order.venueId),
      orderId: order.id,
      orderNo: order.orderNo,
      tableName: table?.name ?? (order.tableId === null ? "بيع سريع" : "بدون طاولة"),
      waiterName: waiter?.name ?? cashier?.name ?? "كاشير",
      createdAt,
      kind: "order",
      lines: lines.map((line) => ({
        name: line.itemName,
        qty: line.qty,
        note: line.note?.trim() || null,
      })),
    },
  };
}
