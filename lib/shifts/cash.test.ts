import { describe, expect, it } from "vitest";
import {
  calculateShiftCash,
  DEFAULT_OPENING_FLOAT,
  validateShiftExpense,
} from "./cash";

describe("DEFAULT_OPENING_FLOAT", () => {
  it("defaults the cash drawer to 30 LYD", () => {
    expect(DEFAULT_OPENING_FLOAT).toBe(30);
  });
});

describe("calculateShiftCash", () => {
  it("adds cash sales to the opening float for the expected drawer amount", () => {
    expect(calculateShiftCash(100, 50.25, 0, 150)).toEqual({
      expectedCash: 150.25,
      difference: -0.25,
    });
  });

  it("has no difference while the shift is still open", () => {
    expect(calculateShiftCash(100, 50.25, 0, null)).toEqual({
      expectedCash: 150.25,
      difference: null,
    });
  });

  it("rounds floating point money to two decimals", () => {
    expect(calculateShiftCash(0.1, 0.2, 0, 0.3)).toEqual({
      expectedCash: 0.3,
      difference: 0,
    });
  });

  it("reports an overage as a positive difference", () => {
    expect(calculateShiftCash(0, 80, 0, 90)).toEqual({
      expectedCash: 80,
      difference: 10,
    });
  });

  it("subtracts cash expenses paid from the drawer", () => {
    expect(calculateShiftCash(100, 50, 20.5, 130)).toEqual({
      expectedCash: 129.5,
      difference: 0.5,
    });
  });
});

describe("validateShiftExpense", () => {
  it("accepts a positive amount with a reason", () => {
    expect(validateShiftExpense(12.5, "شراء ثلج")).toBeNull();
  });

  it("rejects missing or non-positive amounts", () => {
    expect(validateShiftExpense(0, "شراء ثلج")).toBe(
      "أدخل مبلغ مصروف أكبر من صفر",
    );
    expect(validateShiftExpense(-5, "شراء ثلج")).toBe(
      "أدخل مبلغ مصروف أكبر من صفر",
    );
    expect(validateShiftExpense(Number.NaN, "شراء ثلج")).toBe(
      "أدخل مبلغ مصروف أكبر من صفر",
    );
  });

  it("requires a reason", () => {
    expect(validateShiftExpense(10, "   ")).toBe("اكتب سبب المصروف");
  });

  it("rejects reasons longer than 120 characters", () => {
    expect(validateShiftExpense(10, "x".repeat(121))).toBe(
      "سبب المصروف طويل جداً",
    );
  });
});
