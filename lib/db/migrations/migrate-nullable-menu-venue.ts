import type Database from "better-sqlite3";

type TableInfoRow = {
  name: string;
  notnull: number;
};

function columnIsNotNull(
  sqlite: Database.Database,
  table: string,
  column: string,
): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as TableInfoRow[];
  const col = cols.find((c) => c.name === column);
  return col?.notnull === 1;
}

/**
 * Allow categories/items.venue_id to be NULL (= shared across venues).
 * Preserves all row IDs so tables/users/order FKs stay valid.
 */
export function migrateNullableMenuVenue(sqlite: Database.Database) {
  const needCategories = columnIsNotNull(sqlite, "categories", "venue_id");
  const needItems = columnIsNotNull(sqlite, "items", "venue_id");
  if (!needCategories && !needItems) return;

  sqlite.exec("PRAGMA foreign_keys = OFF");
  try {
    if (needCategories) {
      sqlite.exec(`
        CREATE TABLE categories_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          venue_id TEXT REFERENCES venues(id),
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          kitchen_printer_id INTEGER REFERENCES printers(id),
          active INTEGER NOT NULL DEFAULT 1
        );
        INSERT INTO categories_new (id, venue_id, name, sort_order, kitchen_printer_id, active)
        SELECT id, venue_id, name, sort_order, kitchen_printer_id, active FROM categories;
        DROP TABLE categories;
        ALTER TABLE categories_new RENAME TO categories;
      `);
    }

    if (needItems) {
      sqlite.exec(`
        CREATE TABLE items_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          venue_id TEXT REFERENCES venues(id),
          category_id INTEGER NOT NULL REFERENCES categories(id),
          name TEXT NOT NULL,
          price REAL NOT NULL,
          kitchen_printer_id INTEGER REFERENCES printers(id),
          active INTEGER NOT NULL DEFAULT 1
        );
        INSERT INTO items_new (id, venue_id, category_id, name, price, kitchen_printer_id, active)
        SELECT id, venue_id, category_id, name, price, kitchen_printer_id, active FROM items;
        DROP TABLE items;
        ALTER TABLE items_new RENAME TO items;
      `);
    }
  } finally {
    sqlite.exec("PRAGMA foreign_keys = ON");
  }
}
