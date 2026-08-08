import type { VenueId } from "@/lib/types";
import { getSqlite } from "./db/index";

const DEFAULT_FOOTER = "شكراً لزيارتكم — نراكم قريباً";
const DEFAULT_Z_START = "23:00";
const DEFAULT_Z_END = "01:00";

export const SETTING_RECEIPT_FOOTER = "receipt_footer_message";
export const SETTING_Z_WINDOW_START = "z_window_start";
export const SETTING_Z_WINDOW_END = "z_window_end";

function zStartKey(venueId: VenueId) {
  return `z_window_start_${venueId}`;
}
function zEndKey(venueId: VenueId) {
  return `z_window_end_${venueId}`;
}

function getSetting(key: string): string | null {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  const value = row?.value?.trim();
  return value || null;
}

function setSetting(key: string, value: string) {
  const sqlite = getSqlite();
  sqlite
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

export function getReceiptFooterMessage(): string {
  return getSetting(SETTING_RECEIPT_FOOTER) || DEFAULT_FOOTER;
}

export function setReceiptFooterMessage(message: string) {
  const trimmed = message.trim();
  setSetting(SETTING_RECEIPT_FOOTER, trimmed || DEFAULT_FOOTER);
}

export function clearReceiptFooterMessage() {
  const sqlite = getSqlite();
  sqlite
    .prepare("DELETE FROM app_settings WHERE key = ?")
    .run(SETTING_RECEIPT_FOOTER);
}

/** HH:mm — per-venue Z window start (default 23:00). Falls back to legacy global key. */
export function getZWindowStart(venueId?: VenueId): string {
  if (venueId) {
    return (
      getSetting(zStartKey(venueId)) ||
      getSetting(SETTING_Z_WINDOW_START) ||
      DEFAULT_Z_START
    );
  }
  return getSetting(SETTING_Z_WINDOW_START) || DEFAULT_Z_START;
}

/** HH:mm — per-venue Z window end (default 01:00). */
export function getZWindowEnd(venueId?: VenueId): string {
  if (venueId) {
    return (
      getSetting(zEndKey(venueId)) ||
      getSetting(SETTING_Z_WINDOW_END) ||
      DEFAULT_Z_END
    );
  }
  return getSetting(SETTING_Z_WINDOW_END) || DEFAULT_Z_END;
}

export function setZWindow(start: string, end: string, venueId?: VenueId) {
  const s = normalizeTime(start) || DEFAULT_Z_START;
  const e = normalizeTime(end) || DEFAULT_Z_END;
  if (venueId) {
    setSetting(zStartKey(venueId), s);
    setSetting(zEndKey(venueId), e);
    return;
  }
  setSetting(SETTING_Z_WINDOW_START, s);
  setSetting(SETTING_Z_WINDOW_END, e);
}

export function resetZWindow(venueId?: VenueId) {
  const sqlite = getSqlite();
  if (venueId) {
    sqlite
      .prepare("DELETE FROM app_settings WHERE key IN (?, ?)")
      .run(zStartKey(venueId), zEndKey(venueId));
    return;
  }
  sqlite
    .prepare("DELETE FROM app_settings WHERE key IN (?, ?)")
    .run(SETTING_Z_WINDOW_START, SETTING_Z_WINDOW_END);
}

function normalizeTime(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

/** True if `date` is inside the venue's overnight-capable Z window. */
export function isWithinZWindow(
  date = new Date(),
  startOrVenue?: string | VenueId,
  end?: string,
): boolean {
  let start = DEFAULT_Z_START;
  let finish = DEFAULT_Z_END;

  if (startOrVenue === "cafe" || startOrVenue === "restaurant") {
    start = getZWindowStart(startOrVenue);
    finish = getZWindowEnd(startOrVenue);
  } else if (typeof startOrVenue === "string" && end) {
    start = startOrVenue;
    finish = end;
  } else {
    start = getZWindowStart();
    finish = getZWindowEnd();
  }

  const now = date.getHours() * 60 + date.getMinutes();
  const from = minutesOfDay(start);
  const to = minutesOfDay(finish);
  if (from === to) return true;
  if (from < to) return now >= from && now <= to;
  return now >= from || now <= to;
}
