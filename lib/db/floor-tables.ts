import type { VenueId } from "@/lib/types";

function numbered(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => `طاولة ${from + i}`);
}

export const FLOOR_TABLES: Record<VenueId, string[]> = {
  cafe: [...numbered(1, 20), ...numbered(101, 115)],
  restaurant: [...numbered(20, 50), "VIP"],
};

export function floorTableNames(venueId: VenueId) {
  return FLOOR_TABLES[venueId];
}

export function compareTableNames(a: string, b: string) {
  const numA = Number.parseInt(a.replace(/\D/g, ""), 10);
  const numB = Number.parseInt(b.replace(/\D/g, ""), 10);
  const aHas = Number.isFinite(numA);
  const bHas = Number.isFinite(numB);
  if (aHas && bHas && numA !== numB) return numA - numB;
  if (aHas !== bHas) return aHas ? -1 : 1;
  return a.localeCompare(b, "ar");
}
