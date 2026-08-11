import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowRight, Boxes } from "lucide-react";
import { notFound } from "next/navigation";
import { requireMainCashier } from "@/app/actions/auth";
import { ItemAvailabilityBoard } from "@/components/cashier/ItemAvailabilityBoard";
import { PosHeader } from "@/components/PosHeader";
import { db } from "@/lib/db";
import { categories, items } from "@/lib/db/schema";
import { availableAtVenue } from "@/lib/menu/scope";
import { isVenueId } from "@/lib/venues";

export default async function CashierItemsPage({
  params,
}: {
  params: Promise<{ venue: string }>;
}) {
  const { venue } = await params;
  if (!isVenueId(venue)) notFound();
  const session = await requireMainCashier(venue);

  const cats = db
    .select()
    .from(categories)
    .where(
      and(
        availableAtVenue(categories.venueId, venue),
        eq(categories.active, true),
      ),
    )
    .orderBy(asc(categories.sortOrder))
    .all();

  const menuItems = db
    .select()
    .from(items)
    .where(availableAtVenue(items.venueId, venue))
    .all();

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <PosHeader venueId={venue} name={session.name} roleLabel="كاشير رئيسي" />
      <main className="page-shell flex flex-1 flex-col gap-3 p-2 sm:p-3 lg:p-4">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Boxes className="size-4 shrink-0 text-primary" />
            <h2 className="truncate text-sm font-black">تشغيل / إيقاف الأصناف</h2>
          </div>
          <Link
            href={`/cashier/${venue}`}
            className="btn btn-ghost btn-xs h-8 min-h-8 gap-1 rounded-md"
          >
            <ArrowRight className="size-3.5" />
            رجوع
          </Link>
        </div>
        <ItemAvailabilityBoard
          categories={cats.map((cat) => ({ id: cat.id, name: cat.name }))}
          items={menuItems.map((item) => ({
            id: item.id,
            name: item.name,
            categoryId: item.categoryId,
            price: item.price,
            active: item.active,
          }))}
        />
      </main>
    </div>
  );
}
