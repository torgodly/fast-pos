import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { count } from "drizzle-orm";
import fs from "fs";
import path from "path";
import * as schema from "./schema";
import { venues } from "./schema";
import { migrateDeduplicateKitchenPrinters } from "./migrations/migrate-deduplicate-kitchen-printers";
import { migrateNullableMenuVenue } from "./migrations/migrate-nullable-menu-venue";
import { migratePaymentMethods } from "./migrations/migrate-payment-methods";
import { migratePrinterAutoPrint } from "./migrations/migrate-printer-auto-print";
import { migratePrinterVenueNullable } from "./migrations/migrate-printer-venue-nullable";
import { migrateSharedStaff } from "./migrations/migrate-shared-staff";
import { migrateShiftCash } from "./migrations/migrate-shift-cash";
import { migrateShiftExpenses } from "./migrations/migrate-shift-expenses";
import { migrateUnits } from "./migrations/migrate-units";
import { seedIfNeeded } from "./seed";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "pos.db");
const seedLockPath = path.join(dataDir, ".seed.lock");

const globalForDb = globalThis as unknown as {
  __posSqlite?: Database.Database;
  __posDb?: ReturnType<typeof createDb>;
};

export function getSqlite(): Database.Database {
  if (!globalForDb.__posSqlite) {
    globalForDb.__posDb = createDb();
  }
  return globalForDb.__posSqlite!;
}

function getDbInstance() {
  if (!globalForDb.__posDb || !globalForDb.__posSqlite) {
    globalForDb.__posDb = createDb();
  }
  return globalForDb.__posDb;
}

/** Used only by the restore flow; the caller must reopen before serving requests. */
export function closeDatabase() {
  const sqlite = globalForDb.__posSqlite;
  globalForDb.__posSqlite = undefined;
  globalForDb.__posDb = undefined;
  if (sqlite?.open) {
    sqlite.close();
  }
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
  globalForDb.__posSqlite = sqlite;

  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    const db = drizzle(sqlite, { schema });
    ensureSchema(sqlite);
    migrateUnits(sqlite);
    migratePaymentMethods(sqlite);
    migratePrinterAutoPrint(sqlite);
    migrateShiftCash(sqlite);
    migrateShiftExpenses(sqlite);
    migratePrinterVenueNullable(sqlite);
    migrateDeduplicateKitchenPrinters(sqlite);
    migrateNullableMenuVenue(sqlite);
    migrateSharedStaff(sqlite);
    runSeedSafely(db);
    return db;
  } catch (error) {
    globalForDb.__posSqlite = undefined;
    try {
      sqlite.close();
    } catch {
      // ignore close failures while unwinding a failed open
    }
    throw error;
  }
}

function ensureSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS venues (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      factor_to_base INTEGER NOT NULL,
      built_in INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS units_name_idx ON units(name);

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      venue_id TEXT REFERENCES venues(id),
      username TEXT,
      password_hash TEXT,
      pin_hash TEXT,
      is_main_cashier INTEGER NOT NULL DEFAULT 0,
      must_change_pin INTEGER NOT NULL DEFAULT 0,
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
      auto_print INTEGER NOT NULL DEFAULT 0,
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
      unit_id INTEGER REFERENCES units(id),
      track_stock INTEGER NOT NULL DEFAULT 0,
      stock_base INTEGER NOT NULL DEFAULT 0,
      low_stock_base INTEGER NOT NULL DEFAULT 0,
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
      opening_float REAL NOT NULL DEFAULT 0,
      closed_by INTEGER REFERENCES users(id),
      closed_at TEXT,
      expected_cash REAL,
      counted_cash REAL,
      difference REAL,
      x_printed_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS shifts_venue_date_number_idx
      ON shifts(venue_id, work_date, shift_number);
    CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_venue_idx
      ON shifts(venue_id) WHERE status = 'open';

    CREATE TABLE IF NOT EXISTS shift_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL REFERENCES shifts(id),
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS shift_expenses_shift_idx
      ON shift_expenses(shift_id);

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      deferred INTEGER NOT NULL DEFAULT 0,
      cash_drawer INTEGER NOT NULL DEFAULT 0,
      built_in INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_code_idx
      ON payment_methods(code);

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL REFERENCES venues(id),
      table_id INTEGER REFERENCES tables(id),
      customer_id INTEGER REFERENCES customers(id),
      waiter_id INTEGER REFERENCES users(id),
      cashier_id INTEGER REFERENCES users(id),
      shift_id INTEGER REFERENCES shifts(id),
      status TEXT NOT NULL DEFAULT 'open',
      payment_method TEXT,
      held_at TEXT,
      held_by INTEGER REFERENCES users(id),
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
      kitchen_sent_qty INTEGER NOT NULL DEFAULT 0,
      note TEXT
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

    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      preferred_unit_id INTEGER REFERENCES units(id),
      stock_base INTEGER NOT NULL DEFAULT 0,
      low_stock_base INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ingredients_name_idx ON ingredients(name);

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER REFERENCES suppliers(id),
      invoice_number TEXT,
      note TEXT,
      total_cost REAL NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id),
      ingredient_id INTEGER REFERENCES ingredients(id),
      item_id INTEGER REFERENCES items(id),
      target_name TEXT NOT NULL,
      qty_base INTEGER NOT NULL,
      unit_id INTEGER REFERENCES units(id),
      unit_name TEXT,
      unit_kind TEXT,
      factor_to_base INTEGER,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS item_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id),
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
      qty_base INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS item_ingredients_item_ingredient_idx
      ON item_ingredients(item_id, ingredient_id);

    CREATE TABLE IF NOT EXISTS ingredient_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER REFERENCES ingredients(id),
      ingredient_name TEXT NOT NULL,
      delta_base INTEGER NOT NULL,
      kind TEXT NOT NULL,
      order_id INTEGER REFERENCES orders(id),
      invoice_id INTEGER REFERENCES purchase_invoices(id),
      user_id INTEGER REFERENCES users(id),
      user_name TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ingredient_movements_ingredient_idx
      ON ingredient_movements(ingredient_id);
    CREATE INDEX IF NOT EXISTS ingredient_movements_order_idx
      ON ingredient_movements(order_id);

    CREATE TABLE IF NOT EXISTS item_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER REFERENCES items(id),
      item_name TEXT NOT NULL,
      delta_base INTEGER NOT NULL,
      kind TEXT NOT NULL,
      unit_name TEXT,
      unit_kind TEXT,
      factor_to_base INTEGER,
      order_id INTEGER REFERENCES orders(id),
      invoice_id INTEGER REFERENCES purchase_invoices(id),
      user_id INTEGER REFERENCES users(id),
      user_name TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS item_movements_item_idx
      ON item_movements(item_id);
    CREATE INDEX IF NOT EXISTS item_movements_order_idx
      ON item_movements(order_id);
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

  try {
    sqlite.exec(`ALTER TABLE order_items ADD COLUMN note TEXT`);
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
      `ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id)`,
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
    sqlite.exec(
      `ALTER TABLE users ADD COLUMN must_change_pin INTEGER NOT NULL DEFAULT 0`,
    );
  } catch {
    // column already exists
  }

  // Clear any leftover "must change PIN" flags — force-change flow removed.
  try {
    const clearFlag = sqlite
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get("clear_must_change_pin_v1") as { value: string } | undefined;
    if (!clearFlag?.value) {
      sqlite
        .prepare(`UPDATE users SET must_change_pin = 0`)
        .run();
      sqlite
        .prepare(
          `INSERT INTO app_settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run("clear_must_change_pin_v1", "1");
    }
  } catch {
    // best-effort
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

const dbTarget = {} as ReturnType<typeof createDb>;

/**
 * Stable proxy so a restored database can be reopened without invalidating
 * already-imported `db` bindings in server actions and route handlers.
 */
export const db = new Proxy(dbTarget, {
  get(_target, property) {
    const instance = getDbInstance();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export type Db = ReturnType<typeof createDb>;

getDbInstance();
