import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  sqlite: null as import("better-sqlite3").Database | null,
}));

vi.mock("@/lib/db", async () => {
  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const schema = await import("@/lib/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL,
      shift_id INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      order_no INTEGER,
      paid_at TEXT
    );
  `);
  holder.sqlite = sqlite;
  return { db: drizzle(sqlite, { schema }) };
});

const { nextOrderNumber } = await import("./order-number");

function addPaid(shiftId: number | null, orderNo: number | null) {
  holder.sqlite!
    .prepare(
      `INSERT INTO orders (venue_id, shift_id, status, order_no, paid_at) VALUES ('restaurant', ?, 'paid', ?, '2026-10-26 10:00:00')`,
    )
    .run(shiftId, orderNo);
}

describe("nextOrderNumber", () => {
  beforeEach(() => {
    holder.sqlite!.exec(`DELETE FROM orders`);
  });

  it("starts each shift at 1", () => {
    expect(nextOrderNumber(1)).toBe(1);
    expect(nextOrderNumber(2)).toBe(1);
  });

  it("continues after the highest number in the same shift", () => {
    addPaid(1, 1);
    addPaid(1, 2);

    expect(nextOrderNumber(1)).toBe(3);
    expect(nextOrderNumber(2)).toBe(1);
  });

  it("ignores null numbers and other shifts", () => {
    addPaid(1, null);
    addPaid(2, 9);

    expect(nextOrderNumber(1)).toBe(1);
    expect(nextOrderNumber(2)).toBe(10);
  });
});
