import type Database from "better-sqlite3";
import { FLOOR_TABLES } from "./floor-tables";

type TableRow = { id: number; name: string; venue_id: string };

/**
 * Recreate cafe (1–20, 101–115) and restaurant (20–50 + VIP) floors.
 * Keeps rows whose names already match. Tables with open orders are kept
 * even if they are no longer on the floor plan.
 */
export function migrateTables(sqlite: Database.Database) {
  const venues = Object.keys(FLOOR_TABLES) as Array<keyof typeof FLOOR_TABLES>;

  for (const venueId of venues) {
    const desired = FLOOR_TABLES[venueId];
    const desiredSet = new Set(desired);
    const existing = sqlite
      .prepare(
        `SELECT id, name, venue_id FROM tables WHERE venue_id = ?`,
      )
      .all(venueId) as TableRow[];

    const byName = new Map(existing.map((row) => [row.name, row]));

    for (const name of desired) {
      const row = byName.get(name);
      if (row) {
        sqlite
          .prepare(`UPDATE tables SET active = 1 WHERE id = ?`)
          .run(row.id);
      } else {
        sqlite
          .prepare(
            `INSERT INTO tables (venue_id, name, active) VALUES (?, ?, 1)`,
          )
          .run(venueId, name);
      }
    }

    for (const row of existing) {
      if (desiredSet.has(row.name)) continue;
      const open = sqlite
        .prepare(
          `SELECT id FROM orders WHERE table_id = ? AND status = 'open' LIMIT 1`,
        )
        .get(row.id) as { id: number } | undefined;
      if (open) continue;
      sqlite.prepare(`UPDATE orders SET table_id = NULL WHERE table_id = ?`).run(
        row.id,
      );
      sqlite.prepare(`DELETE FROM tables WHERE id = ?`).run(row.id);
    }
  }
}
