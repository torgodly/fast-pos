import type Database from "better-sqlite3";

type Cat = { id: number; name: string; venue_id: string | null };
type Item = { id: number; name: string };

/**
 * If a shared category exists, fold venue-specific same-name copies into it.
 * Boot migrations used to recreate cafe/restaurant copies after a group was
 * marked shared — this cleans that up and is safe to re-run.
 */
export function dedupeSharedCategories(sqlite: Database.Database) {
  sqlite.exec(`
    UPDATE items
    SET venue_id = (
      SELECT venue_id FROM categories WHERE categories.id = items.category_id
    )
    WHERE venue_id IS NOT (
      SELECT venue_id FROM categories WHERE categories.id = items.category_id
    )
    OR (
      venue_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM categories
        WHERE categories.id = items.category_id AND categories.venue_id IS NULL
      )
    )
  `);

  const shared = sqlite
    .prepare(
      `SELECT id, name, venue_id FROM categories WHERE venue_id IS NULL`,
    )
    .all() as Cat[];

  for (const keep of shared) {
    const dups = sqlite
      .prepare(
        `SELECT id, name, venue_id FROM categories WHERE name = ? AND id != ?`,
      )
      .all(keep.name, keep.id) as Cat[];

    for (const dup of dups) {
      mergeCategoryInto(sqlite, dup.id, keep.id);
    }
  }
}

function mergeCategoryInto(
  sqlite: Database.Database,
  fromId: number,
  intoId: number,
) {
  const intoItems = sqlite
    .prepare(`SELECT id, name FROM items WHERE category_id = ?`)
    .all(intoId) as Item[];
  const byName = new Map(intoItems.map((item) => [item.name, item.id]));

  const fromItems = sqlite
    .prepare(`SELECT id, name FROM items WHERE category_id = ?`)
    .all(fromId) as Item[];

  for (const item of fromItems) {
    const existingId = byName.get(item.name);
    if (existingId) {
      sqlite
        .prepare(`UPDATE order_items SET item_id = ? WHERE item_id = ?`)
        .run(existingId, item.id);
      sqlite.prepare(`DELETE FROM items WHERE id = ?`).run(item.id);
    } else {
      sqlite
        .prepare(
          `UPDATE items SET category_id = ?, venue_id = NULL WHERE id = ?`,
        )
        .run(intoId, item.id);
      byName.set(item.name, item.id);
    }
  }

  sqlite.prepare(`DELETE FROM categories WHERE id = ?`).run(fromId);
}

export function findSharedCategory(
  sqlite: Database.Database,
  name: string,
): { id: number } | undefined {
  return sqlite
    .prepare(`SELECT id FROM categories WHERE name = ? AND venue_id IS NULL`)
    .get(name) as { id: number } | undefined;
}
