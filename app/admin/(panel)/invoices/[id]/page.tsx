import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowRight, ReceiptText } from "lucide-react";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/actions/auth";
import { InvoiceEditor } from "@/components/admin/InvoiceEditor";
import { db } from "@/lib/db";
import { categories, items, orderItems, orders, tables, users } from "@/lib/db/schema";
import { availableAtVenue } from "@/lib/menu/scope";
import { formatDateTime, formatMoney, getVenueName, isVenueId } from "@/lib/venues";

export default async function AdminInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isFinite(orderId)) notFound();

  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || !isVenueId(order.venueId)) notFound();

  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();

  const table = order.tableId
    ? db.select().from(tables).where(eq(tables.id, order.tableId)).get()
    : null;
  const waiter = order.waiterId
    ? db.select().from(users).where(eq(users.id, order.waiterId)).get()
    : null;
  const cashier = order.cashierId
    ? db.select().from(users).where(eq(users.id, order.cashierId)).get()
    : null;

  const cats = db
    .select()
    .from(categories)
    .where(
      and(
        availableAtVenue(categories.venueId, order.venueId),
        eq(categories.active, true),
      ),
    )
    .orderBy(asc(categories.sortOrder))
    .all();

  const menuItems = db
    .select()
    .from(items)
    .where(
      and(
        availableAtVenue(items.venueId, order.venueId),
        eq(items.active, true),
      ),
    )
    .all();

  const statusLabel =
    order.status === "paid"
      ? "مدفوعة"
      : order.status === "cancelled"
        ? "ملغاة"
        : "مفتوحة";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ReceiptText className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black">فاتورة #{order.id}</h2>
            <p className="text-sm text-base-content/45">
              {getVenueName(order.venueId)} · {table?.name ?? "بيع سريع"} ·{" "}
              {statusLabel}
            </p>
          </div>
        </div>
        <Link href="/admin/invoices" className="btn btn-ghost btn-sm gap-1">
          <ArrowRight className="size-4" />
          كل الفواتير
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-base-300 bg-base-100 px-3 py-2">
          <p className="text-[11px] text-base-content/45">المجموع</p>
          <p className="text-lg font-black">{formatMoney(order.total)}</p>
        </div>
        <div className="rounded-xl border border-base-300 bg-base-100 px-3 py-2">
          <p className="text-[11px] text-base-content/45">الدفع</p>
          <p className="font-black">
            {order.paymentMethod === "cash"
              ? "نقدي"
              : order.paymentMethod === "card"
                ? "بطاقة"
                : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-base-300 bg-base-100 px-3 py-2">
          <p className="text-[11px] text-base-content/45">السفرادجي / الكاشير</p>
          <p className="font-bold">
            {waiter?.name ?? "—"} / {cashier?.name ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border border-base-300 bg-base-100 px-3 py-2">
          <p className="text-[11px] text-base-content/45">الوقت</p>
          <p className="text-sm font-bold">
            {formatDateTime(order.paidAt ?? order.createdAt)}
          </p>
        </div>
      </div>

      <InvoiceEditor
        orderId={order.id}
        status={order.status}
        lines={lines.map((line) => ({
          id: line.id,
          itemId: line.itemId,
          itemName: line.itemName,
          qty: line.qty,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
        }))}
        categories={cats.map((cat) => ({ id: cat.id, name: cat.name }))}
        items={menuItems.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          categoryId: item.categoryId,
        }))}
      />
    </div>
  );
}
