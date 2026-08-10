import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { count } from "drizzle-orm";
import fs from "fs";
import path from "path";
import * as schema from "./schema";
import { venues } from "./schema";
import { migrateReportGroups } from "./migrate-report-groups";
import { migrateCafeMenu } from "./migrate-cafe-menu";
import { migrateRestaurantMenu } from "./migrate-restaurant-menu";
import { migrateNullableMenuVenue } from "./migrate-nullable-menu-venue";
import { seedIfNeeded } from "./seed";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "pos.db");
const seedLockPath = path.join(dataDir, ".seed.lock");

let sqliteRef: Database.Database | null = null;

export function getSqlite(): Database.Database {
  if (!sqliteRef) {
    createDb();
  }
  return sqliteRef!;
}

function sleepMs(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* wait */
  }
}

function runSeedSafely(db: ReturnType<typeof drizzle<typeof schema>>) {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  let ownsLock = false;
  try {
    fs.writeFileSync(seedLockPath, String(process.pid), { flag: "wx" });
    ownsLock = true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw error;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [{ value }] = db.select({ value: count() }).from(venues).all();
      if (value > 0) return;
      sleepMs(100);
    }
    return;
  }

  try {
    seedIfNeeded(db);
  } finally {
    if (ownsLock) {
      try {
        fs.unlinkSync(seedLockPath);
      } catch {
        /* ignore */
      }
    }
  }
}

function createDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqliteRef = sqlite;
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  ensureSchema(sqlite);
  migrateNullableMenuVenue(sqlite);
  migrateSharedStaff(sqlite);
  runSeedSafely(db);
  try {
    migrateReportGroups(sqlite);
    migrateRestaurantMenu(sqlite);
    migrateCafeMenu(sqlite);
  } catch {
    // best-effort remap for existing installs
  }
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
      is_main_cashier INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users(username);

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT REFERENCES venues(id),
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
      venue_id TEXT REFERENCES venues(id),
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

    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL REFERENCES venues(id),
      work_date TEXT NOT NULL,
      shift_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      opened_by INTEGER REFERENCES users(id),
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_by INTEGER REFERENCES users(id),
      closed_at TEXT,
      x_printed_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS shifts_venue_date_number_idx
      ON shifts(venue_id, work_date, shift_number);

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL REFERENCES venues(id),
      table_id INTEGER REFERENCES tables(id),
      waiter_id INTEGER REFERENCES users(id),
      cashier_id INTEGER REFERENCES users(id),
      shift_id INTEGER REFERENCES shifts(id),
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

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
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

  try {
    sqlite.exec(
      `ALTER TABLE printers ADD COLUMN connection_type TEXT NOT NULL DEFAULT 'network'`,
    );
  } catch {
    // column already exists
  }

  try {
    sqlite.exec(
      `ALTER TABLE categories ADD COLUMN kitchen_printer_id INTEGER REFERENCES printers(id)`,
    );
  } catch {
    // column already exists
  }

  try {
    sqlite.exec(`
      UPDATE categories
      SET kitchen_printer_id = (
        SELECT i.kitchen_printer_id
        FROM items i
        WHERE i.category_id = categories.id
          AND i.kitchen_printer_id IS NOT NULL
        LIMIT 1
      )
      WHERE kitchen_printer_id IS NULL
    `);
  } catch {
    // migration best-effort for existing databases
  }

  try {
    sqlite.exec(
      `ALTER TABLE orders ADD COLUMN shift_id INTEGER REFERENCES shifts(id)`,
    );
  } catch {
    // column already exists
  }

  try {
    sqlite.exec(
      `ALTER TABLE users ADD COLUMN is_main_cashier INTEGER NOT NULL DEFAULT 0`,
    );
  } catch {
    // column already exists
  }

  try {
    const mainCount = sqlite
      .prepare(
        `SELECT COUNT(*) AS c FROM users WHERE role = 'cashier' AND is_main_cashier = 1 AND active = 1`,
      )
      .get() as { c: number };
    if (!mainCount?.c) {
      sqlite
        .prepare(
          `UPDATE users SET is_main_cashier = 1
           WHERE id = (
             SELECT id FROM users
             WHERE role = 'cashier' AND active = 1
             ORDER BY id ASC LIMIT 1
           )`,
        )
        .run();
    }
  } catch {
    // best-effort
  }
}

const globalForDb = globalThis as unknown as {
  __posDb?: ReturnType<typeof createDb>;
};

export const db = globalForDb.__posDb ?? createDb();
globalForDb.__posDb = db;

export type Db = typeof db;
