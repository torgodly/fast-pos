import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
import { kitchenPrinterRolesFilter } from "@/lib/printers";
import type { VenueId } from "@/lib/types";

type PrinterRow = typeof printers.$inferSelect;

/**
 * Only an explicitly linked kitchen printer is used. A category with no
 * usable printer resolves to null and its lines are skipped by the caller.
 */
export function resolveKitchenPrinterForVenue(options: {
  venueId: VenueId;
  categoryPrinterId: number | null | undefined;
  restaurantPrinterId?: number | null;
  cafePrinterId?: number | null;
  itemPrinterId: number | null | undefined;
}): PrinterRow | null {
  const {
    venueId,
    categoryPrinterId,
    restaurantPrinterId,
    cafePrinterId,
    itemPrinterId,
  } = options;
  const venueLinked = venueId === "cafe" ? cafePrinterId : restaurantPrinterId;
  const candidateId = venueLinked ?? categoryPrinterId ?? itemPrinterId ?? null;
  if (!candidateId) return null;

  return (
    db
      .select()
      .from(printers)
      .where(
        and(
          eq(printers.id, candidateId),
          eq(printers.active, true),
          kitchenPrinterRolesFilter,
        ),
      )
      .get() ?? null
  );
}
