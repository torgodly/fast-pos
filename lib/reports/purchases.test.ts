import { describe, expect, it } from "vitest";
import { resolvePurchaseRange } from "./purchases";

describe("resolvePurchaseRange", () => {
  it("treats missing dates as all history", () => {
    expect(resolvePurchaseRange({})).toEqual({
      from: null,
      to: null,
      fromSql: null,
      toSql: null,
      fromLabel: "البداية",
      toLabel: "الآن",
    });
  });

  it("expands date-only values to full day boundaries", () => {
    const range = resolvePurchaseRange({ from: "2026-11-01", to: "2026-11-03" });
    expect(range.fromSql).toBe("2026-11-01 00:00:00");
    expect(range.toSql).toBe("2026-11-03 23:59:59");
    expect(range.fromLabel).toBe("2026-11-01");
    expect(range.toLabel).toBe("2026-11-03");
  });

  it("accepts datetime-local values", () => {
    const range = resolvePurchaseRange({
      from: "2026-11-01T09:30",
      to: "2026-11-01T18:45",
    });
    expect(range.fromSql).toBe("2026-11-01 09:30:00");
    expect(range.toSql).toBe("2026-11-01 18:45:00");
  });

  it("ignores blank values", () => {
    const range = resolvePurchaseRange({ from: "  ", to: "" });
    expect(range.fromSql).toBeNull();
    expect(range.toSql).toBeNull();
  });
});
