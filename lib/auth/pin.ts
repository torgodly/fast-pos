import bcrypt from "bcryptjs";
import type { UserRole } from "@/lib/types";

export const PIN_PATTERN = /^\d{4,6}$/;

export type StaffForPin = {
  id: number;
  name: string;
  role: UserRole;
  pinHash: string | null;
  active: boolean;
  mustChangePin?: boolean;
};

export function isValidPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export function hashStaffPin(pin: string): string {
  return bcrypt.hashSync(pin, 10);
}

/** All active waiters/cashiers whose PIN matches. */
export function findStaffMatchingPin(
  staff: StaffForPin[],
  pin: string,
): StaffForPin[] {
  if (!isValidPinFormat(pin)) return [];

  return staff.filter((user) => {
    if (!user.active) return false;
    if (user.role !== "waiter" && user.role !== "cashier") return false;
    if (!user.pinHash) return false;
    return bcrypt.compareSync(pin, user.pinHash);
  });
}

/** Find the first active waiter/cashier whose PIN matches. */
export function matchStaffByPin(
  staff: StaffForPin[],
  pin: string,
): StaffForPin | null {
  return findStaffMatchingPin(staff, pin)[0] ?? null;
}

/** True if another active waiter/cashier already uses this PIN. */
export function isPinTakenByOther(
  staff: StaffForPin[],
  pin: string,
  excludeUserId?: number | null,
): boolean {
  if (!isValidPinFormat(pin)) return false;

  return staff.some((user) => {
    if (excludeUserId != null && user.id === excludeUserId) return false;
    if (!user.active) return false;
    if (user.role !== "waiter" && user.role !== "cashier") return false;
    if (!user.pinHash) return false;
    return bcrypt.compareSync(pin, user.pinHash);
  });
}
