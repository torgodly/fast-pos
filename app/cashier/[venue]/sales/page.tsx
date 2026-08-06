import Link from "next/link";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  ArrowRight,
  Banknote,
  CreditCard,
  History,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { notFound } from "next/navigation";
import { requireCashier } from "@/app/actions/auth";
import { PosHeader } from "@/components/PosHeader";
import { ReprintReceiptButton } from "@/components/ReprintReceiptButton";
import { db } from "@/lib/db";
import { orders, tables, users } from "@/lib/db/schema";
import { formatDateTime, formatMoney, isVenueId } from "@/lib/venues";

function localYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolveSalesDay(searchParams: { day?: string; date?: string }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)) {
    return {
      from: searchParams.date,
      to: searchParams.date,
      dayKey: `date:${searchParams.date}`,
      label: searchParams.date,
    };
  }

  if (searchParams.day === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const value = localYmd(y);
    return { from: value, to: value, dayKey: "yesterday", label: "أمس" };
  }

  if (searchParams.day === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return {
      from: localYmd(start),
      to: localYmd(today),
      dayKey: "week",
      label: "آخر 7 أيام",
    };
  }

  const value = localYmd(today);
  return { from: value, to: value, dayKey: "today", label: "اليوم" };
}

export default async function CashierSalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ venue: string }>;
  searchParams: Promise<{ day?: string; date?: string }>;
}) {
  const { venue } = await params;
  if (!isVenueId(venue)) notFound();
  const session = await requireCashier(venue);
  const sp = await searchParams;
  const range = resolveSalesDay(sp);
  const waiter = alias(users, "waiter");

  const sales = db
    .select({
      id: orders.id,
      total: orders.total,
      paymentMethod: orders.paymentMethod,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      tableName: tables.name,
      waiterName: waiter.name,
      tableId: orders.tableId,
    })
    .from(orders)
    .leftJoin(tables, eq(orders.tableId, tables.id))
    .leftJoin(waiter, eq(orders.waiterId, waiter.id))
    .where(
      and(
        eq(orders.venueId, venue),
        eq(orders.status, "paid"),
        eq(orders.cashierId, session.userId),
        gte(orders.paidAt, `${range.from} 00:00:00`),
        lte(orders.paidAt, `${range.to} 23:59:59`),
      ),
    )
    .orderBy(desc(orders.paidAt))
    .all();

  const totalAmount = sales.reduce((sum, row) => sum + row.total, 0);
  const cashTotal = sales
    .filter((row) => row.paymentMethod === "cash")
    .reduce((sum, row) => sum + row.total, 0);
  const cardTotal = sales
    .filter((row) => row.paymentMethod === "card")
    .reduce((sum, row) => sum + row.total, 0);

  const dayLinks: Array<{ key: string; label: string; href: string }> = [
    {
      key: "today",
      label: "اليوم",
      href: `/cashier/${venue}/sales?day=today`,
    },
    {
      key: "yesterday",
      label: "أمس",
      href: `/cashier/${venue}/sales?day=yesterday`,
    },
    {
      key: "week",
      label: "7 أيام",
      href: `/cashier/${venue}/sales?day=week`,
    },
  ];

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <PosHeader venueId={venue} name={session.name} roleLabel="كاشير" />
      <main className="page-shell flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="premium-card flex flex-col gap-4 rounded-3xl p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <History className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-black sm:text-2xl">مبيعاتي</h2>
              <p className="text-xs text-base-content/45 sm:text-sm">
                {range.label} · {sales.length} فاتورة
              </p>
            </div>
          </div>
          <Link
            href={`/cashier/${venue}`}
            className="btn btn-ghost btn-sm gap-2 rounded-xl sm:btn-md"
          >
            <ArrowRight className="size-4" />
            رجوع للكاشير
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {dayLinks.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className={`btn btn-sm rounded-xl ${
                range.dayKey === link.key ? "btn-primary" : "btn-ghost"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="premium-card rounded-2xl p-4">
            <p className="text-xs font-bold text-base-content/45">الإجمالي</p>
            <p className="mt-1 text-2xl font-black text-primary">
              {formatMoney(totalAmount)}
            </p>
            <p className="mt-1 text-xs text-base-content/40">
              {sales.length} فاتورة
            </p>
          </div>
          <div className="premium-card rounded-2xl p-4">
            <p className="flex items-center gap-1 text-xs font-bold text-base-content/45">
              <Banknote className="size-3.5" />
              نقدي
            </p>
            <p className="mt-1 text-xl font-black">{formatMoney(cashTotal)}</p>
          </div>
          <div className="premium-card rounded-2xl p-4">
            <p className="flex items-center gap-1 text-xs font-bold text-base-content/45">
              <CreditCard className="size-3.5" />
              بطاقة
            </p>
            <p className="mt-1 text-xl font-black">{formatMoney(cardTotal)}</p>
          </div>
        </div>

        <div className="space-y-3">
          {sales.map((sale) => (
            <article
              key={sale.id}
              className="premium-card flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-success/10 text-success">
                  <ReceiptText className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-base-content/40">
                    فاتورة #{sale.id}
                  </p>
                  <h3 className="truncate text-lg font-black">
                    {sale.tableName ?? "بيع سريع"}
                  </h3>
                  <p className="mt-1 text-xs text-base-content/45">
                    {formatDateTime(sale.paidAt ?? sale.createdAt)}
                    {sale.waiterName ? ` · ${sale.waiterName}` : ""}
                  </p>
                  <span
                    className={`badge badge-sm mt-2 ${
                      sale.paymentMethod === "cash"
                        ? "badge-success badge-soft"
                        : "badge-info badge-soft"
                    }`}
                  >
                    {sale.paymentMethod === "cash" ? "نقدي" : "بطاقة"}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                <p className="text-xl font-black text-primary">
                  {formatMoney(sale.total)}
                </p>
                <ReprintReceiptButton orderId={sale.id} venueId={venue} />
              </div>
            </article>
          ))}
        </div>

        {sales.length === 0 && (
          <div className="premium-card rounded-3xl p-12 text-center">
            <span className="mx-auto mb-4 grid size-16 place-items-center rounded-3xl bg-base-200 text-base-content/25">
              <WalletCards className="size-8" />
            </span>
            <p className="text-lg font-black">لا توجد مبيعات في {range.label}</p>
            <p className="mt-1 text-sm text-base-content/45">
              ستظهر هنا الفواتير التي تحصلها
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
