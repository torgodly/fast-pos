import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowRight, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { requireWaiter } from "@/app/actions/auth";
import { cancelOpenOrder } from "@/app/actions/orders";
import { KitchenConfirmButton } from "@/components/KitchenConfirmButton";
import { OrderMenu } from "@/components/OrderMenu";
import { PosHeader } from "@/components/PosHeader";
import { db } from "@/lib/db";
import {
  categories,
  items,
  orderItems,
  orders,
  tables,
} from "@/lib/db/schema";
import { isVenueId } from "@/lib/venues";

export default async function WaiterOrderPage({
  params,
}: {
  params: Promise<{ venue: string; id: string }>;
}) {
  const { venue, id } = await params;
  if (!isVenueId(venue)) notFound();
  const session = await requireWaiter(venue);
  const orderId = Number(id);

  const order = db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.venueId, venue),
        eq(orders.status, "open"),
      ),
    )
    .get();

  if (!order) notFound();

  const table = order.tableId
    ? db.select().from(tables).where(eq(tables.id, order.tableId)).get()
    : null;

  const cats = db
    .select()
    .from(categories)
    .where(and(eq(categories.venueId, venue), eq(categories.active, true)))
    .orderBy(asc(categories.sortOrder))
    .all();

  // Show inactive items too so staff can tell guests they're unavailable
  const menuItems = db
    .select()
    .from(items)
    .where(eq(items.venueId, venue))
    .all();

  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <PosHeader venueId={venue} name={session.name} roleLabel="سفرادجي" />
      <main className="page-shell flex flex-1 flex-col gap-2 p-2 sm:gap-3 sm:p-3 lg:p-4">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-base-300/70 bg-base-100 px-3 py-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-black sm:text-lg">
              #{order.id} · {table?.name ?? "بدون طاولة"}
            </h2>
          </div>
          <div className="flex shrink-0 gap-1">
            <Link
              href={`/waiter/${venue}`}
              className="btn btn-ghost btn-sm gap-1.5 rounded-lg"
            >
              <ArrowRight className="size-4" />
              <span className="hidden sm:inline">رجوع</span>
            </Link>
            {lines.length === 0 && (
              <form
                action={async () => {
                  "use server";
                  await cancelOpenOrder(orderId);
                }}
              >
                <button
                  type="submit"
                  className="btn btn-ghost btn-sm gap-1.5 rounded-lg text-error"
                >
                  <Trash2 className="size-4" />
                  <span className="hidden sm:inline">إلغاء</span>
                </button>
              </form>
            )}
          </div>
        </div>

        <OrderMenu
          orderId={orderId}
          categories={cats}
          items={menuItems}
          lines={lines}
          total={order.total}
          footer={
            <KitchenConfirmButton
              orderId={orderId}
              disabled={lines.length === 0}
            />
          }
        />
      </main>
    </div>
  );
}
