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

/** Print slips: date + time to the second (Tripoli wall clock). */
export function formatPrintTimestamp(
  value?: string | Date | null,
): string {
  if (value == null || value === "") {
    return formatPrintTimestamp(new Date());
  }

  if (typeof value === "string") {
    const sql = value.trim();
    // Already Tripoli SQL `YYYY-MM-DD HH:MM:SS` — keep second precision as-is.
    const match = sql.match(
      /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/,
    );
    if (match) {
      return `${match[1]} ${match[2]}`;
    }
  }

  const date =
    value instanceof Date
      ? value
      : new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "-";
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Tripoli",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}
