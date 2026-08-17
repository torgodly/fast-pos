import { describe, expect, it } from "vitest";
import { isWithinZWindow, isSqlInZWindowBounds, resolveZWindowBounds } from "@/lib/settings";
import { tripoliMinutesOfDay, workDateTripoli } from "@/lib/time/tripoli";

describe("Tripoli time helpers", () => {
  it("formats a work date as YYYY-MM-DD", () => {
    expect(workDateTripoli(new Date("2026-08-14T22:30:00+02:00"))).toBe(
      "2026-08-14",
    );
  });

  it("reads minutes in Africa/Tripoli", () => {
    // 23:15 Tripoli
    const minutes = tripoliMinutesOfDay(
      new Date("2026-08-14T23:15:00+02:00"),
    );
    expect(minutes).toBe(23 * 60 + 15);
  });
});

describe("Z window uses Tripoli clock", () => {
  it("allows Z inside overnight window in Tripoli time", () => {
    // 23:30 Tripoli — inside 23:00–01:00
    expect(
      isWithinZWindow(new Date("2026-08-14T23:30:00+02:00"), "23:00", "01:00"),
    ).toBe(true);
    // 12:00 Tripoli — outside
    expect(
      isWithinZWindow(new Date("2026-08-14T12:00:00+02:00"), "23:00", "01:00"),
    ).toBe(false);
  });

  it("resolves overnight window bounds spanning midnight", () => {
    const evening = resolveZWindowBounds(
      new Date("2026-08-14T23:30:00+02:00"),
      "23:00",
      "01:00",
    );
    expect(evening).toEqual({
      startSql: "2026-08-14 23:00:00",
      endSql: "2026-08-15 01:00:59",
    });

    const earlyMorning = resolveZWindowBounds(
      new Date("2026-08-15T00:30:00+02:00"),
      "23:00",
      "01:00",
    );
    expect(earlyMorning).toEqual({
      startSql: "2026-08-14 23:00:00",
      endSql: "2026-08-15 01:00:59",
    });

    expect(
      isSqlInZWindowBounds("2026-08-14 23:45:00", evening!),
    ).toBe(true);
    expect(
      isSqlInZWindowBounds("2026-08-13 23:45:00", evening!),
    ).toBe(false);
  });
});
