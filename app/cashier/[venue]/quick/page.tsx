import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowRight, Zap } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requireCashier } from "@/app/actions/auth";
import { getCashierStationContext } from "@/app/actions/station";
import { PosHeader } from "@/components/PosHeader";
import { QuickSaleBoard } from "@/components/QuickSaleBoard";
import { db } from "@/lib/db";
import { categories, items } from "@/lib/db/schema";
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
  if ("error" in stationCtx) {
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
      <main className="page-shell flex flex-1 flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <div className="premium-card flex flex-col gap-4 rounded-3xl p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Zap className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-black sm:text-2xl">بيع سريع</h2>
              <p className="text-xs text-base-content/45 sm:text-sm">
                الطباعة على {stationCtx.printer.name}
              </p>
            </div>
          </div>
          <Link
            href={`/cashier/${venue}`}
            className="btn btn-ghost btn-sm gap-2 rounded-xl sm:btn-md"
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
