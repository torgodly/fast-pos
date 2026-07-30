import { and, desc, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  Banknote,
  CalendarRange,
  CreditCard,
  FileText,
  Search,
  TrendingUp,
} from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import { VenueTabs } from "@/components/VenueTabs";
import { parseVenueParam } from "@/lib/admin-venue";
import { db } from "@/lib/db";
import { orders, tables, users } from "@/lib/db/schema";
import { formatDateTime, formatMoney, getVenueName } from "@/lib/venues";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string; from?: string; to?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const venue = parseVenueParam(sp.venue);

  const today = new Date().toISOString().slice(0, 10);
  const from = sp.from || today;
  const to = sp.to || today;

  const waiter = alias(users, "waiter");
  const cashier = alias(users, "cashier");

  const rows = db
    .select({
      id: orders.id,
      total: orders.total,
      paymentMethod: orders.paymentMethod,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      tableName: tables.name,
      waiterName: waiter.name,
      cashierName: cashier.name,
    })
    .from(orders)
    .leftJoin(tables, eq(orders.tableId, tables.id))
    .leftJoin(waiter, eq(orders.waiterId, waiter.id))
    .leftJoin(cashier, eq(orders.cashierId, cashier.id))
    .where(
      and(
        eq(orders.venueId, venue),
        eq(orders.status, "paid"),
        gte(orders.paidAt, `${from} 00:00:00`),
        lte(orders.paidAt, `${to} 23:59:59`),
      ),
    )
    .orderBy(desc(orders.paidAt))
    .all();

  const totalSales = rows.reduce((s, r) => s + r.total, 0);
  const cashTotal = rows
    .filter((r) => r.paymentMethod === "cash")
    .reduce((s, r) => s + r.total, 0);
  const cardTotal = rows
    .filter((r) => r.paymentMethod === "card")
    .reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-success/10 text-success">
            <TrendingUp className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">تقارير المبيعات</h2>
            <p className="text-sm text-base-content/45">
              أداء {getVenueName(venue)} حسب الفترة
            </p>
          </div>
        </div>
        <VenueTabs basePath="/admin/reports" venue={venue} />
      </div>

      <form className="premium-card card">
        <div className="card-body flex-col gap-4 p-4 sm:flex-row sm:items-end sm:p-5">
          <span className="hidden size-11 place-items-center rounded-xl bg-primary/10 text-primary sm:grid">
            <CalendarRange className="size-5" />
          </span>
          <input type="hidden" name="venue" value={venue} />
          <label className="form-control flex-1">
            <span className="label-text mb-1.5 font-bold">من تاريخ</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="input input-bordered w-full"
            />
          </label>
          <label className="form-control flex-1">
            <span className="label-text mb-1.5 font-bold">إلى تاريخ</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="input input-bordered w-full"
            />
          </label>
          <button type="submit" className="btn btn-primary gap-2">
            <Search className="size-4" />
            عرض
          </button>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "إجمالي المبيعات",
            value: totalSales,
            icon: TrendingUp,
            color: "bg-primary/10 text-primary",
            hint: `${rows.length} فاتورة`,
          },
          {
            label: "مدفوع نقداً",
            value: cashTotal,
            icon: Banknote,
            color: "bg-success/10 text-success",
            hint: "الدفعات النقدية",
          },
          {
            label: "مدفوع بالبطاقة",
            value: cardTotal,
            icon: CreditCard,
            color: "bg-info/10 text-info",
            hint: "دفعات البطاقات",
          },
        ].map(({ label, value, icon: Icon, color, hint }) => (
          <div key={label} className="premium-card card">
            <div className="card-body flex-row items-center gap-4 p-5">
              <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${color}`}>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-base-content/45">{label}</p>
                <p className="mt-0.5 truncate text-2xl font-black">
                  {formatMoney(value)}
                </p>
                <p className="text-xs text-base-content/35">{hint}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="premium-card card">
        <div className="card-body gap-4 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <FileText className="size-5 text-primary" />
            <h3 className="font-black">سجل الفواتير</h3>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الطاولة</th>
                  <th>النادل</th>
                  <th>الكاشير</th>
                  <th>الدفع</th>
                  <th>المجموع</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.tableName ?? "بيع سريع"}</td>
                    <td>{row.waiterName ?? "-"}</td>
                    <td>{row.cashierName ?? "-"}</td>
                    <td>
                      <span className="badge badge-ghost gap-1.5">
                        {row.paymentMethod === "cash" ? (
                          <Banknote className="size-3.5" />
                        ) : (
                          <CreditCard className="size-3.5" />
                        )}
                        {row.paymentMethod === "cash"
                          ? "نقدي"
                          : row.paymentMethod === "card"
                            ? "بطاقة"
                            : "-"}
                      </span>
                    </td>
                    <td className="font-black">{formatMoney(row.total)}</td>
                    <td>{formatDateTime(row.paidAt ?? row.createdAt)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center opacity-60">
                      لا توجد مبيعات في هذه الفترة
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
