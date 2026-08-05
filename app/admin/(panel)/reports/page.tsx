import {
  and,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  like,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
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
import { VenueTabs } from "@/components/VenueTabs";
import { parseVenueParam } from "@/lib/admin-venue";
import { db } from "@/lib/db";
import {
  categories,
  items,
  orderItems,
  orders,
  tables,
  users,
} from "@/lib/db/schema";
import { formatDateTime, formatMoney, getVenueName } from "@/lib/venues";

function inputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseId(value?: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

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
  const q = (sp.q ?? "").trim();
  const waiterId = parseId(sp.waiter);
  const cashierId = parseId(sp.cashier);
  const categoryId = parseId(sp.category);
  const payment =
    sp.payment === "cash" || sp.payment === "card" ? sp.payment : "all";
  const saleType =
    sp.saleType === "table" || sp.saleType === "quick"
      ? sp.saleType
      : "all";

  const now = new Date();
  const today = inputDate(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = inputDate(yesterdayDate);
  const last7Date = new Date(now);
  last7Date.setDate(last7Date.getDate() - 6);
  const last7 = inputDate(last7Date);
  const from = sp.from || today;
  const to = sp.to || today;

  const waiter = alias(users, "waiter");
  const cashier = alias(users, "cashier");

  const staff = db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .where(or(eq(users.role, "waiter"), eq(users.role, "cashier")))
    .all();
  const waiters = staff.filter((person) => person.role === "waiter");
  const cashiers = staff.filter((person) => person.role === "cashier");
  const reportCategories = db
    .select()
    .from(categories)
    .where(eq(categories.venueId, venue))
    .all();

  const orderConditions: SQL[] = [
    eq(orders.venueId, venue),
    eq(orders.status, "paid"),
    gte(orders.paidAt, `${from} 00:00:00`),
    lte(orders.paidAt, `${to} 23:59:59`),
  ];
  if (waiterId) orderConditions.push(eq(orders.waiterId, waiterId));
  if (cashierId) orderConditions.push(eq(orders.cashierId, cashierId));
  if (payment !== "all") {
    orderConditions.push(eq(orders.paymentMethod, payment));
  }
  if (saleType === "table") orderConditions.push(isNotNull(orders.tableId));
  if (saleType === "quick") orderConditions.push(isNull(orders.tableId));

  const itemConditions: SQL[] = [...orderConditions];
  if (categoryId) itemConditions.push(eq(items.categoryId, categoryId));
  if (q) itemConditions.push(like(orderItems.itemName, `%${q}%`));

  const matchingOrderIds =
    categoryId || q
      ? new Set(
          db
            .selectDistinct({ orderId: orderItems.orderId })
            .from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(items, eq(orderItems.itemId, items.id))
            .where(and(...itemConditions))
            .all()
            .map((row) => row.orderId),
        )
      : null;

  const allPaidRows = db
    .select({
      id: orders.id,
      total: orders.total,
      paymentMethod: orders.paymentMethod,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      tableName: tables.name,
      waiterName: waiter.name,
      cashierName: cashier.name,
      waiterId: orders.waiterId,
      cashierId: orders.cashierId,
      tableId: orders.tableId,
    })
    .from(orders)
    .leftJoin(tables, eq(orders.tableId, tables.id))
    .leftJoin(waiter, eq(orders.waiterId, waiter.id))
    .leftJoin(cashier, eq(orders.cashierId, cashier.id))
    .where(and(...orderConditions))
    .orderBy(desc(orders.paidAt))
    .all();

  const rows = matchingOrderIds
    ? allPaidRows.filter((row) => matchingOrderIds.has(row.id))
    : allPaidRows;

  const itemSales = db
    .select({
      itemId: orderItems.itemId,
      itemName: orderItems.itemName,
      qty: sql<number>`sum(${orderItems.qty})`.mapWith(Number),
      revenue: sql<number>`sum(${orderItems.lineTotal})`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(items, eq(orderItems.itemId, items.id))
    .where(and(...itemConditions))
    .groupBy(orderItems.itemId, orderItems.itemName)
    .orderBy(desc(sql`sum(${orderItems.qty})`))
    .all();

  const categorySales = db
    .select({
      categoryId: categories.id,
      categoryName: sql<string>`coalesce(${categories.name}, 'غير مصنف')`,
      qty: sql<number>`sum(${orderItems.qty})`.mapWith(Number),
      revenue: sql<number>`sum(${orderItems.lineTotal})`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(items, eq(orderItems.itemId, items.id))
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .where(and(...itemConditions))
    .groupBy(categories.id, categories.name)
    .orderBy(desc(sql`sum(${orderItems.qty})`))
    .all();

  const totalSales = rows.reduce((s, r) => s + r.total, 0);
  const totalItems = itemSales.reduce((sum, row) => sum + row.qty, 0);
  const cashTotal = rows
    .filter((r) => r.paymentMethod === "cash")
    .reduce((s, r) => s + r.total, 0);
  const cardTotal = rows
    .filter((r) => r.paymentMethod === "card")
    .reduce((s, r) => s + r.total, 0);
  const averageTicket = rows.length ? totalSales / rows.length : 0;
  const tableSales = rows.filter((row) => row.tableId !== null).length;
  const quickSales = rows.length - tableSales;

  const openRows = db
    .select({ total: orders.total })
    .from(orders)
    .where(and(eq(orders.venueId, venue), eq(orders.status, "open")))
    .all();
  const openTotal = openRows.reduce((sum, row) => sum + row.total, 0);

  const cancelledConditions: SQL[] = [
    eq(orders.venueId, venue),
    eq(orders.status, "cancelled"),
    gte(orders.createdAt, `${from} 00:00:00`),
    lte(orders.createdAt, `${to} 23:59:59`),
  ];
  if (waiterId) cancelledConditions.push(eq(orders.waiterId, waiterId));
  if (cashierId) cancelledConditions.push(eq(orders.cashierId, cashierId));
  const cancelledCount = db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(orders)
    .where(and(...cancelledConditions))
    .get()?.count ?? 0;

  const waiterPerformance = waiters
    .map((person) => {
      const personRows = rows.filter((row) => row.waiterId === person.id);
      return {
        id: person.id,
        name: person.name,
        invoices: personRows.length,
        sales: personRows.reduce((sum, row) => sum + row.total, 0),
      };
    })
    .filter((person) => person.invoices > 0)
    .sort((a, b) => b.sales - a.sales);

  const cashierPerformance = cashiers
    .map((person) => {
      const personRows = rows.filter((row) => row.cashierId === person.id);
      return {
        id: person.id,
        name: person.name,
        invoices: personRows.length,
        sales: personRows.reduce((sum, row) => sum + row.total, 0),
        cash: personRows
          .filter((row) => row.paymentMethod === "cash")
          .reduce((sum, row) => sum + row.total, 0),
        card: personRows
          .filter((row) => row.paymentMethod === "card")
          .reduce((sum, row) => sum + row.total, 0),
      };
    })
    .filter((person) => person.invoices > 0)
    .sort((a, b) => b.sales - a.sales);

  const activeFilterCount = [
    waiterId,
    cashierId,
    categoryId,
    payment !== "all",
    saleType !== "all",
    q,
  ].filter(Boolean).length;

  const presetHref = (presetFrom: string, presetTo: string) =>
    `/admin/reports?venue=${venue}&from=${presetFrom}&to=${presetTo}`;

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
              من {from} إلى {to} — {rows.length} فاتورة مدفوعة
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Link
              href={presetHref(today, today)}
              className={`btn btn-sm rounded-xl ${
                from === today && to === today
                  ? "border-white bg-white text-neutral"
                  : "border-white/15 bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              اليوم
            </Link>
            <Link
              href={presetHref(yesterday, yesterday)}
              className={`btn btn-sm rounded-xl ${
                from === yesterday && to === yesterday
                  ? "border-white bg-white text-neutral"
                  : "border-white/15 bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              أمس
            </Link>
            <Link
              href={presetHref(last7, today)}
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
                التاريخ، الموظف، طريقة الدفع، ونوع البيع
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
            <span className="label-text mb-1.5 font-bold">من تاريخ</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="input input-bordered w-full"
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1.5 font-bold">إلى تاريخ</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
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
            <p className="text-xl font-black">{openRows.length} فاتورة</p>
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

      {openRows.length > 0 ? (
        <div className="alert alert-warning rounded-2xl">
          <AlertTriangle className="size-5" />
          <div>
            <p className="font-black">يوجد {openRows.length} فاتورة مفتوحة</p>
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
                    <td className="font-bold">#{row.id}</td>
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
