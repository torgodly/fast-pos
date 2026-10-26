import type Database from "better-sqlite3";

/** Staff work at any venue — clear venue_id on waiters/cashiers. */
export function migrateSharedStaff(sqlite: Database.Database) {
  sqlite
    .prepare(
      `UPDATE users SET venue_id = NULL WHERE role IN ('waiter', 'cashier') AND venue_id IS NOT NULL`,
    )
    .run();
}
