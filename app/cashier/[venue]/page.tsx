import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  ArrowLeft,
  Clock3,
  Plus,
  ReceiptText,
  ShoppingBag,
  UserRound,
  WalletCards,
} from "lucide-react";
import { notFound } from "next/navigation";
import { requireCashier } from "@/app/actions/auth";
import { getSelectedStationId } from "@/app/actions/station";
import { LocalPrintAgentBanner } from "@/components/LocalPrintAgentBanner";
import { PosHeader } from "@/components/PosHeader";
import { StationPicker } from "@/components/StationPicker";
import { db } from "@/lib/db";
import { cashierStations, orders, printers, tables, users } from "@/lib/db/schema";
import { formatMoney, getVenueName, isVenueId } from "@/lib/venues";
import type { VenueId } from "@/lib/types";

export default async function CashierHomePage({
  params,
}: {
  params: Promise<{ venue: string }>;
}) {
  const { venue } = await params;
  if (!isVenueId(venue)) notFound();
  const session = await requireCashier(venue);
  const waiter = alias(users, "waiter");
  const selectedStationId = await getSelectedStationId(venue);

  const stations = db
    .select({
      id: cashierStations.id,
      name: cashierStations.name,
      printerName: printers.name,
      printerHost: printers.host,
      printerConnection: printers.connectionType,
    })
    .from(cashierStations)
    .innerJoin(printers, eq(cashierStations.printerId, printers.id))
    .where(
      and(
        eq(cashierStations.venueId, venue),
        eq(cashierStations.active, true),
        eq(printers.active, true),
        eq(printers.role, "checkout"),
      ),
    )
    .orderBy(asc(cashierStations.name))
    .all();

  const otherVenue: VenueId = venue === "restaurant" ? "cafe" : "restaurant";
  const [{ value: otherVenueStationCount }] = db
    .select({ value: sql<number>`count(*)` })
    .from(cashierStations)
    .innerJoin(printers, eq(cashierStations.printerId, printers.id))
    .where(
      and(
        eq(cashierStations.venueId, otherVenue),
        eq(cashierStations.active, true),
        eq(printers.active, true),
        eq(printers.role, "checkout"),
      ),
    )
    .all();

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

  const hasStation = selectedStationId != null &&
    stations.some((s) => s.id === selectedStationId);

  const selectedStation = stations.find((s) => s.id === selectedStationId);
  const needsLocalPrint = selectedStation?.printerConnection === "local";

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <PosHeader venueId={venue} name={session.name} roleLabel="كاشير" />
      <main className="page-shell flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-neutral via-slate-800 to-primary p-5 text-neutral-content shadow-xl sm:p-7">
          <div className="absolute -bottom-24 -left-12 size-56 rounded-full bg-white/5" />
          <div className="relative space-y-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white/60">
                  <WalletCards className="size-4" />
                  شاشة الكاشير
                </div>
                <h2 className="text-2xl font-black sm:text-3xl">
                  الفواتير المفتوحة
                </h2>
                <p className="mt-1 text-sm text-white/55">
                  {openOrders.length} فاتورة بانتظار التحصيل
                </p>
              </div>
              {hasStation ? (
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
                  title="اختر محطة أولاً"
                >
                  <Plus className="size-4" />
                  بيع سريع
                </button>
              )}
            </div>

            <StationPicker
              venueId={venue}
              venueName={getVenueName(venue)}
              stations={stations}
              selectedStationId={hasStation ? selectedStationId : null}
              otherVenueName={
                stations.length === 0 && otherVenueStationCount > 0
                  ? getVenueName(otherVenue)
                  : undefined
              }
            />

            <LocalPrintAgentBanner
              venueId={venue}
              needsLocalPrint={!!needsLocalPrint}
            />
          </div>
        </section>

        {!hasStation ? (
          <div className="alert alert-warning rounded-2xl">
            <span className="font-bold">
              اختر محطة الكاشير أعلاه قبل التحصيل أو البيع السريع
            </span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
          {openOrders.map((order) => (
            <Link
              key={order.id}
              href={
                hasStation
                  ? `/cashier/${venue}/order/${order.id}`
                  : `/cashier/${venue}`
              }
              className={`premium-card group card transition duration-200 ${
                hasStation
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
              يمكنك بدء بيع سريع من الزر أعلاه بعد اختيار المحطة
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
