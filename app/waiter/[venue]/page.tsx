import Link from "next/link";
import { and, eq } from "drizzle-orm";
import {
  ArrowLeft,
  Armchair,
  Clock3,
  LayoutGrid,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { notFound } from "next/navigation";
import { requireWaiter } from "@/app/actions/auth";
import { OpenTableButton } from "@/components/OpenTableButton";
import { PosHeader } from "@/components/PosHeader";
import { db } from "@/lib/db";
import { orders, tables, users } from "@/lib/db/schema";
import { formatMoney, isVenueId } from "@/lib/venues";

export default async function WaiterFloorPage({
  params,
}: {
  params: Promise<{ venue: string }>;
}) {
  const { venue } = await params;
  if (!isVenueId(venue)) notFound();
  const session = await requireWaiter(venue);

  const venueTables = db
    .select()
    .from(tables)
    .where(and(eq(tables.venueId, venue), eq(tables.active, true)))
    .all();

  const openOrders = db
    .select({
      id: orders.id,
      tableId: orders.tableId,
      total: orders.total,
      waiterId: orders.waiterId,
    })
    .from(orders)
    .where(and(eq(orders.venueId, venue), eq(orders.status, "open")))
    .all();

  const waiters = db.select().from(users).all();
  const occupiedCount = openOrders.filter((o) => o.tableId !== null).length;
  const myTablesCount = openOrders.filter(
    (o) => o.tableId !== null && o.waiterId === session.userId,
  ).length;
  const otherOccupiedCount = occupiedCount - myTablesCount;

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <PosHeader venueId={venue} name={session.name} roleLabel="سفرادجي" />
      <main className="page-shell flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="premium-card flex flex-col gap-5 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
              <LayoutGrid className="size-4" />
              صالة الطاولات
            </div>
            <h2 className="text-2xl font-black sm:text-3xl">اختر طاولة للطلب</h2>
            <p className="mt-1 text-sm text-base-content/45">
              طاولاتك فقط تظهر بالأخضر الواضح
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-2xl border border-base-300 bg-base-100 px-4 py-2.5">
              <p className="text-xs font-bold text-base-content/45">متاحة</p>
              <p className="text-xl font-black text-base-content">
                {venueTables.length - occupiedCount}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-white shadow-md shadow-emerald-900/15">
              <p className="text-xs font-bold text-white/70">طاولاتي</p>
              <p className="text-xl font-black">{myTablesCount}</p>
            </div>
            <div className="rounded-2xl bg-warning/15 px-4 py-2.5">
              <p className="text-xs font-bold text-base-content/45">للآخرين</p>
              <p className="text-xl font-black text-warning-content">
                {otherOccupiedCount}
              </p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {venueTables.map((table) => {
            const order = openOrders.find((o) => o.tableId === table.id);
            const isMyTable = order?.waiterId === session.userId;
            const waiterName = order
              ? waiters.find((w) => w.id === order.waiterId)?.name
              : null;

            if (order) {
              return (
                <Link
                  key={table.id}
                  href={`/waiter/${venue}/order/${order.id}`}
                  className={`group card min-h-44 overflow-hidden border shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-52 ${
                    isMyTable
                      ? "border-emerald-400 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-900/20 ring-2 ring-emerald-300/40"
                      : "border-warning/30 bg-gradient-to-br from-warning/25 to-warning/10"
                  }`}
                >
                  <div className="card-body justify-between p-4 sm:p-5">
                    <div className="flex items-start justify-between">
                      <span
                        className={`grid size-10 place-items-center rounded-xl ${
                          isMyTable
                            ? "bg-white/20 text-white ring-1 ring-white/20"
                            : "bg-warning/20 text-warning-content"
                        }`}
                      >
                        <ReceiptText className="size-5" />
                      </span>
                      <span
                        className={`badge badge-sm gap-1 ${
                          isMyTable
                            ? "border-white/20 bg-white/20 text-white"
                            : "badge-warning"
                        }`}
                      >
                        <Clock3 className="size-3" />
                        {isMyTable ? "طاولتي" : "مشغولة"}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xl font-black sm:text-2xl">
                        {table.name}
                      </h3>
                      <p
                        className={`mt-1 flex items-center gap-1 text-xs ${
                          isMyTable ? "text-white/70" : "text-base-content/50"
                        }`}
                      >
                        <UserRound className="size-3" />
                        {waiterName}
                      </p>
                      <div className="mt-3 flex items-end justify-between">
                        <p
                          className={`font-black sm:text-lg ${
                            isMyTable ? "text-white" : "text-warning-content"
                          }`}
                        >
                          {formatMoney(order.total)}
                        </p>
                        <ArrowLeft
                          className={`size-4 transition group-hover:-translate-x-1 ${
                            isMyTable
                              ? "text-white/70"
                              : "text-warning-content/50"
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            }

            return (
              <OpenTableButton
                key={table.id}
                venueId={venue}
                tableId={table.id}
                tableName={table.name}
              />
            );
          })}
        </div>

        {venueTables.length === 0 && (
          <div className="premium-card rounded-3xl p-12 text-center">
            <Armchair className="mx-auto mb-3 size-10 text-base-content/20" />
            <p className="font-black">لا توجد طاولات</p>
            <p className="text-sm text-base-content/45">
              أضف الطاولات من لوحة الإدارة أولاً
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
