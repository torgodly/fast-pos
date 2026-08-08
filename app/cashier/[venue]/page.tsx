import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  ArrowLeft,
  Clock3,
  History,
  Plus,
  ReceiptText,
  ShoppingBag,
  UserRound,
  WalletCards,
} from "lucide-react";
import { notFound } from "next/navigation";
import { requireCashier } from "@/app/actions/auth";
import { getCashierStationContext } from "@/app/actions/station";
import { PosHeader } from "@/components/PosHeader";
import { db } from "@/lib/db";
import { orders, tables, users } from "@/lib/db/schema";
import { getCashierShiftStatus } from "@/lib/shifts/core";
import { formatMoney, isVenueId } from "@/lib/venues";

export default async function CashierHomePage({
  params,
}: {
  params: Promise<{ venue: string }>;
}) {
  const { venue } = await params;
  if (!isVenueId(venue)) notFound();
  const session = await requireCashier(venue);
  const waiter = alias(users, "waiter");
  const me = db.select().from(users).where(eq(users.id, session.userId)).get();
  const isMainCashier = !!me?.isMainCashier;

  const stationCtx = await getCashierStationContext(venue);
  const hasCheckout = !("error" in stationCtx);
  const shiftStatus = getCashierShiftStatus(venue);
  const canSell = hasCheckout && !!shiftStatus.open;

  const openOrders = db
    .select({
      id: orders.id,
      total: orders.total,
      createdAt: orders.createdAt,
      tableName: tables.name,
      waiterName: waiter.name,
      tableId: orders.tableId,
    })
    .from(orders)
    .leftJoin(tables, eq(orders.tableId, tables.id))
    .leftJoin(waiter, eq(orders.waiterId, waiter.id))
    .where(and(eq(orders.venueId, venue), eq(orders.status, "open")))
    .all();

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <PosHeader venueId={venue} name={session.name} roleLabel="كاشير" />
      <main className="page-shell flex-1 space-y-4 p-3 sm:space-y-5 sm:p-5 lg:p-6">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-neutral via-slate-800 to-primary p-4 text-neutral-content shadow-xl sm:rounded-3xl sm:p-6">
          <div className="absolute -bottom-24 -left-12 size-56 rounded-full bg-white/5" />
          <div className="relative space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2 text-sm font-bold text-white/60">
                  <WalletCards className="size-4" />
                  شاشة الكاشير
                </div>
                <h2 className="text-xl font-black sm:text-2xl">
                  الفواتير المفتوحة
                </h2>
                <p className="mt-1 text-sm text-white/55">
                  {openOrders.length} فاتورة بانتظار التحصيل
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canSell ? (
                  <Link
                    href={`/cashier/${venue}/quick`}
                    className="btn border-white/15 bg-white text-neutral hover:bg-white/90"
                  >
                    <Plus className="size-4" />
                    بيع سريع
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn border-white/15 bg-white/40 text-neutral"
                    disabled
                  >
                    <Plus className="size-4" />
                    بيع سريع
                  </button>
                )}
                <Link
                  href={`/cashier/${venue}/sales`}
                  className="btn border-white/15 bg-white/10 text-white hover:bg-white/20"
                >
                  <History className="size-4" />
                  مبيعاتي
                </Link>
                {isMainCashier ? (
                  <Link
                    href={`/cashier/${venue}/shift`}
                    className="btn border-white/15 bg-white/10 text-white hover:bg-white/20"
                  >
                    <Clock3 className="size-4" />
                    إدارة الوردية
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <div
          className={`alert rounded-2xl py-3 ${
            shiftStatus.open ? "alert-success" : "alert-warning"
          }`}
        >
          <Clock3 className="size-5" />
          <div className="min-w-0 flex-1">
            <p className="font-black">
              {shiftStatus.open
                ? `الوردية ${shiftStatus.open.shiftNumber} مفتوحة`
                : shiftStatus.dayComplete
                  ? "انتهى يوم العمل"
                  : "لا توجد وردية مفتوحة"}
            </p>
            <p className="text-sm opacity-80">
              {shiftStatus.open
                ? "يمكنك التحصيل والبيع السريع"
                : isMainCashier
                  ? "افتح الوردية من «إدارة الوردية» قبل العمل"
                  : "انتظر الكاشير الرئيسي لفتح الوردية"}
            </p>
          </div>
          {isMainCashier ? (
            <Link
              href={`/cashier/${venue}/shift`}
              className="btn btn-sm shrink-0 rounded-xl"
            >
              إدارة الوردية
            </Link>
          ) : null}
        </div>

        {!hasCheckout ? (
          <div className="alert alert-error rounded-2xl">
            <span className="font-bold">{stationCtx.error}</span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {openOrders.map((order) => (
            <Link
              key={order.id}
              href={
                canSell
                  ? `/cashier/${venue}/order/${order.id}`
                  : `/cashier/${venue}`
              }
              className={`premium-card group card transition duration-200 ${
                canSell
                  ? "hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg"
                  : "pointer-events-none opacity-50"
              }`}
            >
              <div className="card-body gap-4 p-5">
                <div className="flex items-start justify-between">
                  <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <ReceiptText className="size-5" />
                  </span>
                  <span className="badge badge-warning badge-soft badge-sm gap-1">
                    <Clock3 className="size-3" />
                    مفتوحة
                  </span>
                </div>
                <div>
                  <p className="text-xs font-bold text-base-content/40">
                    فاتورة #{order.id}
                  </p>
                  <h3 className="mt-1 text-xl font-black">
                    {order.tableName ?? "بيع سريع"}
                  </h3>
                  <p className="mt-1 flex items-center gap-1 text-xs text-base-content/45">
                    <UserRound className="size-3" />
                    {order.waiterName ?? "بدون سفرادجي"}
                  </p>
                </div>
                <div className="flex items-end justify-between border-t border-base-300/60 pt-4">
                  <div>
                    <p className="text-xs text-base-content/40">الإجمالي</p>
                    <p className="text-xl font-black text-primary">
                      {formatMoney(order.total)}
                    </p>
                  </div>
                  <span className="btn btn-primary btn-sm gap-1.5 rounded-xl">
                    تحصيل
                    <ArrowLeft className="size-3.5 transition group-hover:-translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {openOrders.length === 0 && (
          <div className="premium-card rounded-3xl p-12 text-center">
            <span className="mx-auto mb-4 grid size-16 place-items-center rounded-3xl bg-base-200 text-base-content/25">
              <ShoppingBag className="size-8" />
            </span>
            <p className="text-lg font-black">لا توجد فواتير مفتوحة حالياً</p>
            <p className="mt-1 text-sm text-base-content/45">
              يمكنك بدء بيع سريع من الزر أعلاه
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
