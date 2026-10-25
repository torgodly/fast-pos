import { Clock3 } from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import { AdminReprintShiftButton } from "@/components/AdminReprintShiftButton";
import { VenueTabs } from "@/components/VenueTabs";
import { parseVenueParam } from "@/lib/admin-venue";
import { getOpenShift, listShifts } from "@/lib/shifts/core";
import { formatDateTime, formatMoney } from "@/lib/venues";

function DifferenceValue({ value }: { value: number | null }) {
  if (value === null) return <span className="text-base-content/40">—</span>;
  if (value === 0) return <span className="font-bold text-success">مطابق</span>;
  if (value > 0) {
    return (
      <span className="font-bold text-info" dir="ltr">
        +{formatMoney(value)}
      </span>
    );
  }
  return (
    <span className="font-bold text-error" dir="ltr">
      -{formatMoney(Math.abs(value))}
    </span>
  );
}

export default async function AdminShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const venue = parseVenueParam(sp.venue);
  const rows = listShifts(venue, 100);
  const openShift = getOpenShift(venue);
  const salesTotal = rows.reduce((sum, row) => sum + row.totalSales, 0);
  const expenseTotal = rows.reduce((sum, row) => sum + row.expenseTotal, 0);
  const differenceTotal = rows.reduce(
    (sum, row) => sum + (row.difference ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Clock3 className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">الورديات</h2>
            <p className="text-sm text-base-content/45">
              {rows.length} وردية مغلقة · إجمالي {formatMoney(salesTotal)} ·
              مصروفات {formatMoney(expenseTotal)} · صافي الفروقات{" "}
              {formatMoney(differenceTotal)}
            </p>
          </div>
        </div>
        <VenueTabs basePath="/admin/shifts" venue={venue} />
      </div>

      {openShift ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-bold text-success">
          <span>
            وردية مفتوحة الآن #{openShift.shiftNumber} — فتحها{" "}
            {formatDateTime(openShift.openedAt)} بعهدة{" "}
            {formatMoney(openShift.openingFloat)}
          </span>
        </div>
      ) : (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm font-bold text-warning">
          لا توجد وردية مفتوحة لهذا القسم — البيع والدفع موقوفان حتى يفتحها
          الكاشير الرئيسي.
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-base-300/70 bg-base-100">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>رقم</th>
              <th>الفتح / الإغلاق</th>
              <th>الفواتير</th>
              <th>نقدي</th>
              <th>مصروفات</th>
              <th>غير نقدي</th>
              <th>الإجمالي</th>
              <th>عهدة</th>
              <th>متوقع</th>
              <th>معدود</th>
              <th>الفرق</th>
              <th>الموظفون</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={14}
                  className="py-10 text-center text-base-content/45"
                >
                  لا توجد ورديات مغلقة بعد
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.shiftId}>
                  <td className="font-bold tabular-nums">{row.workDate}</td>
                  <td className="tabular-nums">#{row.shiftNumber}</td>
                  <td className="whitespace-nowrap text-xs">
                    <p>{formatDateTime(row.openedAt)}</p>
                    <p className="text-base-content/45">
                      {formatDateTime(row.closedAt)}
                    </p>
                  </td>
                  <td className="tabular-nums">{row.invoiceCount}</td>
                  <td className="tabular-nums">{formatMoney(row.cashTotal)}</td>
                  <td className="tabular-nums text-warning">
                    {formatMoney(row.expenseTotal)}
                  </td>
                  <td className="tabular-nums">
                    {formatMoney(row.nonCashTotal)}
                  </td>
                  <td className="font-black tabular-nums">
                    {formatMoney(row.totalSales)}
                  </td>
                  <td className="tabular-nums">
                    {formatMoney(row.openingFloat)}
                  </td>
                  <td className="tabular-nums">
                    {row.expectedCash === null
                      ? "—"
                      : formatMoney(row.expectedCash)}
                  </td>
                  <td className="tabular-nums">
                    {row.countedCash === null
                      ? "—"
                      : formatMoney(row.countedCash)}
                  </td>
                  <td>
                    <DifferenceValue value={row.difference} />
                  </td>
                  <td className="whitespace-nowrap text-xs">
                    <p>{row.openedByName ?? "—"}</p>
                    <p className="text-base-content/45">
                      {row.closedByName ?? "—"}
                    </p>
                  </td>
                  <td>
                    <AdminReprintShiftButton shiftId={row.shiftId} />
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
