import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  ArrowRight,
  Banknote,
  Clock3,
  CreditCard,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/actions/auth";
import { InvoiceEditor } from "@/components/admin/InvoiceEditor";
import {
  AUDIT_KIND_LABELS,
  isAuditKind,
  roleLabel,
} from "@/lib/audit";
import { db } from "@/lib/db";
import {
  auditEvents,
  cancelledItems,
  categories,
  items,
  orderItems,
  orders,
  tables,
  users,
} from "@/lib/db/schema";
import { availableAtVenue } from "@/lib/menu/scope";
import {
  formatDateTime,
  formatMoney,
  getVenueName,
  isVenueId,
} from "@/lib/venues";

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

  const cancelled = db
    .select()
    .from(cancelledItems)
    .where(eq(cancelledItems.orderId, orderId))
    .orderBy(desc(cancelledItems.id))
    .all();

  const history = db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.orderId, orderId))
    .orderBy(desc(auditEvents.id))
    .limit(20)
    .all();

  const statusLabel =
    order.status === "paid"
      ? "مدفوعة"
      : order.status === "cancelled"
        ? "ملغاة"
        : "مفتوحة";
  const statusClass =
    order.status === "paid"
      ? "badge-success"
      : order.status === "cancelled"
        ? "badge-error"
        : "badge-warning";

  return (
    <div className="space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-neutral via-slate-800 to-primary p-5 text-neutral-content shadow-xl sm:p-7">
        <div className="absolute -left-10 -top-16 size-48 rounded-full border-[28px] border-white/5" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`badge ${statusClass} badge-lg border-0`}>
                {statusLabel}
              </span>
              <span className="badge badge-ghost border-white/15 bg-white/10 text-white">
                {getVenueName(order.venueId)}
              </span>
            </div>
            <h2 className="flex items-center gap-2 text-3xl font-black">
              <ReceiptText className="size-7" />
              فاتورة #{order.id}
            </h2>
            <p className="mt-1 text-sm text-white/65">
              {table?.name ?? "بيع سريع"} ·{" "}
              {formatDateTime(order.paidAt ?? order.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-xs text-white/55">الإجمالي</p>
              <p className="text-2xl font-black">{formatMoney(order.total)}</p>
            </div>
            <Link
              href="/admin/invoices"
              className="btn btn-sm rounded-xl border-white/15 bg-white/10 text-white hover:bg-white/20"
            >
              <ArrowRight className="size-4" />
              كل الفواتير
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-base-300/70 bg-base-100 px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs text-base-content/45">
            {order.paymentMethod === "card" ? (
              <CreditCard className="size-3.5" />
            ) : (
              <Banknote className="size-3.5" />
            )}
            الدفع
          </p>
          <p className="font-black">
            {order.paymentMethod === "cash"
              ? "نقدي"
              : order.paymentMethod === "card"
                ? "بطاقة"
                : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-base-300/70 bg-base-100 px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs text-base-content/45">
            <UserRound className="size-3.5" />
            السفرادجي
          </p>
          <p className="font-black">{waiter?.name ?? "—"}</p>
        </div>
        <div className="rounded-2xl border border-base-300/70 bg-base-100 px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs text-base-content/45">
            <UserRound className="size-3.5" />
            الكاشير
          </p>
          <p className="font-black">{cashier?.name ?? "—"}</p>
        </div>
        <div className="rounded-2xl border border-base-300/70 bg-base-100 px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs text-base-content/45">
            <Clock3 className="size-3.5" />
            أُنشئت
          </p>
          <p className="text-sm font-black">{formatDateTime(order.createdAt)}</p>
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

      {cancelled.length > 0 ? (
        <section className="overflow-hidden rounded-3xl border border-error/20 bg-base-100 shadow-sm">
          <div className="flex items-center justify-between border-b border-error/15 bg-error/5 px-5 py-4">
            <div>
              <h3 className="font-black text-error">أصناف ألغاها الكاشير الرئيسي</h3>
              <p className="text-xs text-base-content/45">
                الأصناف أعلاه هي الفاتورة النهائية — هنا ما أُزيل منها
              </p>
            </div>
            <Link
              href={`/admin/cancelled-items?venue=${order.venueId}&q=${order.id}`}
              className="btn btn-ghost btn-xs"
            >
              كل الملغاة
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>أُزيل</th>
                  <th>كان / تبقّى</th>
                  <th>من</th>
                  <th>السبب</th>
                </tr>
              </thead>
              <tbody>
                {cancelled.map((row) => (
                  <tr key={row.id}>
                    <td className="font-bold">{row.itemName}</td>
                    <td className="font-black text-error">
                      −{row.qtyRemoved}× · {formatMoney(row.lineTotalRemoved)}
                    </td>
                    <td>
                      {row.qtyBefore} → {row.qtyAfter}
                    </td>
                    <td>
                      <span className="font-bold">{row.removedByName}</span>
                      <span className="ms-1 text-[11px] text-base-content/45">
                        {roleLabel(row.removedByRole)}
                      </span>
                    </td>
                    <td className="text-xs">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-base-300/70 bg-base-100 shadow-sm">
        <div className="border-b border-base-300/60 px-5 py-4">
          <h3 className="font-black">حركات هذه الفاتورة</h3>
          <p className="text-xs text-base-content/45">طباعة وتعديلات الإدارة</p>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>الوقت</th>
                <th>الموظف</th>
                <th>العمل</th>
                <th>النتيجة</th>
                <th>التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td>
                    <span className="font-bold">{row.userName}</span>
                    <span className="ms-1 text-[11px] text-base-content/45">
                      {roleLabel(row.role)}
                    </span>
                  </td>
                  <td className="font-bold">
                    {isAuditKind(row.kind)
                      ? AUDIT_KIND_LABELS[row.kind]
                      : row.kind}
                  </td>
                  <td>
                    <span
                      className={`badge badge-sm ${
                        row.success
                          ? "badge-success badge-soft"
                          : "badge-error badge-soft"
                      }`}
                    >
                      {row.success ? "تم" : "فشل"}
                    </span>
                  </td>
                  <td className="text-xs">{row.detail}</td>
                </tr>
              ))}
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-base-content/45">
                    لا حركات مسجّلة لهذه الفاتورة
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
