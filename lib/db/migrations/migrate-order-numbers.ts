import type Database from "better-sqlite3";
import { addColumnIfMissing } from "./helpers";

/**
 * Adds a per-shift invoice sequence. Paid orders that predate the column are
 * numbered in payment order so the shift that is open today keeps counting.
 */
export function migrateOrderNumbers(sqlite: Database.Database) {
  const table = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orders'`,
    )
    .get();
  if (!table) return;

  addColumnIfMissing(sqlite, "orders", "order_no", "INTEGER");

  const pending = sqlite
    .prepare(
      `SELECT id, shift_id FROM orders
       WHERE shift_id IS NOT NULL AND status = 'paid' AND order_no IS NULL
       ORDER BY shift_id, COALESCE(paid_at, ''), id`,
    )
    .all() as Array<{ id: number; shift_id: number }>;

  if (pending.length > 0) {
    const maxStmt = sqlite.prepare(
      `SELECT COALESCE(MAX(order_no), 0) AS max_no FROM orders WHERE shift_id = ?`,
    );
    const setStmt = sqlite.prepare(
      `UPDATE orders SET order_no = ? WHERE id = ?`,
    );
    const nextByShift = new Map<number, number>();

    sqlite.transaction(() => {
      for (const row of pending) {
        const current =
          nextByShift.get(row.shift_id) ??
          (maxStmt.get(row.shift_id) as { max_no: number }).max_no;
        const value = current + 1;
        nextByShift.set(row.shift_id, value);
        setStmt.run(value, row.id);
      }
    })();
  }

  sqlite.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS orders_shift_order_no_idx
     ON orders(shift_id, order_no)`,
  );
}
