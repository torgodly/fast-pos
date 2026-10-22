import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { FACTORY_CASHIER_PIN, SETTING_DEPLOYMENT_MODE } from "../deployment-mode";
import * as schema from "./schema";
import { seedFactoryDatabase } from "./seed";

function createMemoryDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE venues (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE users (
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
    CREATE TABLE printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT REFERENCES venues(id),
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 9100,
      connection_type TEXT NOT NULL DEFAULT 'network',
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE cashier_stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL REFERENCES venues(id),
      name TEXT NOT NULL,
      printer_id INTEGER NOT NULL REFERENCES printers(id),
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT REFERENCES venues(id),
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      kitchen_printer_id INTEGER REFERENCES printers(id),
      restaurant_kitchen_printer_id INTEGER REFERENCES printers(id),
      cafe_kitchen_printer_id INTEGER REFERENCES printers(id),
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT REFERENCES venues(id),
      category_id INTEGER NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL,
      price REAL NOT NULL,
      kitchen_printer_id INTEGER REFERENCES printers(id),
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL REFERENCES venues(id),
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL REFERENCES venues(id),
      table_id INTEGER REFERENCES tables(id),
      waiter_id INTEGER REFERENCES users(id),
      cashier_id INTEGER REFERENCES users(id),
      shift_id INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      payment_method TEXT,
      total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT
    );
    CREATE TABLE order_items (
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
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

describe("factory seed", () => {
  let sqlite: Database.Database;

  afterEach(() => {
    sqlite.close();
  });

  it("counter seed is restaurant-only with cashier PIN 2580 and no tables/waiters", () => {
    const created = createMemoryDb();
    sqlite = created.sqlite;
    seedFactoryDatabase(created.db, "counter");

    const venues = sqlite.prepare("SELECT id FROM venues ORDER BY id").all() as {
      id: string;
    }[];
    expect(venues.map((v) => v.id)).toEqual(["restaurant"]);

    const users = sqlite
      .prepare("SELECT name, role, pin_hash, is_main_cashier FROM users")
      .all() as Array<{
      name: string;
      role: string;
      pin_hash: string | null;
      is_main_cashier: number;
    }>;
    expect(users.some((u) => u.role === "waiter")).toBe(false);
    expect(users.some((u) => u.role === "admin")).toBe(true);
    const cashier = users.find((u) => u.role === "cashier");
    expect(cashier?.name).toBe("كاشير");
    expect(cashier?.is_main_cashier).toBe(1);
    expect(cashier?.pin_hash).toBeTruthy();
    expect(bcrypt.compareSync(FACTORY_CASHIER_PIN, cashier!.pin_hash!)).toBe(
      true,
    );

    const tableCount = sqlite.prepare("SELECT COUNT(*) AS n FROM tables").get() as {
      n: number;
    };
    expect(tableCount.n).toBe(0);

    const orderCount = sqlite.prepare("SELECT COUNT(*) AS n FROM orders").get() as {
      n: number;
    };
    expect(orderCount.n).toBe(0);

    const printers = sqlite.prepare("SELECT name, role FROM printers").all() as {
      name: string;
      role: string;
    }[];
    expect(printers).toHaveLength(3);
    expect(printers.filter((p) => p.role === "kitchen")).toHaveLength(2);
    expect(printers.filter((p) => p.role === "checkout")).toHaveLength(1);

    const stations = sqlite
      .prepare("SELECT venue_id FROM cashier_stations")
      .all() as { venue_id: string }[];
    expect(stations).toEqual([{ venue_id: "restaurant" }]);

    const mode = sqlite
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get(SETTING_DEPLOYMENT_MODE) as { value: string };
    expect(mode.value).toBe("counter");
  });

  it("full factory seed has both venues, tables, and no demo waiters/orders", () => {
    const created = createMemoryDb();
    sqlite = created.sqlite;
    seedFactoryDatabase(created.db, "full");

    const venues = sqlite.prepare("SELECT id FROM venues ORDER BY id").all() as {
      id: string;
    }[];
    expect(venues.map((v) => v.id)).toEqual(["cafe", "restaurant"]);

    const waiterCount = sqlite
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'waiter'")
      .get() as { n: number };
    expect(waiterCount.n).toBe(0);

    const tableCount = sqlite.prepare("SELECT COUNT(*) AS n FROM tables").get() as {
      n: number;
    };
    expect(tableCount.n).toBeGreaterThan(0);

    const orderCount = sqlite.prepare("SELECT COUNT(*) AS n FROM orders").get() as {
      n: number;
    };
    expect(orderCount.n).toBe(0);

    const mode = sqlite
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get(SETTING_DEPLOYMENT_MODE) as { value: string };
    expect(mode.value).toBe("full");
  });
});
