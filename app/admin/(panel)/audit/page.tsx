import Link from "next/link";
import { and, desc, eq, gte, like, lte, or, type SQL } from "drizzle-orm";
import { ClipboardList, Filter, Search } from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import {
  AUDIT_KIND_LABELS,
  AUDIT_KINDS,
  isAuditKind,
  roleLabel,
  venueLabel,
} from "@/lib/audit";
import { parseVenueParam } from "@/lib/admin-venue";
import { db } from "@/lib/db";
import { auditEvents, users } from "@/lib/db/schema";
import {
  defaultReportRange,
  inputDate,
  normalizeFilterDateTime,
  parseId,
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
    user?: string;
    role?: string;
    result?: string;
    order?: string;
    q?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const venueAll = sp.venue === "all";
  const venue = venueAll ? null : parseVenueParam(sp.venue);
  const range = defaultReportRange();
  const fromSql = normalizeFilterDateTime(sp.from, `${range.today} 00:00:00`, "start");
  const toSql = normalizeFilterDateTime(sp.to, `${range.today} 23:59:59`, "end");
  const kind = sp.kind && isAuditKind(sp.kind) ? sp.kind : "all";
  const userId = parseId(sp.user);
  const role =
    sp.role === "admin" || sp.role === "waiter" || sp.role === "cashier"
      ? sp.role
      : "all";
  const result =
    sp.result === "ok" || sp.result === "fail" ? sp.result : "all";
  const orderId = parseId(sp.order);
  const q = (sp.q ?? "").trim();

  const conditions: SQL[] = [
    gte(auditEvents.createdAt, fromSql),
    lte(auditEvents.createdAt, toSql),
  ];
  if (venue) conditions.push(eq(auditEvents.venueId, venue));
  if (kind !== "all") conditions.push(eq(auditEvents.kind, kind));
  if (userId) conditions.push(eq(auditEvents.userId, userId));
  if (role !== "all") conditions.push(eq(auditEvents.role, role));
  if (result === "ok") conditions.push(eq(auditEvents.success, true));
  if (result === "fail") conditions.push(eq(auditEvents.success, false));
  if (orderId) conditions.push(eq(auditEvents.orderId, orderId));
  if (q) {
    conditions.push(
      or(
        like(auditEvents.detail, `%${q}%`),
        like(auditEvents.userName, `%${q}%`),
        like(auditEvents.printerName, `%${q}%`),
      )!,
    );
  }

  const rows = db
    .select()
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.id))
    .limit(400)
    .all();

  const staff = db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .all()
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  const now = new Date();
  const today = inputDate(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = inputDate(yesterdayDate);

  function hrefWith(next: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = {
      venue: venueAll ? "all" : venue ?? "restaurant",
      from: sp.from ?? range.from,
      to: sp.to ?? range.to,
      kind: kind === "all" ? undefined : kind,
      user: userId ? String(userId) : undefined,
      role: role === "all" ? undefined : role,
      result: result === "all" ? undefined : result,
      order: orderId ? String(orderId) : undefined,
      q: q || undefined,
      ...next,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    return `/admin/audit?${params.toString()}`;
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-warning/15 text-warning">
            <ClipboardList className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">سجل التدقيق</h2>
            <p className="text-sm text-base-content/45">
              من فعل ماذا — طباعة، مطبخ، X/Z، وتعديل الفواتير
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5 rounded-2xl border border-base-300/70 bg-base-100 p-1.5">
          {(
            [
              ["all", "الكل"],
              ["restaurant", "مطعم"],
              ["cafe", "كافيه"],
            ] as const
          ).map(([id, label]) => {
            const active = id === "all" ? venueAll : venue === id;
            return (
              <Link
                key={id}
                href={hrefWith({ venue: id })}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${
                  active
                    ? "bg-primary text-primary-content"
                    : "text-base-content/55 hover:bg-base-200"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      <form className="overflow-hidden rounded-3xl border border-base-300/70 bg-base-100 shadow-sm">
        <div className="flex items-center gap-2 border-b border-base-300/60 px-5 py-3">
          <Filter className="size-4 text-primary" />
          <h3 className="font-black">تصفية السجل</h3>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-bold text-base-content/55">من</span>
            <input
              type="datetime-local"
              name="from"
              defaultValue={toDateTimeLocalValue(fromSql, "start")}
              className="input input-bordered h-11 w-full min-w-0 rounded-xl"
            />
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-bold text-base-content/55">إلى</span>
            <input
              type="datetime-local"
              name="to"
              defaultValue={toDateTimeLocalValue(toSql, "end")}
              className="input input-bordered h-11 w-full min-w-0 rounded-xl"
            />
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-bold text-base-content/55">العمل</span>
            <select
              name="kind"
              defaultValue={kind}
              className="select select-bordered h-11 w-full min-w-0 rounded-xl"
            >
              <option value="all">كل الأعمال</option>
              {AUDIT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {AUDIT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-bold text-base-content/55">الموظف</span>
            <select
              name="user"
              defaultValue={userId ?? ""}
              className="select select-bordered h-11 w-full min-w-0 rounded-xl"
            >
              <option value="">كل الموظفين</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {roleLabel(person.role)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-bold text-base-content/55">الدور</span>
            <select
              name="role"
              defaultValue={role}
              className="select select-bordered h-11 w-full min-w-0 rounded-xl"
            >
              <option value="all">كل الأدوار</option>
              <option value="admin">إدارة</option>
              <option value="cashier">كاشير</option>
              <option value="waiter">سفرادجي</option>
            </select>
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-bold text-base-content/55">النتيجة</span>
            <select
              name="result"
              defaultValue={result}
              className="select select-bordered h-11 w-full min-w-0 rounded-xl"
            >
              <option value="all">الكل</option>
              <option value="ok">نجاح</option>
              <option value="fail">فشل</option>
            </select>
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-bold text-base-content/55">رقم الفاتورة</span>
            <input
              name="order"
              defaultValue={orderId ?? ""}
              placeholder="60"
              className="input input-bordered h-11 w-full min-w-0 rounded-xl"
            />
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-bold text-base-content/55">بحث</span>
            <span className="flex h-11 items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3">
              <Search className="size-4 shrink-0 text-base-content/40" />
              <input
                name="q"
                defaultValue={q}
                placeholder="تفاصيل، طابعة، اسم…"
                className="min-w-0 grow bg-transparent outline-none"
              />
            </span>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-base-300/60 px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={hrefWith({
                from: `${today}T00:00`,
                to: `${today}T23:59`,
              })}
              className="btn btn-ghost btn-sm rounded-xl"
            >
              اليوم
            </Link>
            <Link
              href={hrefWith({
                from: `${yesterday}T00:00`,
                to: `${yesterday}T23:59`,
              })}
              className="btn btn-ghost btn-sm rounded-xl"
            >
              أمس
            </Link>
            <Link href="/admin/audit" className="btn btn-ghost btn-sm rounded-xl">
              مسح الفلاتر
            </Link>
          </div>
          <input type="hidden" name="venue" value={venueAll ? "all" : venue ?? "restaurant"} />
          <button type="submit" className="btn btn-primary btn-sm rounded-xl">
            تطبيق التصفية
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-3xl border border-base-300/70 bg-base-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-sm font-bold text-base-content/55">
            {rows.length} حركة
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-zebra">
            <thead>
              <tr>
                <th>الوقت</th>
                <th>الموظف</th>
                <th>العمل</th>
                <th>الفرع</th>
                <th>الفاتورة</th>
                <th>الطابعة</th>
                <th>النتيجة</th>
                <th>التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-sm">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td>
                    <p className="font-black">{row.userName}</p>
                    <p className="text-[11px] text-base-content/45">
                      {roleLabel(row.role)}
                    </p>
                  </td>
                  <td className="font-bold">
                    {isAuditKind(row.kind)
                      ? AUDIT_KIND_LABELS[row.kind]
                      : row.kind}
                  </td>
                  <td>{venueLabel(row.venueId)}</td>
                  <td>
                    {row.orderId ? (
                      <Link
                        href={`/admin/invoices/${row.orderId}`}
                        className="link link-hover font-black"
                      >
                        #{row.orderId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-sm">{row.printerName ?? "—"}</td>
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
                  <td className="max-w-sm text-xs leading-5">{row.detail}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-base-content/45">
                    لا حركات مطابقة لهذه التصفية
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
