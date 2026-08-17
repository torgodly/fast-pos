import bcrypt from "bcryptjs";
import type { UserRole } from "@/lib/types";

export const PIN_PATTERN = /^\d{4,6}$/;
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export type StaffForPin = {
  id: number;
  name: string;
  role: UserRole;
  pinHash: string | null;
  active: boolean;
  mustChangePin?: boolean;
};

/** Keep ASCII 0-9 only; convert Arabic/Persian digits. */
export function normalizePinDigits(raw: string): string {
  let out = "";
  for (const ch of String(raw)) {
    const arabic = ARABIC_INDIC_DIGITS.indexOf(ch);
    if (arabic >= 0) {
      out += String(arabic);
      continue;
    }
    const eastern = EASTERN_ARABIC_DIGITS.indexOf(ch);
    if (eastern >= 0) {
      out += String(eastern);
      continue;
    }
    if (ch >= "0" && ch <= "9") out += ch;
  }
  return out;
}

export function isValidPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(normalizePinDigits(pin));
}

export function hashStaffPin(pin: string): string {
  return bcrypt.hashSync(normalizePinDigits(pin), 10);
}

/** All active waiters/cashiers whose PIN matches. */
export function findStaffMatchingPin(
  staff: StaffForPin[],
  pin: string,
): StaffForPin[] {
  const normalized = normalizePinDigits(pin);
  if (!isValidPinFormat(normalized)) return [];

  return staff.filter((user) => {
    if (!user.active) return false;
    if (user.role !== "waiter" && user.role !== "cashier") return false;
    if (!user.pinHash) return false;
    return bcrypt.compareSync(normalized, user.pinHash);
  });
}

/** Find the first active waiter/cashier whose PIN matches. */
export function matchStaffByPin(
  staff: StaffForPin[],
  pin: string,
): StaffForPin | null {
  return findStaffMatchingPin(staff, pin)[0] ?? null;
}

/** True if another waiter/cashier (active or not) already uses this PIN. */
export function isPinTakenByOther(
  staff: StaffForPin[],
  pin: string,
  excludeUserId?: number | null,
): boolean {
  const normalized = normalizePinDigits(pin);
  if (!isValidPinFormat(normalized)) return false;

  return staff.some((user) => {
    if (excludeUserId != null && user.id === excludeUserId) return false;
    if (user.role !== "waiter" && user.role !== "cashier") return false;
    if (!user.pinHash) return false;
    return bcrypt.compareSync(normalized, user.pinHash);
  });
}
