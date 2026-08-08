import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { Clock3, History, Plus } from "lucide-react";
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

  const waitingNext =
    !shiftStatus.open &&
    !shiftStatus.dayComplete &&
    shiftStatus.nextShiftNumber === 2;
  const shiftTitle = shiftStatus.open
    ? `وردية مفتوحة · ${shiftStatus.open.shiftNumber}`
    : shiftStatus.dayComplete
      ? "انتهى يوم العمل"
      : waitingNext
        ? "بانتظار فتح الوردية التالية"
        : "لا توجد وردية مفتوحة";
  const shiftDetail = shiftStatus.open
    ? null
    : shiftStatus.dayComplete
      ? "الوردية التالية غداً"
      : isMainCashier
        ? waitingNext
          ? `افتح الوردية ${shiftStatus.nextShiftNumber}`
          : "افتح الوردية قبل العمل"
        : "انتظر الكاشير الرئيسي";

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
      <main className="page-shell flex flex-1 flex-col gap-2 p-2 sm:gap-3 sm:p-3 lg:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-base-300/70 bg-base-100 px-3 py-2">
          <p className="text-sm font-black">
            فواتير مفتوحة · {openOrders.length}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {canSell ? (
              <Link
                href={`/cashier/${venue}/quick`}
                className="btn btn-primary btn-sm gap-1.5 rounded-lg"
              >
                <Plus className="size-4" />
                بيع سريع
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5 rounded-lg"
                disabled
              >
                <Plus className="size-4" />
                بيع سريع
              </button>
            )}
            <Link
              href={`/cashier/${venue}/sales`}
              className="btn btn-ghost btn-sm gap-1.5 rounded-lg"
            >
              <History className="size-4" />
              مبيعاتي
            </Link>
            {isMainCashier ? (
              <Link
                href={`/cashier/${venue}/shift`}
                className="btn btn-ghost btn-sm gap-1.5 rounded-lg"
              >
                <Clock3 className="size-4" />
                الوردية
              </Link>
            ) : null}
          </div>
        </div>

        <div
          className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
            shiftStatus.open
              ? "border-success/30 bg-success/10 text-success"
              : shiftStatus.dayComplete
                ? "border-info/30 bg-info/10 text-info"
                : "border-warning/30 bg-warning/10 text-warning-content"
          }`}
        >
          <Clock3 className="size-4 shrink-0" />
          <span className="font-black">{shiftTitle}</span>
          {shiftDetail ? (
            <span className="opacity-80">— {shiftDetail}</span>
          ) : null}
          {isMainCashier && !shiftStatus.open && !shiftStatus.dayComplete ? (
            <Link
              href={`/cashier/${venue}/shift`}
              className="btn btn-xs ms-auto rounded-lg"
            >
              فتح
            </Link>
          ) : null}
        </div>

        {!hasCheckout ? (
          <div className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm font-bold text-error">
            {stationCtx.error}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {openOrders.map((order) => (
            <Link
              key={order.id}
              href={
                canSell
                  ? `/cashier/${venue}/order/${order.id}`
                  : `/cashier/${venue}`
              }
              className={`flex items-center justify-between gap-3 rounded-xl border border-base-300/70 bg-base-100 px-3 py-3 ${
                canSell
                  ? "hover:border-primary/40"
                  : "pointer-events-none opacity-50"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate font-black">
                  #{order.id} · {order.tableName ?? "بيع سريع"}
                </p>
                <p className="truncate text-xs text-base-content/45">
                  {order.waiterName ?? "—"}
                </p>
              </div>
              <p className="shrink-0 text-base font-black text-primary">
                {formatMoney(order.total)}
              </p>
            </Link>
          ))}
        </div>

        {openOrders.length === 0 ? (
          <p className="py-10 text-center text-sm text-base-content/45">
            لا توجد فواتير مفتوحة
          </p>
        ) : null}
      </main>
    </div>
  );
}
