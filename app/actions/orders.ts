"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  items,
  orderItems,
  orders,
  tables,
  users,
} from "@/lib/db/schema";
import type { PaymentMethod, VenueId } from "@/lib/types";
import {
  formatDateTime,
  getVenueName,
  isVenueId,
} from "@/lib/venues";
import type {
  CheckoutReceiptData,
  KitchenReceiptData,
} from "@/lib/print/receipts";

function recalcOrderTotal(orderId: number) {
  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  db.update(orders)
    .set({ total })
    .where(eq(orders.id, orderId))
    .run();
  return total;
}

export async function openTableOrder(venueId: string, tableId: number) {
  const session = await getSession();
  if (!session || session.role !== "waiter" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }

  const table = db
    .select()
    .from(tables)
    .where(
      and(
        eq(tables.id, tableId),
        eq(tables.venueId, venueId),
        eq(tables.active, true),
      ),
    )
    .get();

  if (!table) return { error: "الطاولة غير موجودة" };

  const existing = db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.tableId, tableId),
        eq(orders.status, "open"),
        eq(orders.venueId, venueId),
      ),
    )
    .get();

  if (existing) {
    redirect(`/waiter/${venueId}/order/${existing.id}`);
  }

  const order = db
    .insert(orders)
    .values({
      venueId,
      tableId,
      waiterId: session.userId,
      status: "open",
      total: 0,
    })
    .returning()
    .get();

  revalidatePath(`/waiter/${venueId}`);
  redirect(`/waiter/${venueId}/order/${order.id}`);
}

export async function addItemToOrder(orderId: number, itemId: number) {
  const session = await getSession();
  if (!session || (session.role !== "waiter" && session.role !== "cashier")) {
    return { error: "غير مصرح" };
  }

  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || order.status !== "open") {
    return { error: "الفاتورة غير مفتوحة" };
  }

  const item = db
    .select()
    .from(items)
    .where(
      and(
        eq(items.id, itemId),
        eq(items.venueId, order.venueId),
        eq(items.active, true),
      ),
    )
    .get();

  if (!item) return { error: "الصنف غير موجود" };

  const existingLine = db
    .select()
    .from(orderItems)
    .where(
      and(eq(orderItems.orderId, orderId), eq(orderItems.itemId, itemId)),
    )
    .get();

  if (existingLine) {
    const qty = existingLine.qty + 1;
    db.update(orderItems)
      .set({
        qty,
        lineTotal: qty * existingLine.unitPrice,
      })
      .where(eq(orderItems.id, existingLine.id))
      .run();
  } else {
    db.insert(orderItems)
      .values({
        orderId,
        itemId: item.id,
        itemName: item.name,
        unitPrice: item.price,
        qty: 1,
        lineTotal: item.price,
      })
      .run();
  }

  recalcOrderTotal(orderId);
  revalidateOrderPaths(order.venueId as VenueId, orderId, session.role);
  return { ok: true };
}

export async function updateOrderItemQty(
  orderItemId: number,
  qty: number,
) {
  const session = await getSession();
  if (!session || (session.role !== "waiter" && session.role !== "cashier")) {
    return { error: "غير مصرح" };
  }

  const line = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.id, orderItemId))
    .get();
  if (!line) return { error: "البند غير موجود" };

  const order = db.select().from(orders).where(eq(orders.id, line.orderId)).get();
  if (!order || order.status !== "open") {
    return { error: "غير مصرح" };
  }

  if (qty <= 0) {
    db.delete(orderItems).where(eq(orderItems.id, orderItemId)).run();
  } else {
    db.update(orderItems)
      .set({ qty, lineTotal: qty * line.unitPrice })
      .where(eq(orderItems.id, orderItemId))
      .run();
  }

  recalcOrderTotal(order.id);
  revalidateOrderPaths(order.venueId as VenueId, order.id, session.role);
  return { ok: true };
}

export async function removeOrderItem(orderItemId: number) {
  return updateOrderItemQty(orderItemId, 0);
}

export async function confirmKitchenOrder(orderId: number): Promise<
  | { error: string }
  | { ok: true; receipt: KitchenReceiptData; alreadySent?: boolean }
> {
  const session = await getSession();
  if (!session || session.role !== "waiter") {
    return { error: "غير مصرح" };
  }

  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || order.status !== "open") {
    return { error: "الفاتورة غير مفتوحة" };
  }
  if (!isVenueId(order.venueId)) {
    return { error: "فرع غير صالح" };
  }

  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();

  const pendingLines = lines
    .map((line) => ({
      name: line.itemName,
      qty: line.qty - (line.kitchenSentQty ?? 0),
    }))
    .filter((line) => line.qty > 0);

  if (lines.length === 0) {
    return { error: "أضف أصنافاً قبل الإرسال للمطبخ" };
  }

  if (pendingLines.length === 0) {
    return { error: "لا توجد أصناف جديدة لإرسالها للمطبخ" };
  }

  for (const line of lines) {
    if (line.qty > (line.kitchenSentQty ?? 0)) {
      db.update(orderItems)
        .set({ kitchenSentQty: line.qty })
        .where(eq(orderItems.id, line.id))
        .run();
    }
  }

  const table = order.tableId
    ? db.select().from(tables).where(eq(tables.id, order.tableId)).get()
    : null;

  revalidateOrderPaths(order.venueId, orderId, "waiter");

  return {
    ok: true,
    receipt: {
      venueName: getVenueName(order.venueId),
      orderId: order.id,
      tableName: table?.name ?? "بدون طاولة",
      waiterName: session.name,
      createdAt: formatDateTime(
        new Date().toISOString().slice(0, 19).replace("T", " "),
      ),
      lines: pendingLines,
    },
  };
}

export async function payOrder(
  orderId: number,
  paymentMethod: PaymentMethod,
): Promise<
  | { error: string }
  | { ok: true; nextUrl: string; receipt: CheckoutReceiptData }
> {
  const session = await getSession();
  if (!session || session.role !== "cashier") {
    return { error: "فقط الكاشير يمكنه الدفع" };
  }

  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || order.status !== "open") {
    return { error: "الفاتورة غير مفتوحة" };
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

  const total = recalcOrderTotal(orderId);
  const isQuickSale = order.tableId === null;
  const paidAt = new Date().toISOString().slice(0, 19).replace("T", " ");

  db.update(orders)
    .set({
      status: "paid",
      paymentMethod,
      cashierId: session.userId,
      total,
      paidAt,
    })
    .where(eq(orders.id, orderId))
    .run();

  const table = order.tableId
    ? db.select().from(tables).where(eq(tables.id, order.tableId)).get()
    : null;
  const waiter = order.waiterId
    ? db.select().from(users).where(eq(users.id, order.waiterId)).get()
    : null;

  revalidatePath(`/cashier/${order.venueId}`);
  revalidatePath(`/waiter/${order.venueId}`);
  revalidatePath(`/cashier/${order.venueId}/order/${orderId}`);

  return {
    ok: true,
    nextUrl: `/cashier/${order.venueId}`,
    receipt: {
      venueName: getVenueName(order.venueId),
      orderId: order.id,
      tableName: table?.name ?? (isQuickSale ? "بيع سريع" : "بدون طاولة"),
      waiterName: waiter?.name ?? null,
      cashierName: session.name,
      paymentMethod,
      paidAt: formatDateTime(paidAt),
      total,
      lines: lines.map((line) => ({
        name: line.itemName,
        qty: line.qty,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
    },
  };
}

export type QuickSaleLine = {
  itemId: number;
  name: string;
  unitPrice: number;
  qty: number;
};

/**
 * Quick sales live only in the cashier's browser until payment, so the open
 * invoices list never fills up with empty draft orders.
 */
export async function payQuickSale(
  venueId: string,
  cart: QuickSaleLine[],
  paymentMethod: PaymentMethod,
): Promise<{ error: string } | { ok: true; receipt: CheckoutReceiptData }> {
  const session = await getSession();
  if (!session || session.role !== "cashier" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }
  if (cart.length === 0) {
    return { error: "الفاتورة فارغة" };
  }

  const priced = cart.map((line) => {
    const qty = Math.max(1, Math.trunc(line.qty));
    const item = db
      .select()
      .from(items)
      .where(
        and(
          eq(items.id, line.itemId),
          eq(items.venueId, venueId),
          eq(items.active, true),
        ),
      )
      .get();
    return item ? { item, qty } : null;
  });

  if (priced.some((line) => line === null)) {
    return { error: "أحد الأصناف غير متاح" };
  }

  const validLines = priced as { item: typeof items.$inferSelect; qty: number }[];
  const total = validLines.reduce(
    (sum, line) => sum + line.item.price * line.qty,
    0,
  );
  const paidAt = new Date().toISOString().slice(0, 19).replace("T", " ");

  const order = db
    .insert(orders)
    .values({
      venueId,
      tableId: null,
      waiterId: null,
      cashierId: session.userId,
      status: "paid",
      paymentMethod,
      total,
      paidAt,
    })
    .returning()
    .get();

  for (const line of validLines) {
    db.insert(orderItems)
      .values({
        orderId: order.id,
        itemId: line.item.id,
        itemName: line.item.name,
        unitPrice: line.item.price,
        qty: line.qty,
        lineTotal: line.item.price * line.qty,
        kitchenSentQty: line.qty,
      })
      .run();
  }

  revalidatePath(`/cashier/${venueId}`);
  revalidatePath(`/cashier/${venueId}/quick`);

  return {
    ok: true,
    receipt: {
      venueName: getVenueName(venueId),
      orderId: order.id,
      tableName: "بيع سريع",
      waiterName: null,
      cashierName: session.name,
      paymentMethod,
      paidAt: formatDateTime(paidAt),
      total,
      lines: validLines.map((line) => ({
        name: line.item.name,
        qty: line.qty,
        unitPrice: line.item.price,
        lineTotal: line.item.price * line.qty,
      })),
    },
  };
}

export async function cancelOpenOrder(orderId: number) {
  const session = await getSession();
  if (!session || (session.role !== "waiter" && session.role !== "cashier")) {
    return { error: "غير مصرح" };
  }

  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || order.status !== "open") {
    return { error: "غير مصرح" };
  }

  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();

  // Only allow cancel if empty, or cashier can cancel
  if (lines.length > 0 && session.role !== "cashier") {
    return { error: "لا يمكن إلغاء فاتورة تحتوي أصنافاً" };
  }

  db.update(orders)
    .set({ status: "cancelled" })
    .where(eq(orders.id, orderId))
    .run();

  const base =
    session.role === "cashier"
      ? `/cashier/${order.venueId}`
      : `/waiter/${order.venueId}`;
  revalidatePath(base);
  redirect(base);
}

function revalidateOrderPaths(
  venueId: VenueId,
  orderId: number,
  role: string,
) {
  if (role === "waiter") {
    revalidatePath(`/waiter/${venueId}`);
    revalidatePath(`/waiter/${venueId}/order/${orderId}`);
  } else {
    revalidatePath(`/cashier/${venueId}`);
    revalidatePath(`/cashier/${venueId}/order/${orderId}`);
    revalidatePath(`/cashier/${venueId}/quick`);
  }
}
