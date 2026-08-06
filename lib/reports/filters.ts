export type ReportFiltersInput = {
  venue: string;
  from?: string;
  to?: string;
  q?: string;
  waiter?: string;
  cashier?: string;
  payment?: string;
  saleType?: string;
  category?: string;
};

export function inputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeFilterDateTime(
  value: string | undefined,
  fallback: string,
  boundary: "start" | "end" = "start",
) {
  if (!value?.trim()) return fallback;
  const v = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return boundary === "start" ? `${v} 00:00:00` : `${v} 23:59:59`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) {
    return `${v.replace("T", " ")}:00`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v)) {
    return v.replace("T", " ");
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v)) {
    return v.length >= 19 ? v : `${v}:00`;
  }

  return fallback;
}

export function toDateTimeLocalValue(value: string, boundary: "start" | "end" = "start") {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)) {
    return value.slice(0, 16).replace(" ", "T");
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return boundary === "start" ? `${value}T00:00` : `${value}T23:59`;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return value.slice(0, 16);
  }
  return value;
}

export function defaultReportRange(now = new Date()) {
  const today = inputDate(now);
  return {
    today,
    from: `${today}T00:00`,
    to: `${today}T23:59`,
    fromSql: `${today} 00:00:00`,
    toSql: `${today} 23:59:59`,
  };
}

export function resolveReportDateRange(input: ReportFiltersInput) {
  const defaults = defaultReportRange();
  const from = input.from || defaults.from;
  const to = input.to || defaults.to;
  return {
    from,
    to,
    fromSql: normalizeFilterDateTime(from, defaults.fromSql, "start"),
    toSql: normalizeFilterDateTime(to, defaults.toSql, "end"),
  };
}

export function parseId(value?: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
