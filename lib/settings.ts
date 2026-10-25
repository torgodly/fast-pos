import type { BrandDetails } from "@/lib/brand";
import { getSqlite } from "./db/index";

const DEFAULT_FOOTER = "شكراً لزيارتكم — نراكم قريباً";

export const SETTING_RECEIPT_FOOTER = "receipt_footer_message";

const BRAND_NAME_KEY = "brand_name";
const BRAND_PHONE_KEY = "brand_phone";
const BRAND_ADDRESS_KEY = "brand_address";

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

export function getBrandDetails(): BrandDetails {
  return {
    name: getSetting(BRAND_NAME_KEY) ?? "",
    phone: getSetting(BRAND_PHONE_KEY) ?? "",
    address: getSetting(BRAND_ADDRESS_KEY) ?? "",
  };
}

export function setBrandDetails(details: BrandDetails) {
  setOrClearSetting(BRAND_NAME_KEY, details.name);
  setOrClearSetting(BRAND_PHONE_KEY, details.phone);
  setOrClearSetting(BRAND_ADDRESS_KEY, details.address);
}

export function clearBrandDetails() {
  const sqlite = getSqlite();
  sqlite
    .prepare("DELETE FROM app_settings WHERE key IN (?, ?, ?)")
    .run(BRAND_NAME_KEY, BRAND_PHONE_KEY, BRAND_ADDRESS_KEY);
}

function setOrClearSetting(key: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    const sqlite = getSqlite();
    sqlite.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
    return;
  }
  setSetting(key, trimmed);
}

