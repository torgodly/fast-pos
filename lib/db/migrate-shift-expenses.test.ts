import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateShiftExpenses } from "./migrate-shift-expenses";

function createShifts(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL,
      work_date TEXT NOT NULL,
      shift_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
    );
    INSERT INTO shifts (venue_id, work_date, shift_number, status)
    VALUES ('restaurant', '2026-10-25', 1, 'open');
  `);
}

describe("migrateShiftExpenses", () => {
  it("creates the expenses table and shift index", () => {
    const sqlite = new Database(":memory:");
    createShifts(sqlite);

    migrateShiftExpenses(sqlite);

    const columns = (
      sqlite.prepare(`PRAGMA table_info(shift_expenses)`).all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);
    expect(columns).toEqual([
      "id",
      "shift_id",
      "amount",
      "reason",
      "created_by",
      "created_by_name",
      "created_at",
    ]);

    const indexes = (
      sqlite.prepare(`PRAGMA index_list(shift_expenses)`).all() as Array<{
        name: string;
      }>
    ).map((index) => index.name);
    expect(indexes).toContain("shift_expenses_shift_idx");
  });

  it("can run again without losing existing expenses", () => {
    const sqlite = new Database(":memory:");
    createShifts(sqlite);
    migrateShiftExpenses(sqlite);
    sqlite
      .prepare(
        `INSERT INTO shift_expenses (shift_id, amount, reason, created_by_name)
         VALUES (1, 12.5, 'شراء ثلج', 'كاشير')`,
      )
      .run();

    migrateShiftExpenses(sqlite);

    expect(
      sqlite
        .prepare(
          `SELECT shift_id, amount, reason, created_by_name FROM shift_expenses`,
        )
        .all(),
    ).toEqual([
      {
        shift_id: 1,
        amount: 12.5,
        reason: "شراء ثلج",
        created_by_name: "كاشير",
      },
    ]);
  });
});
