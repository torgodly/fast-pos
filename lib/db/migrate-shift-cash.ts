import type Database from "better-sqlite3";

export function migrateShiftCash(sqlite: Database.Database) {
  const table = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'shifts'`,
    )
    .get();
  if (!table) return;

  const columns = new Set(
    (
      sqlite.prepare(`PRAGMA table_info(shifts)`).all() as Array<{
        name: string;
      }>
    ).map((column) => column.name),
  );

  const addColumn = (name: string, definition: string) => {
    if (columns.has(name)) return;
    sqlite.exec(`ALTER TABLE shifts ADD COLUMN ${name} ${definition}`);
    columns.add(name);
  };

  addColumn("opening_float", "REAL NOT NULL DEFAULT 0");
  addColumn("expected_cash", "REAL");
  addColumn("counted_cash", "REAL");
  addColumn("difference", "REAL");

  try {
    sqlite.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_venue_idx
       ON shifts(venue_id) WHERE status = 'open'`,
    );
  } catch {
    // Legacy databases may already contain duplicate open rows.
  }
}
