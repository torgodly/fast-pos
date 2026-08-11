"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { recordSessionAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { items, orderItems, orders } from "@/lib/db/schema";
import { availableAtVenue } from "@/lib/menu/scope";
import type { VenueId } from "@/lib/types";
import { isVenueId } from "@/lib/venues";

type ActionResult = { ok: true } | { error: string };

async function assertAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("غير مصرح");
  }
  return session;
}

function recalcOrderTotal(orderId: number) {
  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  db.update(orders).set({ total }).where(eq(orders.id, orderId)).run();
  return total;
}

function revalidateInvoice(venueId: string, orderId: number) {
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${orderId}`);
  revalidatePath("/admin/reports");
  revalidatePath("/admin/audit");
  revalidatePath(`/cashier/${venueId}`);
  revalidatePath(`/cashier/${venueId}/sales`);
  revalidatePath(`/waiter/${venueId}`);
}

export async function adminAddInvoiceItem(
  orderId: number,
  itemId: number,
): Promise<ActionResult> {
  const session = await assertAdmin();
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) return { error: "الفاتورة غير موجودة" };
  if (order.status === "cancelled") {
    return { error: "استعد الفاتورة أولاً قبل التعديل" };
  }
  if (!isVenueId(order.venueId)) return { error: "فرع غير صالح" };

  const item = db
    .select()
    .from(items)
    .where(
      and(
        eq(items.id, itemId),
        availableAtVenue(items.venueId, order.venueId),
      ),
    )
    .get();
  if (!item) return { error: "الصنف غير موجود" };

  const existing = db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.itemId, itemId)))
    .get();

  if (existing) {
    const qty = existing.qty + 1;
    db.update(orderItems)
      .set({ qty, lineTotal: qty * existing.unitPrice })
      .where(eq(orderItems.id, existing.id))
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

  const total = recalcOrderTotal(orderId);
  recordSessionAudit(session, {
    venueId: order.venueId,
    kind: "invoice_edit",
    orderId,
    success: true,
    detail: `إضافة ${item.name} — المجموع ${total.toFixed(2)}`,
  });
  revalidateInvoice(order.venueId, orderId);
  return { ok: true };
}

export async function adminSetInvoiceItemQty(
  orderItemId: number,
  qty: number,
): Promise<ActionResult> {
  const session = await assertAdmin();
  const line = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.id, orderItemId))
    .get();
  if (!line) return { error: "البند غير موجود" };

  const order = db.select().from(orders).where(eq(orders.id, line.orderId)).get();
  if (!order) return { error: "الفاتورة غير موجودة" };
  if (order.status === "cancelled") {
    return { error: "استعد الفاتورة أولاً قبل التعديل" };
  }

  const nextQty = Math.trunc(qty);
  if (nextQty <= 0) {
    db.delete(orderItems).where(eq(orderItems.id, orderItemId)).run();
  } else {
    db.update(orderItems)
      .set({ qty: nextQty, lineTotal: nextQty * line.unitPrice })
      .where(eq(orderItems.id, orderItemId))
      .run();
  }

  const total = recalcOrderTotal(order.id);
  recordSessionAudit(session, {
    venueId: order.venueId as VenueId,
    kind: "invoice_edit",
    orderId: order.id,
    success: true,
    detail:
      nextQty <= 0
        ? `حذف ${line.itemName} (كان ${line.qty}) — المجموع ${total.toFixed(2)}`
        : `${line.itemName}: ${line.qty} ← ${nextQty} — المجموع ${total.toFixed(2)}`,
  });
  revalidateInvoice(order.venueId, order.id);
  return { ok: true };
}

export async function adminRemoveInvoiceItem(
  orderItemId: number,
): Promise<ActionResult> {
  return adminSetInvoiceItemQty(orderItemId, 0);
}

export async function adminCancelInvoice(orderId: number): Promise<ActionResult> {
  const session = await assertAdmin();
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) return { error: "الفاتورة غير موجودة" };
  if (order.status === "cancelled") return { error: "الفاتورة ملغاة مسبقاً" };

  db.update(orders)
    .set({ status: "cancelled" })
    .where(eq(orders.id, orderId))
    .run();

  recordSessionAudit(session, {
    venueId: order.venueId,
    kind: "invoice_edit",
    orderId,
    success: true,
    detail: `إلغاء الفاتورة #${orderId} (كانت ${order.status} / ${order.total.toFixed(2)})`,
  });
  revalidateInvoice(order.venueId, orderId);
  return { ok: true };
}

export async function adminRestoreInvoice(orderId: number): Promise<ActionResult> {
  const session = await assertAdmin();
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) return { error: "الفاتورة غير موجودة" };
  if (order.status !== "cancelled") return { error: "الفاتورة ليست ملغاة" };

  const nextStatus = order.paidAt ? "paid" : "open";
  db.update(orders)
    .set({ status: nextStatus })
    .where(eq(orders.id, orderId))
    .run();

  recordSessionAudit(session, {
    venueId: order.venueId,
    kind: "invoice_edit",
    orderId,
    success: true,
    detail: `استعادة الفاتورة #${orderId} إلى ${nextStatus === "paid" ? "مدفوعة" : "مفتوحة"}`,
  });
  revalidateInvoice(order.venueId, orderId);
  return { ok: true };
}
