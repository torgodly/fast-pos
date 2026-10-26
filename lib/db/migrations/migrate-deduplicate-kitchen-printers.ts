import type Database from "better-sqlite3";

/**
 * Old setup stored the same kitchen IP once per venue.
 * Keep one kitchen row per host:port and retarget category/item links.
 */
export function migrateDeduplicateKitchenPrinters(sqlite: Database.Database) {
  const dupes = sqlite
    .prepare(
      `SELECT host, port, MIN(id) AS keep_id, GROUP_CONCAT(id) AS ids
       FROM printers
       WHERE role = 'kitchen'
       GROUP BY host, port
       HAVING COUNT(*) > 1`,
    )
    .all() as Array<{ host: string; port: number; keep_id: number; ids: string }>;

  for (const row of dupes) {
    const ids = row.ids
      .split(",")
      .map((value) => Number(value))
      .filter((id) => id !== row.keep_id);
    for (const dropId of ids) {
      sqlite
        .prepare(
          `UPDATE categories SET kitchen_printer_id = ? WHERE kitchen_printer_id = ?`,
        )
        .run(row.keep_id, dropId);
      sqlite
        .prepare(
          `UPDATE categories SET restaurant_kitchen_printer_id = ? WHERE restaurant_kitchen_printer_id = ?`,
        )
        .run(row.keep_id, dropId);
      sqlite
        .prepare(
          `UPDATE categories SET cafe_kitchen_printer_id = ? WHERE cafe_kitchen_printer_id = ?`,
        )
        .run(row.keep_id, dropId);
      sqlite
        .prepare(
          `UPDATE items SET kitchen_printer_id = ? WHERE kitchen_printer_id = ?`,
        )
        .run(row.keep_id, dropId);
      sqlite
        .prepare(`DELETE FROM cashier_stations WHERE printer_id = ?`)
        .run(dropId);
      sqlite.prepare(`DELETE FROM printers WHERE id = ?`).run(dropId);
    }
  }
}
