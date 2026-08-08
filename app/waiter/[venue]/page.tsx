import Link from "next/link";
import { and, eq } from "drizzle-orm";
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

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <PosHeader venueId={venue} name={session.name} roleLabel="سفرادجي" />
      <main className="page-shell flex flex-1 flex-col gap-2 p-2 sm:gap-3 sm:p-3 lg:p-4">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-base-300/70 bg-base-100 px-3 py-2">
          <p className="text-sm font-black">الطاولات</p>
          <p className="text-xs text-base-content/50">
            متاحة {venueTables.length - occupiedCount} · طاولاتي {myTablesCount}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {venueTables.map((table) => {
            const order = openOrders.find((o) => o.tableId === table.id);
            const isMyTable = order?.waiterId === session.userId;
            const waiterName = order
              ? waiters.find((w) => w.id === order.waiterId)?.name
              : null;

            if (order) {
              if (!isMyTable) {
                return (
                  <div
                    key={table.id}
                    className="flex min-h-24 flex-col justify-between rounded-xl border border-base-300 bg-base-200/70 px-3 py-2.5 opacity-70"
                    title="طاولة سفرادجي آخر"
                  >
                    <div>
                      <p className="font-black">{table.name}</p>
                      <p className="truncate text-xs text-base-content/50">
                        {waiterName ?? "سفرادجي آخر"}
                      </p>
                    </div>
                    <p className="text-xs font-bold text-base-content/40">
                      غير متاحة
                    </p>
                  </div>
                );
              }

              return (
                <Link
                  key={table.id}
                  href={`/waiter/${venue}/order/${order.id}`}
                  className="flex min-h-24 flex-col justify-between rounded-xl border border-success/40 bg-success/15 px-3 py-2.5"
                >
                  <div>
                    <p className="font-black">{table.name}</p>
                    <p className="truncate text-xs text-base-content/50">
                      طاولتي
                    </p>
                  </div>
                  <p className="text-sm font-black text-primary">
                    {formatMoney(order.total)}
                  </p>
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

        {venueTables.length === 0 ? (
          <p className="py-10 text-center text-sm text-base-content/45">
            لا توجد طاولات
          </p>
        ) : null}
      </main>
    </div>
  );
}
