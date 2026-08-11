import Link from "next/link";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { Ban, Search } from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import { VenueTabs } from "@/components/VenueTabs";
import { parseVenueParam } from "@/lib/admin-venue";
import { db } from "@/lib/db";
import { cancelledItems, orders, tables } from "@/lib/db/schema";
import { formatDateTime, formatMoney } from "@/lib/venues";

export default async function AdminCancelledItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string; q?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const venue = parseVenueParam(sp.venue);
  const q = (sp.q ?? "").trim();

  const conditions: SQL[] = [eq(cancelledItems.venueId, venue)];
  const invoiceId = Number(q.replace("#", ""));
  if (q && Number.isFinite(invoiceId)) {
    conditions.push(eq(cancelledItems.orderId, invoiceId));
  }

  const rows = db
    .select({
      id: cancelledItems.id,
      orderId: cancelledItems.orderId,
      itemName: cancelledItems.itemName,
      qtyRemoved: cancelledItems.qtyRemoved,
      qtyBefore: cancelledItems.qtyBefore,
      qtyAfter: cancelledItems.qtyAfter,
      lineTotalRemoved: cancelledItems.lineTotalRemoved,
      remainingTotal: cancelledItems.remainingTotal,
      reason: cancelledItems.reason,
      removedByName: cancelledItems.removedByName,
      createdAt: cancelledItems.createdAt,
      tableName: tables.name,
    })
    .from(cancelledItems)
    .innerJoin(orders, eq(cancelledItems.orderId, orders.id))
    .leftJoin(tables, eq(orders.tableId, tables.id))
    .where(and(...conditions))
    .orderBy(desc(cancelledItems.id))
    .limit(200)
    .all();

  const removedTotal = rows.reduce((sum, row) => sum + row.lineTotalRemoved, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-error/10 text-error">
            <Ban className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">الأصناف الملغاة</h2>
            <p className="text-sm text-base-content/45">
              {rows.length} إلغاء · خصم {formatMoney(removedTotal)}
            </p>
          </div>
        </div>
        <VenueTabs basePath="/admin/cancelled-items" venue={venue} />
      </div>

      <form className="flex items-end gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-bold">رقم الفاتورة</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="42"
            className="input input-bordered input-sm w-full"
          />
        </label>
        <input type="hidden" name="venue" value={venue} />
        <button type="submit" className="btn btn-primary btn-sm gap-1">
          <Search className="size-3.5" />
          بحث
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-base-300/70 bg-base-100">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>فاتورة</th>
              <th>أُزيل</th>
              <th>كان → تبقّى</th>
              <th>الخصم</th>
              <th>السبب</th>
              <th>من</th>
              <th>الوقت</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap">
                  <Link
                    href={`/admin/invoices/${row.orderId}`}
                    className="font-black hover:text-primary"
                  >
                    #{row.orderId}
                  </Link>
                  <span className="ms-1 text-[11px] text-base-content/45">
                    {row.tableName ?? "سريع"}
                  </span>
                </td>
                <td className="font-bold">
                  −{row.qtyRemoved}× {row.itemName}
                </td>
                <td className="tabular-nums">
                  {row.qtyBefore} → {row.qtyAfter}
                </td>
                <td className="font-black text-error tabular-nums">
                  {formatMoney(row.lineTotalRemoved)}
                </td>
                <td className="max-w-[12rem] truncate">{row.reason}</td>
                <td>{row.removedByName}</td>
                <td className="whitespace-nowrap text-xs">
                  {formatDateTime(row.createdAt)}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-base-content/45">
                  لا أصناف ملغاة
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
