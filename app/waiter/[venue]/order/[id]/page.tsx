import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowRight, ReceiptText, Trash2 } from "lucide-react";
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
      <PosHeader venueId={venue} name={session.name} roleLabel="نادل" />
      <main className="page-shell flex flex-1 flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <div className="premium-card flex flex-col gap-4 rounded-3xl p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <ReceiptText className="size-5" />
            </span>
            <div>
            <h2 className="text-xl font-black sm:text-2xl">
              فاتورة #{order.id} — {table?.name ?? "بدون طاولة"}
            </h2>
            <p className="text-xs text-base-content/45 sm:text-sm">
              أضف الأصناف ثم سلّم الفاتورة للكاشير
            </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/waiter/${venue}`}
              className="btn btn-ghost btn-sm gap-2 rounded-xl sm:btn-md"
            >
              <ArrowRight className="size-4" />
              <span className="hidden sm:inline">رجوع للطاولات</span>
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
                  className="btn btn-ghost btn-sm gap-2 rounded-xl text-error sm:btn-md"
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
