import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { requireCashier } from "@/app/actions/auth";
import { CashierShiftPanel } from "@/components/CashierShiftPanel";
import { PosHeader } from "@/components/PosHeader";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  getOpenShift,
  getShiftTotals,
  listShiftExpenses,
  listShifts,
  type ShiftTotals,
} from "@/lib/shifts/core";
import { getVenueName, isVenueId } from "@/lib/venues";

const EMPTY_TOTALS: ShiftTotals = {
  invoiceCount: 0,
  totalSales: 0,
  cashTotal: 0,
  cardTotal: 0,
  totalItems: 0,
  tableSales: 0,
  quickSales: 0,
  groups: [],
  items: [],
  expenseTotal: 0,
};

export default async function CashierShiftPage({
  params,
}: {
  params: Promise<{ venue: string }>;
}) {
  const { venue } = await params;
  if (!isVenueId(venue)) notFound();
  const session = await requireCashier(venue);

  const me = db.select().from(users).where(eq(users.id, session.userId)).get();
  if (!me?.isMainCashier) {
    redirect(`/cashier/${venue}`);
  }

  const openShift = getOpenShift(venue);
  const totals = openShift
    ? getShiftTotals(venue, openShift.id)
    : EMPTY_TOTALS;
  const expenses = openShift ? listShiftExpenses(openShift.id) : [];
  const history = listShifts(venue, 60);
  const venueLabel = getVenueName(venue);

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <PosHeader
        venueId={venue}
        name={session.name}
        roleLabel="كاشير رئيسي"
        showExpense={!!openShift}
      />
      <main className="page-shell flex flex-1 flex-col gap-3 p-2 sm:p-3 lg:p-4">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Clock3 className="size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-black sm:text-base">
                الوردية · {venueLabel}
              </h2>
              <p className="truncate text-xs text-base-content/45">
                العهدة، النقد المتوقع والفروقات — مبيعات هذا الفرع فقط
              </p>
            </div>
          </div>
          <Link
            href={`/cashier/${venue}`}
            className="btn btn-ghost btn-xs h-7 min-h-7 gap-1 rounded-md"
          >
            <ArrowRight className="size-3.5" />
            رجوع
          </Link>
        </div>

        <CashierShiftPanel
          venueId={venue}
          venueLabel={venueLabel}
          openShift={
            openShift
              ? {
                  shiftId: openShift.id,
                  shiftNumber: openShift.shiftNumber,
                  openedAt: openShift.openedAt,
                  openingFloat: openShift.openingFloat,
                }
              : null
          }
          totals={totals}
          expenses={expenses}
          history={history}
        />
      </main>
    </div>
  );
}
