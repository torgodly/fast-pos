import type { VenueId } from "@/lib/types";

export const VENUES: {
  id: VenueId;
  name: string;
  description: string;
}[] = [
  {
    id: "restaurant",
    name: "مطعم",
    description: "نقطة البيع للمطعم",
  },
  {
    id: "cafe",
    name: "كافيه",
    description: "نقطة البيع للكافيه",
  },
];

export function isVenueId(value: string): value is VenueId {
  return value === "restaurant" || value === "cafe";
}

export function getVenueName(id: VenueId): string {
  return VENUES.find((v) => v.id === id)?.name ?? id;
}

export function formatMoney(amount: number): string {
  return `${amount.toFixed(2)} د.ل`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-LY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
