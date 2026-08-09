import bcrypt from "bcryptjs";
import type { UserRole } from "@/lib/types";

export const PIN_PATTERN = /^\d{4,6}$/;

export type StaffForPin = {
  id: number;
  name: string;
  role: UserRole;
  pinHash: string | null;
  active: boolean;
};

export function isValidPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

/** Find the active waiter/cashier whose PIN matches. */
export function matchStaffByPin(
  staff: StaffForPin[],
  pin: string,
): StaffForPin | null {
  if (!isValidPinFormat(pin)) return null;

  for (const user of staff) {
    if (!user.active) continue;
    if (user.role !== "waiter" && user.role !== "cashier") continue;
    if (!user.pinHash) continue;
    if (bcrypt.compareSync(pin, user.pinHash)) {
      return user;
    }
  }

  return null;
}
