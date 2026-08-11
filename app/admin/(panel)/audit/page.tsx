import { ClipboardList } from "lucide-react";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { requireAdmin } from "@/app/actions/auth";
import { VenueTabs } from "@/components/VenueTabs";
import {
  AUDIT_KIND_LABELS,
  AUDIT_KINDS,
  isAuditKind,
  roleLabel,
  venueLabel,
} from "@/lib/audit";
import { parseVenueParam } from "@/lib/admin-venue";
import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";
import {
  defaultReportRange,
  normalizeFilterDateTime,
  toDateTimeLocalValue,
} from "@/lib/reports/filters";
import { formatDateTime } from "@/lib/venues";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    venue?: string;
    from?: string;
    to?: string;
    kind?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const venue = parseVenueParam(sp.venue);
  const range = defaultReportRange();
  const fromSql = normalizeFilterDateTime(sp.from, `${range.today} 00:00:00`, "start");
  const toSql = normalizeFilterDateTime(sp.to, `${range.today} 23:59:59`, "end");
  const kind = sp.kind && isAuditKind(sp.kind) ? sp.kind : "all";

  const conditions: SQL[] = [
    eq(auditEvents.venueId, venue),
    gte(auditEvents.createdAt, fromSql),
    lte(auditEvents.createdAt, toSql),
  ];
  if (kind !== "all") {
    conditions.push(eq(auditEvents.kind, kind));
  }

  const rows = db
    .select()
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.id))
    .limit(300)
    .all();

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-warning/15 text-warning">
            <ClipboardList className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">سجل التدقيق</h2>
            <p className="text-sm text-base-content/45">
              من طبع ماذا — مطبخ، فواتير، X/Z، وتعديلات الإدارة
            </p>
          </div>
        </div>
        <VenueTabs basePath="/admin/audit" venue={venue} />
      </div>

      <form className="premium-card card">
        <div className="card-body flex flex-wrap items-end gap-3 p-4 sm:p-5">
          <label className="form-control">
            <span className="label-text mb-1 text-xs font-bold">من</span>
            <input
              type="datetime-local"
              name="from"
              defaultValue={toDateTimeLocalValue(fromSql, "start")}
              className="input input-bordered input-sm"
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1 text-xs font-bold">إلى</span>
            <input
              type="datetime-local"
              name="to"
              defaultValue={toDateTimeLocalValue(toSql, "end")}
              className="input input-bordered input-sm"
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1 text-xs font-bold">النوع</span>
            <select
              name="kind"
              defaultValue={kind}
              className="select select-bordered select-sm"
            >
              <option value="all">الكل</option>
              {AUDIT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {AUDIT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="venue" value={venue} />
          <button type="submit" className="btn btn-primary btn-sm">
            عرض
          </button>
        </div>
      </form>

      <section className="premium-card card">
        <div className="card-body gap-4 p-4 sm:p-6">
          <p className="text-xs text-base-content/45">{rows.length} حركة</p>
          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra table-sm">
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>الموظف</th>
                  <th>العمل</th>
                  <th>الفاتورة</th>
                  <th>الطابعة</th>
                  <th>النتيجة</th>
                  <th>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td>
                      <p className="font-bold">{row.userName}</p>
                      <p className="text-[11px] text-base-content/45">
                        {roleLabel(row.role)} · {venueLabel(row.venueId)}
                      </p>
                    </td>
                    <td className="font-bold">
                      {isAuditKind(row.kind)
                        ? AUDIT_KIND_LABELS[row.kind]
                        : row.kind}
                    </td>
                    <td>
                      {row.orderId ? (
                        <a
                          href={`/admin/invoices/${row.orderId}`}
                          className="link link-hover font-bold"
                        >
                          #{row.orderId}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{row.printerName ?? "—"}</td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          row.success ? "badge-success badge-soft" : "badge-error badge-soft"
                        }`}
                      >
                        {row.success ? "تم" : "فشل"}
                      </span>
                    </td>
                    <td className="max-w-xs text-xs">{row.detail}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center opacity-60">
                      لا حركات في هذه الفترة
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
