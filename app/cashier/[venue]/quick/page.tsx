import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requireCashier } from "@/app/actions/auth";
import { getCashierStationContext } from "@/app/actions/station";
import { PosHeader } from "@/components/PosHeader";
import { QuickSaleBoard } from "@/components/QuickSaleBoard";
import { db } from "@/lib/db";
import { categories, items } from "@/lib/db/schema";
import { isVenueId } from "@/lib/venues";
import { availableAtVenue } from "@/lib/menu/scope";

export default async function CashierQuickPage({
  params,
}: {
  params: Promise<{ venue: string }>;
}) {
  const { venue } = await params;
  if (!isVenueId(venue)) notFound();
  const session = await requireCashier(venue);

  const stationCtx = await getCashierStationContext(venue);
  if ("error" in stationCtx) {
    redirect(`/cashier/${venue}`);
  }

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
    .where(and(availableAtVenue(items.venueId, venue), eq(items.active, true)))
    .all();

  return (
    <div className="flex h-dvh flex-1 flex-col overflow-hidden">
      <PosHeader venueId={venue} name={session.name} roleLabel="كاشير" />
      <main className="page-shell flex min-h-0 flex-1 flex-col gap-1 overflow-hidden p-1 sm:p-1.5">
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border border-base-300 bg-base-100 px-2.5">
          <p className="truncate text-sm font-black">
            بيع سريع
            <span className="ms-1 font-bold text-base-content/45">
              · {stationCtx.printer.name}
            </span>
          </p>
          <Link
            href={`/cashier/${venue}`}
            className="btn btn-ghost btn-xs h-7 min-h-7 gap-1 rounded-md"
          >
            <ArrowRight className="size-3.5" />
            رجوع
          </Link>
        </div>

        <QuickSaleBoard
          venueId={venue}
          categories={cats}
          items={menuItems}
        />
      </main>
    </div>
  );
}
