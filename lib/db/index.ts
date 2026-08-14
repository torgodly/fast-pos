import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { count } from "drizzle-orm";
import fs from "fs";
import path from "path";
import * as schema from "./schema";
import { venues } from "./schema";
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
  migratePrinterVenueNullable(sqlite);
  migrateDeduplicateKitchenPrinters(sqlite);
  migrateNullableMenuVenue(sqlite);
  migrateSharedStaff(sqlite);
  runSeedSafely(db);
  return db;
}

/**
 * Allow printers.venue_id to be NULL (kitchen-only / shared).
 * Does NOT clear or rewrite existing venue assignments.
 */
function migratePrinterVenueNullable(sqlite: Database.Database) {
  const cols = sqlite.prepare(`PRAGMA table_info(printers)`).all() as Array<{
    name: string;
    notnull: number;
  }>;
  const venueCol = cols.find((col) => col.name === "venue_id");
  if (!venueCol || venueCol.notnull !== 1) return;

  sqlite.pragma("foreign_keys = OFF");
  sqlite.exec(`
    BEGIN;
    CREATE TABLE printers__venue_null (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT REFERENCES venues(id),
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 9100,
      connection_type TEXT NOT NULL DEFAULT 'network',
      active INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO printers__venue_null (
      id, venue_id, name, role, host, port, connection_type, active
    )
    SELECT
      id,
      venue_id,
      name,
      role,
      host,
      port,
      COALESCE(connection_type, 'network'),
      active
    FROM printers;
    DROP TABLE printers;
    ALTER TABLE printers__venue_null RENAME TO printers;
    COMMIT;
  `);
  sqlite.pragma("foreign_keys = ON");
}

/**
 * Old setup stored the same kitchen IP once per venue.
 * Keep one kitchen row per host:port and retarget category/item links.
 */
function migrateDeduplicateKitchenPrinters(sqlite: Database.Database) {
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
      venue_id TEXT REFERENCES venues(id),
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
      category_name TEXT,
      unit_price REAL NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      line_total REAL NOT NULL,
      kitchen_sent_qty INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER REFERENCES users(id),
      user_name TEXT NOT NULL,
      role TEXT NOT NULL,
      venue_id TEXT REFERENCES venues(id),
      kind TEXT NOT NULL,
      order_id INTEGER REFERENCES orders(id),
      printer_name TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      detail TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at);
    CREATE INDEX IF NOT EXISTS audit_events_venue_idx ON audit_events(venue_id);

    CREATE TABLE IF NOT EXISTS cancelled_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      order_item_id INTEGER,
      item_id INTEGER REFERENCES items(id),
      item_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      qty_before INTEGER NOT NULL,
      qty_removed INTEGER NOT NULL,
      qty_after INTEGER NOT NULL,
      line_total_removed REAL NOT NULL,
      remaining_total REAL NOT NULL,
      remaining_items_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      removed_by INTEGER REFERENCES users(id),
      removed_by_name TEXT NOT NULL,
      removed_by_role TEXT NOT NULL,
      venue_id TEXT REFERENCES venues(id),
      kitchen_was_sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS cancelled_items_order_idx ON cancelled_items(order_id);
    CREATE INDEX IF NOT EXISTS cancelled_items_created_idx ON cancelled_items(created_at);
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
    sqlite.exec(`ALTER TABLE order_items ADD COLUMN category_name TEXT`);
  } catch {
    // column already exists
  }

  // Backfill snapshots from live menu when still linked (best-effort, no wipe).
  try {
    sqlite
      .prepare(
        `UPDATE order_items
         SET category_name = (
           SELECT categories.name
           FROM items
           LEFT JOIN categories ON categories.id = items.category_id
           WHERE items.id = order_items.item_id
         )
         WHERE (category_name IS NULL OR category_name = '')
           AND item_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM items WHERE items.id = order_items.item_id)`,
      )
      .run();
  } catch {
    // best-effort
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
    sqlite.exec(
      `ALTER TABLE categories ADD COLUMN restaurant_kitchen_printer_id INTEGER REFERENCES printers(id)`,
    );
  } catch {
    // column already exists
  }

  try {
    sqlite.exec(
      `ALTER TABLE categories ADD COLUMN cafe_kitchen_printer_id INTEGER REFERENCES printers(id)`,
    );
  } catch {
    // column already exists
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

  // Ghost quick-sale invoices: kitchen abort deleted lines but order stayed
  // because audit_events still referenced the order id.
  try {
    sqlite
      .prepare(
        `UPDATE orders
         SET status = 'cancelled', total = 0
         WHERE status = 'open'
           AND table_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM order_items WHERE order_items.order_id = orders.id
           )`,
      )
      .run();
  } catch {
    // best-effort cleanup
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
