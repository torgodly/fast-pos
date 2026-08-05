import { db, getSqlite } from "./index";
import { seedFactoryDatabase } from "./seed";

export function resetDatabaseToFactory() {
  const sqlite = getSqlite();

  sqlite.exec(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM items;
    DELETE FROM categories;
    DELETE FROM tables;
    DELETE FROM cashier_stations;
    DELETE FROM printers;
    DELETE FROM users;
    DELETE FROM venues;
    DELETE FROM sqlite_sequence;
    PRAGMA foreign_keys = ON;
  `);

  seedFactoryDatabase(db);
}
