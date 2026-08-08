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
import { getOpenShift } from "@/lib/shifts/core";
import { isVenueId } from "@/lib/venues";

export default async function CashierQuickPage({
  params,
}: {
  params: Promise<{ venue: string }>;
}) {
  const { venue } = await params;
  if (!isVenueId(venue)) notFound();
  const session = await requireCashier(venue);

  const stationCtx = await getCashierStationContext(venue);
  if ("error" in stationCtx || !getOpenShift(venue)) {
    redirect(`/cashier/${venue}`);
  }

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

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <PosHeader venueId={venue} name={session.name} roleLabel="كاشير" />
      <main className="page-shell flex flex-1 flex-col gap-2 p-2 sm:gap-3 sm:p-3 lg:p-4">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-base-300/70 bg-base-100 px-3 py-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-black sm:text-lg">
              بيع سريع
            </h2>
            <p className="truncate text-xs text-base-content/45">
              {stationCtx.printer.name}
            </p>
          </div>
          <Link
            href={`/cashier/${venue}`}
            className="btn btn-ghost btn-sm gap-1.5 rounded-lg"
          >
            <ArrowRight className="size-4" />
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
