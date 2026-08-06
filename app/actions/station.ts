"use server";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cashierStations, printers } from "@/lib/db/schema";
import { checkoutPrinterRolesFilter } from "@/lib/printers";
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
      error: `لا توجد طابعة كاشير لـ ${getVenueName(venueId)} — أضفها من الإدارة ← الطابعات`,
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
          eq(cashierStations.active, true),
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
