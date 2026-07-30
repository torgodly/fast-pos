import type { VenueId } from "@/lib/types";
import { isVenueId } from "@/lib/venues";

export function parseVenueParam(
  value: string | string[] | undefined,
): VenueId {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && isVenueId(raw)) return raw;
  return "restaurant";
}
