import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { Boxes, Clock3, History, Plus, TableProperties } from "lucide-react";
import { notFound } from "next/navigation";
import { requireCashier } from "@/app/actions/auth";
import { getCashierStationContext } from "@/app/actions/station";
import { PosHeader } from "@/components/PosHeader";
import { db } from "@/lib/db";
import { customers, orders, tables, users } from "@/lib/db/schema";
import { getOpenShift } from "@/lib/shifts/core";
import { formatMoney, isVenueId } from "@/lib/venues";
import { isCounterMode } from "@/lib/deployment";
import { listPaymentMethods } from "@/lib/payments/store";
import { paymentMethodLabel } from "@/lib/payments/core";

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
  const counterMode = isCounterMode();

  const stationCtx = await getCashierStationContext(venue);
  const hasCheckout = !("error" in stationCtx);
  const openShift = getOpenShift(venue);
  const canSell = hasCheckout && !!openShift;

  const openOrders = db
    .select({
      id: orders.id,
      total: orders.total,
      createdAt: orders.createdAt,
      tableName: tables.name,
      waiterName: waiter.name,
      tableId: orders.tableId,
      paymentMethod: orders.paymentMethod,
      heldAt: orders.heldAt,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(orders)
    .leftJoin(tables, eq(orders.tableId, tables.id))
    .leftJoin(waiter, eq(orders.waiterId, waiter.id))
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(eq(orders.venueId, venue), eq(orders.status, "open")))
    .all();

  const methods = listPaymentMethods();

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <PosHeader
        venueId={venue}
        name={session.name}
        roleLabel="كاشير"
        showExpense={!!openShift}
      />
      <main className="page-shell flex flex-1 flex-col gap-2 p-2 sm:gap-3 sm:p-3 lg:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-base-300/70 bg-base-100 px-3 py-2">
          <p className="text-sm font-black">
            فواتير مفتوحة · {openOrders.length}
            {openShift ? (
              <span className="mr-2 badge badge-success badge-sm font-bold">
                وردية #{openShift.shiftNumber}
              </span>
            ) : null}
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
              <>
                <Link
                  href={`/cashier/${venue}/items`}
                  className="btn btn-ghost btn-sm gap-1.5 rounded-lg"
                >
                  <Boxes className="size-4" />
                  الأصناف
                </Link>
                {counterMode ? null : (
                <Link
                  href={`/cashier/${venue}/tables`}
                  className="btn btn-ghost btn-sm gap-1.5 rounded-lg"
                >
                  <TableProperties className="size-4" />
                  الطاولات
                </Link>
                )}
                <Link
                  href={`/cashier/${venue}/shift`}
                  className="btn btn-ghost btn-sm gap-1.5 rounded-lg"
                >
                  <Clock3 className="size-4" />
                  الوردية
                </Link>
              </>
            ) : null}
          </div>
        </div>

        {!hasCheckout ? (
          <div className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm font-bold text-error">
            {stationCtx.error}
          </div>
        ) : null}

        {hasCheckout && !openShift ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-bold text-warning">
            <span>
              لا توجد وردية مفتوحة — البيع والدفع موقوفان حتى يفتحها الكاشير
              الرئيسي.
            </span>
            {isMainCashier ? (
              <Link
                href={`/cashier/${venue}/shift`}
                className="btn btn-warning btn-xs h-7 min-h-7 gap-1 rounded-md"
              >
                <Clock3 className="size-3.5" />
                افتح الوردية
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {openOrders.map((order) => (
            <Link
              key={order.id}
              href={
                hasCheckout
                  ? `/cashier/${venue}/order/${order.id}`
                  : `/cashier/${venue}`
              }
              className={`flex items-center justify-between gap-3 rounded-xl border bg-base-100 px-3 py-3 ${
                order.heldAt
                  ? "border-warning/50"
                  : "border-base-300/70"
              } ${hasCheckout ? "hover:border-primary/40" : "pointer-events-none opacity-50"}`}
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 truncate font-black">
                  #{order.id} · {order.tableName ?? "بيع سريع"}
                  {order.heldAt ? (
                    <span className="badge badge-warning badge-sm font-bold">
                      آجل · {paymentMethodLabel(order.paymentMethod, methods)}
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-base-content/45">
                  {order.customerName
                    ? `${order.customerName}${order.customerPhone ? ` · ${order.customerPhone}` : ""}`
                    : (order.waiterName ?? "—")}
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
