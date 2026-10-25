import { describe, expect, it } from "vitest";
import {
  nowSqlTripoli,
  tripoliMinutesOfDay,
  workDateTripoli,
} from "@/lib/time/tripoli";

describe("Tripoli time helpers", () => {
  it("formats a work date as YYYY-MM-DD", () => {
    expect(workDateTripoli(new Date("2026-08-14T22:30:00+02:00"))).toBe(
      "2026-08-14",
    );
  });

  it("writes paid-at style SQL timestamps in Libya wall time, not UTC", () => {
    // 12:13 UTC is 14:13 in Libya (GMT+2); receipts must print 14:13.
    expect(nowSqlTripoli(new Date("2026-10-25T12:13:22Z"))).toBe(
      "2026-10-25 14:13:22",
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
