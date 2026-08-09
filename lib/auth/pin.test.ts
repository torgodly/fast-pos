import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { isValidPinFormat, matchStaffByPin, type StaffForPin } from "./pin";

function staff(overrides: Partial<StaffForPin> & Pick<StaffForPin, "id" | "pinHash">): StaffForPin {
  return {
    name: "موظف",
    role: "waiter",
    active: true,
    ...overrides,
  };
}

describe("PIN helpers", () => {
  it("accepts 4–6 digit PINs only", () => {
    expect(isValidPinFormat("1234")).toBe(true);
    expect(isValidPinFormat("123456")).toBe(true);
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("1234567")).toBe(false);
    expect(isValidPinFormat("12ab")).toBe(false);
  });

  it("matches the staff member with the correct PIN", () => {
    const list = [
      staff({ id: 1, name: "أحمد", pinHash: bcrypt.hashSync("1111", 4) }),
      staff({
        id: 2,
        name: "سارة",
        role: "cashier",
        pinHash: bcrypt.hashSync("2222", 4),
      }),
    ];

    const match = matchStaffByPin(list, "2222");
    expect(match?.id).toBe(2);
    expect(match?.role).toBe("cashier");
  });

  it("ignores inactive staff and wrong roles", () => {
    const list = [
      staff({
        id: 1,
        active: false,
        pinHash: bcrypt.hashSync("1111", 4),
      }),
      staff({
        id: 2,
        role: "admin",
        pinHash: bcrypt.hashSync("1111", 4),
      }),
    ];

    expect(matchStaffByPin(list, "1111")).toBeNull();
  });

  it("returns null for an unknown PIN", () => {
    const list = [
      staff({ id: 1, pinHash: bcrypt.hashSync("1111", 4) }),
    ];
    expect(matchStaffByPin(list, "9999")).toBeNull();
  });
});
