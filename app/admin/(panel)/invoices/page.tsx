import Link from "next/link";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { ReceiptText, Search } from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import { VenueTabs } from "@/components/VenueTabs";
import { parseVenueParam } from "@/lib/admin-venue";
import { db } from "@/lib/db";
import { orders, tables, users } from "@/lib/db/schema";
import { formatDateTime, formatMoney } from "@/lib/venues";

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string; q?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const venue = parseVenueParam(sp.venue);
  const q = (sp.q ?? "").trim();

  const conditions: SQL[] = [eq(orders.venueId, venue)];
  const invoiceId = Number(q.replace("#", ""));
  if (q && Number.isFinite(invoiceId)) {
    conditions.push(eq(orders.id, invoiceId));
  }

  const rows = db
    .select({
      id: orders.id,
      status: orders.status,
      total: orders.total,
      paymentMethod: orders.paymentMethod,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      tableName: tables.name,
      waiterName: users.name,
    })
    .from(orders)
    .leftJoin(tables, eq(orders.tableId, tables.id))
    .leftJoin(users, eq(orders.waiterId, users.id))
    .where(and(...conditions))
    .orderBy(desc(orders.id))
    .limit(80)
    .all();

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ReceiptText className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">الفواتير</h2>
            <p className="text-sm text-base-content/45">
              افتح فاتورة لتعديل الأصناف أو إلغائها — التقارير تتحدث فوراً
            </p>
          </div>
        </div>
        <VenueTabs basePath="/admin/invoices" venue={venue} />
      </div>

      <form className="premium-card card">
        <div className="card-body flex flex-row items-end gap-2 p-4">
          <label className="form-control flex-1">
            <span className="label-text mb-1 text-xs font-bold">رقم الفاتورة</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="مثال: 42"
              className="input input-bordered input-sm"
            />
          </label>
          <input type="hidden" name="venue" value={venue} />
          <button type="submit" className="btn btn-primary btn-sm gap-1">
            <Search className="size-3.5" />
            بحث
          </button>
        </div>
      </form>

      <section className="premium-card card">
        <div className="card-body p-0">
          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الحالة</th>
                  <th>الطاولة</th>
                  <th>السفرادجي</th>
                  <th>المجموع</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link
                        href={`/admin/invoices/${row.id}`}
                        className="link link-hover font-black"
                      >
                        #{row.id}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          row.status === "paid"
                            ? "badge-success badge-soft"
                            : row.status === "cancelled"
                              ? "badge-error badge-soft"
                              : "badge-warning badge-soft"
                        }`}
                      >
                        {row.status === "paid"
                          ? "مدفوعة"
                          : row.status === "cancelled"
                            ? "ملغاة"
                            : "مفتوحة"}
                      </span>
                    </td>
                    <td>{row.tableName ?? "بيع سريع"}</td>
                    <td>{row.waiterName ?? "—"}</td>
                    <td className="font-black">{formatMoney(row.total)}</td>
                    <td>{formatDateTime(row.paidAt ?? row.createdAt)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center opacity-60">
                      لا فواتير
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
