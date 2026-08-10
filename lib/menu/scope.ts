import { eq, isNull, or, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { VenueId } from "@/lib/types";
import { isVenueId } from "@/lib/venues";

/** Menu visibility: one venue, or both. */
export type MenuVenueScope = VenueId | "shared";

export function parseMenuVenueScope(value: string): MenuVenueScope | null {
  if (value === "shared") return "shared";
  if (isVenueId(value)) return value;
  return null;
}

export function scopeToVenueId(scope: MenuVenueScope): VenueId | null {
  return scope === "shared" ? null : scope;
}

export function venueIdToScope(
  venueId: string | null | undefined,
): MenuVenueScope {
  if (venueId == null || venueId === "") return "shared";
  if (isVenueId(venueId)) return venueId;
  return "shared";
}

export function menuScopeLabel(scope: MenuVenueScope): string {
  switch (scope) {
    case "shared":
      return "مشترك";
    case "restaurant":
      return "مطعم فقط";
    case "cafe":
      return "كافيه فقط";
  }
}

/** SQL: row available when selling at this venue. */
export function availableAtVenue(
  column: AnySQLiteColumn,
  venueId: VenueId,
): SQL {
  return or(eq(column, venueId), isNull(column))!;
}
