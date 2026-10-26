import type Database from "better-sqlite3";

function hasColumn(sqlite: Database.Database, table: string, column: string) {
  return (
    sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).some((col) => col.name === column);
}

/**
 * Payment methods are configurable; legacy databases only knew cash/card.
 * Seed the built-ins — including the deferred phone method — and add the
 * hold columns used while a phone order waits for its real payment method.
 */
export function migratePaymentMethods(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      deferred INTEGER NOT NULL DEFAULT 0,
      cash_drawer INTEGER NOT NULL DEFAULT 0,
      built_in INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_code_idx
      ON payment_methods(code);
  `);

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO payment_methods
         (code, name, deferred, cash_drawer, built_in, active, sort_order)
       VALUES ('cash', 'نقدي', 0, 1, 1, 1, 10),
              ('card', 'بطاقة', 0, 0, 1, 1, 20),
              ('phone', 'طلبات هاتف', 1, 0, 1, 1, 30)`,
    )
    .run();

  if (!hasColumn(sqlite, "orders", "held_at")) {
    sqlite.exec(`ALTER TABLE orders ADD COLUMN held_at TEXT`);
  }
  if (!hasColumn(sqlite, "orders", "held_by")) {
    sqlite.exec(
      `ALTER TABLE orders ADD COLUMN held_by INTEGER REFERENCES users(id)`,
    );
  }
}
