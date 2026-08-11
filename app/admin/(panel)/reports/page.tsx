import { eq } from "drizzle-orm";
import {
  AlertTriangle,
  Banknote,
  Boxes,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  Filter,
  ReceiptText,
  RotateCcw,
  Search,
  ShoppingBag,
  Tags,
  TrendingUp,
  UserCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { requireAdmin } from "@/app/actions/auth";
import { PrintReportButton } from "@/components/PrintReportButton";
import { VenueTabs } from "@/components/VenueTabs";
import { parseVenueParam } from "@/lib/admin-venue";
import { db } from "@/lib/db";
import { categories, users } from "@/lib/db/schema";
import {
  defaultReportRange,
  inputDate,
  toDateTimeLocalValue,
} from "@/lib/reports/filters";
import { getReportSummary } from "@/lib/reports/summary";
import { formatDateTime, formatMoney, getVenueName } from "@/lib/venues";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    venue?: string;
    from?: string;
    to?: string;
    q?: string;
    waiter?: string;
    cashier?: string;
    payment?: string;
    saleType?: string;
    category?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const venue = parseVenueParam(sp.venue);
  const summary = getReportSummary({
    venue,
    from: sp.from,
    to: sp.to,
    q: sp.q,
    waiter: sp.waiter,
    cashier: sp.cashier,
    payment: sp.payment,
    saleType: sp.saleType,
    category: sp.category,
  });

  const {
    from,
    to,
    fromSql,
    toSql,
    q,
    waiterId,
    cashierId,
    categoryId,
    payment,
    saleType,
    rows,
    itemSales,
    categorySales,
    totalSales,
    totalItems,
    cashTotal,
    cardTotal,
    averageTicket,
    tableSales,
    quickSales,
    openCount,
    openTotal,
    cancelledCount,
    waiterPerformance,
    cashierPerformance,
  } = summary;

  const printFilters = {
    venue,
    from,
    to,
    q,
    waiter: sp.waiter,
    cashier: sp.cashier,
    payment: sp.payment,
    saleType: sp.saleType,
    category: sp.category,
  };

  const now = new Date();
  const today = inputDate(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = inputDate(yesterdayDate);
  const last7Date = new Date(now);
  last7Date.setDate(last7Date.getDate() - 6);
  const last7 = inputDate(last7Date);

  const reportCategories = db
    .select()
    .from(categories)
    .where(eq(categories.venueId, venue))
    .all();

  const waiters = db
    .select({ id: users.id, name: users.name, active: users.active })
    .from(users)
    .where(eq(users.role, "waiter"))
    .all();
  const cashiers = db
    .select({ id: users.id, name: users.name, active: users.active })
    .from(users)
    .where(eq(users.role, "cashier"))
    .all();

  const activeFilterCount = [
    waiterId,
    cashierId,
    categoryId,
    payment !== "all",
    saleType !== "all",
    q,
  ].filter(Boolean).length;

  const presetHref = (presetFrom: string, presetTo: string) => {
    const params = new URLSearchParams({ venue, from: presetFrom, to: presetTo });
    return `/admin/reports?${params.toString()}`;
  };

  const todayRange = defaultReportRange(now);
  const isTodayPreset =
    from === todayRange.from && to === todayRange.to;
  const isYesterdayPreset =
    from === `${yesterday}T00:00` && to === `${yesterday}T23:59`;

  return (
    <div className="space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-neutral via-slate-800 to-primary p-5 text-neutral-content shadow-xl sm:p-7">
        <div className="absolute -bottom-24 -left-12 size-56 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white/60">
              <WalletCards className="size-4" />
              إقفال ومراجعة المبيعات
            </div>
            <h2 className="text-2xl font-black sm:text-3xl">
              تقرير {getVenueName(venue)}
            </h2>
            <p className="mt-1 text-sm text-white/60">
              من {formatDateTime(fromSql)} إلى {formatDateTime(toSql)} —{" "}
              {rows.length} فاتورة مدفوعة
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <PrintReportButton filters={printFilters} />
            <Link
              href={presetHref(`${today}T00:00`, `${today}T23:59`)}
              className={`btn btn-sm rounded-xl ${
                isTodayPreset
                  ? "border-white bg-white text-neutral"
                  : "border-white/15 bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              اليوم
            </Link>
            <Link
              href={presetHref(`${yesterday}T00:00`, `${yesterday}T23:59`)}
              className={`btn btn-sm rounded-xl ${
                isYesterdayPreset
                  ? "border-white bg-white text-neutral"
                  : "border-white/15 bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              أمس
            </Link>
            <Link
              href={presetHref(`${last7}T00:00`, `${today}T23:59`)}
              className="btn btn-sm rounded-xl border-white/15 bg-white/10 text-white hover:bg-white/20"
            >
              آخر 7 أيام
            </Link>
            <Link
              href={`/admin/reports?venue=${venue}`}
              className="btn btn-sm rounded-xl border-white/15 bg-white/10 text-white hover:bg-white/20"
            >
              <RotateCcw className="size-3.5" />
              مسح الفلاتر
            </Link>
          </div>
        </div>
      </section>

      <VenueTabs basePath="/admin/reports" venue={venue} />

      <details className="premium-card group card" open={activeFilterCount > 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5">
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Filter className="size-5" />
            </span>
            <span>
              <span className="block font-black">فلاتر التقرير</span>
              <span className="block text-xs text-base-content/45">
                التاريخ والوقت، الموظف، طريقة الدفع، ونوع البيع
              </span>
            </span>
          </span>
          {activeFilterCount > 0 ? (
            <span className="badge badge-primary">
              {activeFilterCount} فلتر نشط
            </span>
          ) : (
            <span className="badge badge-ghost">عرض الفلاتر</span>
          )}
        </summary>
        <form className="grid gap-3 border-t border-base-300/60 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
          <input type="hidden" name="venue" value={venue} />
          <label className="form-control">
            <span className="label-text mb-1.5 font-bold">من تاريخ ووقت</span>
            <input
              type="datetime-local"
              name="from"
              defaultValue={toDateTimeLocalValue(from, "start")}
              className="input input-bordered w-full"
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1.5 font-bold">إلى تاريخ ووقت</span>
            <input
              type="datetime-local"
              name="to"
              defaultValue={toDateTimeLocalValue(to, "end")}
              className="input input-bordered w-full"
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1.5 font-bold">السفرادجي</span>
            <select
              name="waiter"
              defaultValue={waiterId ?? ""}
              className="select select-bordered w-full"
            >
              <option value="">كل السفرادجية</option>
              {waiters.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {!person.active ? " (معطّل)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="form-control">
            <span className="label-text mb-1.5 font-bold">الكاشير</span>
            <select
              name="cashier"
              defaultValue={cashierId ?? ""}
              className="select select-bordered w-full"
            >
              <option value="">كل الكاشير</option>
              {cashiers.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {!person.active ? " (معطّل)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="form-control">
            <span className="label-text mb-1.5 font-bold">طريقة الدفع</span>
            <select
              name="payment"
              defaultValue={payment}
              className="select select-bordered w-full"
            >
              <option value="all">كل طرق الدفع</option>
              <option value="cash">نقدي</option>
              <option value="card">بطاقة</option>
            </select>
          </label>
          <label className="form-control">
            <span className="label-text mb-1.5 font-bold">نوع البيع</span>
            <select
              name="saleType"
              defaultValue={saleType}
              className="select select-bordered w-full"
            >
              <option value="all">طاولات وبيع سريع</option>
              <option value="table">طاولات فقط</option>
              <option value="quick">بيع سريع فقط</option>
            </select>
          </label>
          <label className="form-control">
            <span className="label-text mb-1.5 font-bold">المجموعة</span>
            <select
              name="category"
              defaultValue={categoryId ?? ""}
              className="select select-bordered w-full"
            >
              <option value="">كل المجموعات</option>
              {reportCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-control">
            <span className="label-text mb-1.5 font-bold">بحث عن صنف</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="مثال: كيك"
              className="input input-bordered w-full"
            />
          </label>
          <div className="flex items-end gap-2 xl:col-span-4">
            <button type="submit" className="btn btn-primary flex-1 gap-2 sm:flex-none">
              <Search className="size-4" />
              تطبيق الفلاتر
            </button>
            <Link
              href={`/admin/reports?venue=${venue}&from=${from}&to=${to}`}
              className="btn btn-ghost"
            >
              إعادة ضبط
            </Link>
          </div>
        </form>
      </details>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "إجمالي المبيعات",
            value: totalSales,
            icon: TrendingUp,
            color: "bg-primary/10 text-primary",
            hint: `${rows.length} فاتورة`,
          },
          {
            label: "متوسط الفاتورة",
            value: averageTicket,
            icon: ReceiptText,
            color: "bg-secondary/10 text-secondary",
            hint: `${totalItems} قطعة مباعة`,
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
              <span
                className={`grid size-12 shrink-0 place-items-center rounded-2xl ${color}`}
              >
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="premium-card card">
          <div className="card-body gap-1 p-5">
            <span className="mb-2 grid size-10 place-items-center rounded-xl bg-info/10 text-info">
              <ShoppingBag className="size-5" />
            </span>
            <p className="text-xs font-bold text-base-content/45">نوع المبيعات</p>
            <p className="text-xl font-black">
              {tableSales} طاولات / {quickSales} سريع
            </p>
          </div>
        </div>
        <div className="premium-card card">
          <div className="card-body gap-1 p-5">
            <span className="mb-2 grid size-10 place-items-center rounded-xl bg-warning/10 text-warning">
              <Clock3 className="size-5" />
            </span>
            <p className="text-xs font-bold text-base-content/45">
              فواتير مفتوحة الآن
            </p>
            <p className="text-xl font-black">{openCount} فاتورة</p>
            <p className="text-xs text-base-content/45">{formatMoney(openTotal)}</p>
          </div>
        </div>
        <div className="premium-card card">
          <div className="card-body gap-1 p-5">
            <span className="mb-2 grid size-10 place-items-center rounded-xl bg-error/10 text-error">
              <AlertTriangle className="size-5" />
            </span>
            <p className="text-xs font-bold text-base-content/45">
              فواتير ملغاة في الفترة
            </p>
            <p className="text-xl font-black">{cancelledCount} فاتورة</p>
          </div>
        </div>
        <div className="premium-card card">
          <div className="card-body gap-1 p-5">
            <span className="mb-2 grid size-10 place-items-center rounded-xl bg-success/10 text-success">
              <CircleDollarSign className="size-5" />
            </span>
            <p className="text-xs font-bold text-base-content/45">مطابقة التحصيل</p>
            <p className="text-xl font-black">{formatMoney(cashTotal + cardTotal)}</p>
            <p className="text-xs text-success">نقدي + بطاقة = الإجمالي</p>
          </div>
        </div>
      </section>

      {openCount > 0 ? (
        <div className="alert alert-warning rounded-2xl">
          <AlertTriangle className="size-5" />
          <div>
            <p className="font-black">يوجد {openCount} فاتورة مفتوحة</p>
            <p className="text-sm">
              راجعها قبل إقفال اليوم. قيمتها الحالية {formatMoney(openTotal)}.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="premium-card card">
          <div className="card-body gap-4 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <UsersRound className="size-5 text-primary" />
              <div>
                <h3 className="font-black">أداء السفرادجية</h3>
                <p className="text-xs text-base-content/45">
                  عدد الفواتير وقيمة مبيعات كل سفرادجي
                </p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-base-300/60">
              <table className="table table-zebra">
                <thead>
                  <tr>
                    <th>السفرادجي</th>
                    <th>الفواتير</th>
                    <th>المبيعات</th>
                  </tr>
                </thead>
                <tbody>
                  {waiterPerformance.map((person) => (
                    <tr key={person.id}>
                      <td className="font-bold">{person.name}</td>
                      <td>{person.invoices}</td>
                      <td className="font-black text-primary">
                        {formatMoney(person.sales)}
                      </td>
                    </tr>
                  ))}
                  {waiterPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center opacity-60">
                        لا توجد مبيعات مرتبطة بسفرادجي
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="premium-card card">
          <div className="card-body gap-4 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <UserCheck className="size-5 text-secondary" />
              <div>
                <h3 className="font-black">تحصيل الكاشير</h3>
                <p className="text-xs text-base-content/45">
                  النقدي والبطاقة لكل كاشير
                </p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-base-300/60">
              <table className="table table-zebra">
                <thead>
                  <tr>
                    <th>الكاشير</th>
                    <th>الفواتير</th>
                    <th>نقدي</th>
                    <th>بطاقة</th>
                    <th>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {cashierPerformance.map((person) => (
                    <tr key={person.id}>
                      <td className="font-bold">{person.name}</td>
                      <td>{person.invoices}</td>
                      <td>{formatMoney(person.cash)}</td>
                      <td>{formatMoney(person.card)}</td>
                      <td className="font-black text-secondary">
                        {formatMoney(person.sales)}
                      </td>
                    </tr>
                  ))}
                  {cashierPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center opacity-60">
                        لا توجد عمليات تحصيل
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="premium-card card">
          <div className="card-body gap-4 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <Boxes className="size-5 text-primary" />
            <div>
              <h3 className="font-black">حسب الصنف</h3>
              <p className="text-xs text-base-content/45">
                الكمية المباعة والإيراد لكل صنف
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>الكمية المباعة</th>
                  <th>الإيراد</th>
                </tr>
              </thead>
              <tbody>
                {itemSales.map((row) => (
                  <tr key={`${row.itemId ?? "x"}-${row.itemName}`}>
                    <td className="font-bold">{row.itemName}</td>
                    <td className="font-black text-primary">{row.qty}</td>
                    <td>{formatMoney(row.revenue)}</td>
                  </tr>
                ))}
                {itemSales.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center opacity-60">
                      لا توجد مبيعات أصناف في هذه الفترة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        </section>

        <section className="premium-card card">
          <div className="card-body gap-4 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <Tags className="size-5 text-secondary" />
            <div>
              <h3 className="font-black">حسب المجموعة (التصنيف)</h3>
              <p className="text-xs text-base-content/45">
                مثال: حلويات، مشروبات، قهوة
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>المجموعة</th>
                  <th>الكمية المباعة</th>
                  <th>الإيراد</th>
                </tr>
              </thead>
              <tbody>
                {categorySales.map((row) => (
                  <tr key={row.categoryId ?? row.categoryName}>
                    <td className="font-bold">{row.categoryName}</td>
                    <td className="font-black text-secondary">{row.qty}</td>
                    <td>{formatMoney(row.revenue)}</td>
                  </tr>
                ))}
                {categorySales.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center opacity-60">
                      لا توجد بيانات مجموعات في هذه الفترة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        </section>
      </div>

      <section className="premium-card card">
        <div className="card-body gap-4 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <FileText className="size-5 text-primary" />
            <div>
              <h3 className="font-black">سجل الفواتير</h3>
              <p className="text-xs text-base-content/45">
                كل الفواتير المطابقة للفلاتر للمراجعة النهائية
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الطاولة</th>
                  <th>السفرادجي</th>
                  <th>الكاشير</th>
                  <th>الدفع</th>
                  <th>المجموع</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-bold">
                      <Link
                        href={`/admin/invoices/${row.id}`}
                        className="link link-hover"
                      >
                        #{row.id}
                      </Link>
                    </td>
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
