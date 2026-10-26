import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateOrderNumbers } from "./migrate-order-numbers";

function createLegacyOrders(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL,
      shift_id INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      paid_at TEXT
    );
    INSERT INTO orders (id, venue_id, shift_id, status, paid_at) VALUES
      (10, 'restaurant', 1, 'paid', '2026-10-26 10:00:00'),
      (11, 'restaurant', 1, 'paid', '2026-10-26 09:00:00'),
      (12, 'restaurant', 1, 'open', NULL),
      (13, 'restaurant', 2, 'paid', '2026-10-26 12:00:00'),
      (14, 'restaurant', NULL, 'paid', '2026-10-26 12:30:00');
  `);
}

function numbers(sqlite: Database.Database) {
  return sqlite
    .prepare(`SELECT id, order_no FROM orders ORDER BY id`)
    .all() as Array<{ id: number; order_no: number | null }>;
}

describe("migrateOrderNumbers", () => {
  it("backfills per-shift numbers in payment order and leaves others null", () => {
    const sqlite = new Database(":memory:");
    createLegacyOrders(sqlite);

    migrateOrderNumbers(sqlite);

    expect(numbers(sqlite)).toEqual([
      { id: 10, order_no: 2 },
      { id: 11, order_no: 1 },
      { id: 12, order_no: null },
      { id: 13, order_no: 1 },
      { id: 14, order_no: null },
    ]);
  });

  it("is idempotent and keeps existing numbers", () => {
    const sqlite = new Database(":memory:");
    createLegacyOrders(sqlite);
    migrateOrderNumbers(sqlite);
    sqlite
      .prepare(`UPDATE orders SET order_no = 40 WHERE id = 13`)
      .run();

    migrateOrderNumbers(sqlite);

    expect(numbers(sqlite)).toEqual([
      { id: 10, order_no: 2 },
      { id: 11, order_no: 1 },
      { id: 12, order_no: null },
      { id: 13, order_no: 40 },
      { id: 14, order_no: null },
    ]);
  });

  it("adds a unique index per shift and allows many null numbers", () => {
    const sqlite = new Database(":memory:");
    createLegacyOrders(sqlite);
    migrateOrderNumbers(sqlite);

    const index = sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'orders_shift_order_no_idx'`,
      )
      .get() as { name: string } | undefined;
    expect(index?.name).toBe("orders_shift_order_no_idx");

    sqlite
      .prepare(
        `INSERT INTO orders (id, venue_id, shift_id, status, paid_at) VALUES (15, 'restaurant', NULL, 'paid', NULL)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO orders (id, venue_id, shift_id, status, paid_at) VALUES (17, 'restaurant', NULL, 'paid', NULL)`,
      )
      .run();
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO orders (id, venue_id, shift_id, status, paid_at, order_no) VALUES (16, 'restaurant', 2, 'paid', NULL, 1)`,
        )
        .run(),
    ).toThrow();
  });
});
