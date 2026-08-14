/** Libya business clock — no DST (Africa/Tripoli ≈ UTC+2). */
export const LIBYA_TIME_ZONE = "Africa/Tripoli";

type TripoliParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

export function tripoliParts(date = new Date()): TripoliParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LIBYA_TIME_ZONE,
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

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") === "24" ? "00" : get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** `YYYY-MM-DD HH:MM:SS` in Tripoli wall time. */
export function nowSqlTripoli(date = new Date()) {
  const p = tripoliParts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** `YYYY-MM-DD` in Tripoli. */
export function workDateTripoli(date = new Date()) {
  const p = tripoliParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since midnight in Tripoli. */
export function tripoliMinutesOfDay(date = new Date()) {
  const p = tripoliParts(date);
  return Number(p.hour) * 60 + Number(p.minute);
}
