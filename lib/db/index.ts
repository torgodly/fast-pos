import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "./schema";
import { seedIfNeeded } from "./seed";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "pos.db");

function createDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  ensureSchema(sqlite);
  migrateSharedStaff(sqlite);
  seedIfNeeded(db);
  return db;
}

/** Staff work at any venue — clear venue_id on waiters/cashiers. */
function migrateSharedStaff(sqlite: Database.Database) {
  sqlite
    .prepare(
      `UPDATE users SET venue_id = NULL WHERE role IN ('waiter', 'cashier') AND venue_id IS NOT NULL`,
    )
    .run();
}

function ensureSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS venues (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      venue_id TEXT REFERENCES venues(id),
      username TEXT,
      password_hash TEXT,
      pin_hash TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users(username);

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL REFERENCES venues(id),
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL REFERENCES venues(id),
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 9100,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS cashier_stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL REFERENCES venues(id),
      name TEXT NOT NULL,
      printer_id INTEGER NOT NULL REFERENCES printers(id),
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL REFERENCES venues(id),
      category_id INTEGER NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL,
      price REAL NOT NULL,
      kitchen_printer_id INTEGER REFERENCES printers(id),
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL REFERENCES venues(id),
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL REFERENCES venues(id),
      table_id INTEGER REFERENCES tables(id),
      waiter_id INTEGER REFERENCES users(id),
      cashier_id INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'open',
      payment_method TEXT,
      total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      item_id INTEGER REFERENCES items(id),
      item_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      line_total REAL NOT NULL,
      kitchen_sent_qty INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Existing databases created before kitchen receipts
  try {
    sqlite.exec(
      `ALTER TABLE order_items ADD COLUMN kitchen_sent_qty INTEGER NOT NULL DEFAULT 0`,
    );
  } catch {
    // column already exists
  }

  try {
    sqlite.exec(
      `ALTER TABLE items ADD COLUMN kitchen_printer_id INTEGER REFERENCES printers(id)`,
    );
  } catch {
    // column already exists
  }
}

const globalForDb = globalThis as unknown as {
  __posDb?: ReturnType<typeof createDb>;
};

export const db = globalForDb.__posDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__posDb = db;
}

export type Db = typeof db;
