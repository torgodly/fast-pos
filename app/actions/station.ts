"use server";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cashierStations, printers } from "@/lib/db/schema";
import { checkoutPrinterRolesFilter, supportsCheckout } from "@/lib/printers";
import { getVenueName, isVenueId } from "@/lib/venues";

export async function getCashierStationContext(
  venueId: string,
): Promise<
  | { error: string }
  | {
      station: typeof cashierStations.$inferSelect;
      printer: typeof printers.$inferSelect;
    }
> {
  if (!isVenueId(venueId)) {
    return { error: "قسم غير صالح" };
  }

  const activeStation = db
    .select()
    .from(cashierStations)
    .where(
      and(
        eq(cashierStations.venueId, venueId),
        eq(cashierStations.active, true),
      ),
    )
    .get();

  if (activeStation) {
    const linked = db
      .select()
      .from(printers)
      .where(
        and(
          eq(printers.id, activeStation.printerId),
          eq(printers.venueId, venueId),
          checkoutPrinterRolesFilter,
          eq(printers.active, true),
        ),
      )
      .get();
    if (linked && supportsCheckout(linked.role)) {
      return { station: activeStation, printer: linked };
    }
  }

  const printer = db
    .select()
    .from(printers)
    .where(
      and(
        eq(printers.venueId, venueId),
        checkoutPrinterRolesFilter,
        eq(printers.active, true),
      ),
    )
    .orderBy(asc(printers.name))
    .get();

  if (!printer) {
    return {
      error: `لا توجد طابعة كاشير لـ ${getVenueName(venueId)} — أضفها من الإدارة ← الطابعات واختر القسم`,
    };
  }

  const station =
    db
      .select()
      .from(cashierStations)
      .where(
        and(
          eq(cashierStations.venueId, venueId),
          eq(cashierStations.printerId, printer.id),
        ),
      )
      .get() ??
    ({
      id: 0,
      venueId,
      name: getVenueName(venueId),
      printerId: printer.id,
      active: true,
    } satisfies typeof cashierStations.$inferSelect);

  return { station, printer };
}
