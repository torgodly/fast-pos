import type Database from "better-sqlite3";

/** Cash expenses paid out of the drawer during a shift. */
export function migrateShiftExpenses(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS shift_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL REFERENCES shifts(id),
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS shift_expenses_shift_idx
      ON shift_expenses(shift_id);
  `);
}
