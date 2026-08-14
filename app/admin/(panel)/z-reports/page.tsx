import { FileBarChart } from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import { AdminReprintZButton } from "@/components/AdminReprintZButton";
import { VenueTabs } from "@/components/VenueTabs";
import { parseVenueParam } from "@/lib/admin-venue";
import { listZReports } from "@/lib/shifts/core";
import { formatDateTime, formatMoney } from "@/lib/venues";

export default async function AdminZReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const venue = parseVenueParam(sp.venue);
  const rows = listZReports(venue, 100);
  const salesTotal = rows.reduce((sum, row) => sum + row.totalSales, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <FileBarChart className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">تقارير Z</h2>
            <p className="text-sm text-base-content/45">
              {rows.length} إغلاق · إجمالي {formatMoney(salesTotal)}
            </p>
          </div>
        </div>
        <VenueTabs basePath="/admin/z-reports" venue={venue} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-base-300/70 bg-base-100">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>رقم</th>
              <th>الإغلاق</th>
              <th>الفواتير</th>
              <th>نقدي</th>
              <th>بطاقة</th>
              <th>الإجمالي</th>
              <th>أغلق بواسطة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-base-content/45">
                  لا توجد تقارير Z بعد
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.shiftId}>
                  <td className="font-bold tabular-nums">{row.workDate}</td>
                  <td className="tabular-nums">#{row.shiftNumber}</td>
                  <td className="whitespace-nowrap text-xs">
                    {formatDateTime(row.closedAt)}
                  </td>
                  <td className="tabular-nums">{row.invoiceCount}</td>
                  <td className="tabular-nums">{formatMoney(row.cashTotal)}</td>
                  <td className="tabular-nums">{formatMoney(row.cardTotal)}</td>
                  <td className="font-black tabular-nums">
                    {formatMoney(row.totalSales)}
                  </td>
                  <td>{row.closedByName ?? "—"}</td>
                  <td>
                    <AdminReprintZButton shiftId={row.shiftId} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
