import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { requireCashier } from "@/app/actions/auth";
import { CashierShiftPanel } from "@/components/CashierShiftPanel";
import { PosHeader } from "@/components/PosHeader";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getCashierShiftStatus } from "@/lib/shifts/core";
import { isVenueId } from "@/lib/venues";

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

  const shiftStatus = getCashierShiftStatus(venue);

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <PosHeader venueId={venue} name={session.name} roleLabel="كاشير رئيسي" />
      <main className="page-shell flex-1 space-y-4 p-3 sm:space-y-5 sm:p-5 lg:p-6">
        <div className="premium-card flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between sm:rounded-3xl sm:p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Clock3 className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-black sm:text-2xl">إدارة الوردية</h2>
              <p className="text-xs text-base-content/45 sm:text-sm">
                فتح الوردية وطباعة تقارير X و Z
              </p>
            </div>
          </div>
          <Link
            href={`/cashier/${venue}`}
            className="btn btn-ghost btn-sm gap-2 rounded-xl sm:btn-md"
          >
            <ArrowRight className="size-4" />
            رجوع للعمل
          </Link>
        </div>

        <CashierShiftPanel
          venueId={venue}
          workDate={shiftStatus.workDate}
          openShift={
            shiftStatus.open
              ? {
                  id: shiftStatus.open.id,
                  shiftNumber: shiftStatus.open.shiftNumber,
                  status: shiftStatus.open.status,
                  openedAt: shiftStatus.open.openedAt,
                  closedAt: shiftStatus.open.closedAt,
                }
              : null
          }
          canOpen={shiftStatus.canOpen}
          nextShiftNumber={shiftStatus.nextShiftNumber}
          dayComplete={shiftStatus.dayComplete}
        />
      </main>
    </div>
  );
}
