import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateShiftCash } from "./migrate-shift-cash";

function createLegacyShifts(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL,
      work_date TEXT NOT NULL,
      shift_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      opened_by INTEGER,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_by INTEGER,
      closed_at TEXT,
      x_printed_at TEXT
    );
    INSERT INTO shifts (venue_id, work_date, shift_number, status, opened_by, opened_at, closed_by, closed_at)
    VALUES ('restaurant', '2026-10-24', 1, 'closed', 1, '2026-10-24 10:00:00', 1, '2026-10-24 23:00:00');
  `);
}

function shiftColumns(sqlite: Database.Database) {
  return sqlite.prepare(`PRAGMA table_info(shifts)`).all() as Array<{
    name: string;
  }>;
}

describe("migrateShiftCash", () => {
  it("adds cash reconciliation columns without losing legacy Z rows", () => {
    const sqlite = new Database(":memory:");
    createLegacyShifts(sqlite);

    migrateShiftCash(sqlite);

    expect(shiftColumns(sqlite).map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "opening_float",
        "expected_cash",
        "counted_cash",
        "difference",
      ]),
    );
    expect(
      sqlite
        .prepare(
          `SELECT shift_number, status, opening_float, expected_cash, counted_cash, difference
           FROM shifts WHERE id = 1`,
        )
        .get(),
    ).toEqual({
      shift_number: 1,
      status: "closed",
      opening_float: 0,
      expected_cash: null,
      counted_cash: null,
      difference: null,
    });
  });

  it("can run again safely and allows only one open shift per venue", () => {
    const sqlite = new Database(":memory:");
    createLegacyShifts(sqlite);
    migrateShiftCash(sqlite);
    migrateShiftCash(sqlite);

    sqlite
      .prepare(
        `INSERT INTO shifts (venue_id, work_date, shift_number, status)
         VALUES ('restaurant', '2026-10-25', 1, 'open')`,
      )
      .run();

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO shifts (venue_id, work_date, shift_number, status)
           VALUES ('restaurant', '2026-10-25', 2, 'open')`,
        )
        .run(),
    ).toThrow();
  });
});
