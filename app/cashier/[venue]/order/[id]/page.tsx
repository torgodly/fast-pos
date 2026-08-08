import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowRight, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
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
import { formatMoney, isVenueId } from "@/lib/venues";

export default async function CashierOrderPage({
  params,
}: {
  params: Promise<{ venue: string; id: string }>;
}) {
  const { venue, id } = await params;
  if (!isVenueId(venue)) notFound();
  const session = await requireCashier(venue);
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
    <div className="flex h-dvh flex-1 flex-col overflow-hidden">
      <PosHeader venueId={venue} name={session.name} roleLabel="كاشير" />
      <main className="page-shell flex min-h-0 flex-1 flex-col gap-1 p-1 sm:p-1.5">
        <div className="flex h-8 shrink-0 items-center justify-between gap-2 border border-base-300 bg-base-100 px-2">
          <p className="truncate text-xs font-black">
            #{order.id} · {table?.name ?? "بيع سريع"}
            {waiter ? (
              <span className="font-bold text-base-content/45">
                {" "}
                · {waiter.name}
              </span>
            ) : null}
          </p>
          <div className="flex shrink-0 gap-0.5">
            <Link
              href={`/cashier/${venue}`}
              className="btn btn-ghost btn-xs h-7 min-h-7 gap-1 rounded-md"
            >
              <ArrowRight className="size-3.5" />
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
                className="btn btn-ghost btn-xs h-7 min-h-7 gap-1 rounded-md text-error"
              >
                <Trash2 className="size-3.5" />
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
            <div className="space-y-1">
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
