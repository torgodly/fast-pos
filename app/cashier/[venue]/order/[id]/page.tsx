import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowRight, Trash2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requireCashier } from "@/app/actions/auth";
import { cancelOpenOrder } from "@/app/actions/orders";
import { KitchenConfirmButton } from "@/components/KitchenConfirmButton";
import { OrderMenu } from "@/components/OrderMenu";
import { PayButtons } from "@/components/PayButtons";
import { PosHeader } from "@/components/PosHeader";
import { db } from "@/lib/db";
import {
  categories,
  items,
  orderItems,
  orders,
  tables,
  users,
} from "@/lib/db/schema";
import { getOpenShift } from "@/lib/shifts/core";
import { formatMoney, isVenueId } from "@/lib/venues";

export default async function CashierOrderPage({
  params,
}: {
  params: Promise<{ venue: string; id: string }>;
}) {
  const { venue, id } = await params;
  if (!isVenueId(venue)) notFound();
  const session = await requireCashier(venue);
  if (!getOpenShift(venue)) {
    redirect(`/cashier/${venue}`);
  }
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
  const waiter = order.waiterId
    ? db.select().from(users).where(eq(users.id, order.waiterId)).get()
    : null;

  const cats = db
    .select()
    .from(categories)
    .where(and(eq(categories.venueId, venue), eq(categories.active, true)))
    .orderBy(asc(categories.sortOrder))
    .all();

  const menuItems = db
    .select()
    .from(items)
    .where(and(eq(items.venueId, venue), eq(items.active, true)))
    .all();

  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <PosHeader venueId={venue} name={session.name} roleLabel="كاشير" />
      <main className="page-shell flex flex-1 flex-col gap-2 p-2 sm:gap-3 sm:p-3 lg:p-4">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-base-300/70 bg-base-100 px-3 py-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-black sm:text-lg">
              #{order.id} · {table?.name ?? "بيع سريع"}
            </h2>
            {waiter ? (
              <p className="truncate text-xs text-base-content/45">
                {waiter.name}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1">
            <Link
              href={`/cashier/${venue}`}
              className="btn btn-ghost btn-sm gap-1.5 rounded-lg"
            >
              <ArrowRight className="size-4" />
              رجوع
            </Link>
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
                إلغاء
              </button>
            </form>
          </div>
        </div>

        <OrderMenu
          orderId={orderId}
          categories={cats}
          items={menuItems}
          lines={lines}
          total={order.total}
          footer={
            <div className="space-y-2">
              <KitchenConfirmButton
                orderId={orderId}
                disabled={lines.length === 0}
              />
              <PayButtons
                orderId={orderId}
                totalLabel={formatMoney(order.total)}
              />
            </div>
          }
        />
      </main>
    </div>
  );
}
