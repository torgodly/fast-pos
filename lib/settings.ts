import { getSqlite } from "./db/index";

const DEFAULT_FOOTER = "شكراً لزيارتكم — نراكم قريباً";

export const SETTING_RECEIPT_FOOTER = "receipt_footer_message";

export function getReceiptFooterMessage(): string {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(SETTING_RECEIPT_FOOTER) as { value: string } | undefined;
  const value = row?.value?.trim();
  return value || DEFAULT_FOOTER;
}

export function setReceiptFooterMessage(message: string) {
  const sqlite = getSqlite();
  const trimmed = message.trim();
  sqlite
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(SETTING_RECEIPT_FOOTER, trimmed || DEFAULT_FOOTER);
}

export function clearReceiptFooterMessage() {
  const sqlite = getSqlite();
  sqlite
    .prepare("DELETE FROM app_settings WHERE key = ?")
    .run(SETTING_RECEIPT_FOOTER);
}
