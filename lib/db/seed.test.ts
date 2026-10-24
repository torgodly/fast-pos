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
      customer_id INTEGER,
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

  function countRows(table: string) {
    const row = sqlite
      .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
      .get() as { n: number };
    return row.n;
  }

  it("counter seed creates only restaurant venue and users, with cashier PIN 2580", () => {
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
    expect(users.map((u) => u.role).sort()).toEqual(["admin", "cashier"]);
    expect(users.some((u) => u.role === "waiter")).toBe(false);
    const cashier = users.find((u) => u.role === "cashier");
    expect(cashier?.name).toBe("كاشير");
    expect(cashier?.is_main_cashier).toBe(1);
    expect(cashier?.pin_hash).toBeTruthy();
    expect(bcrypt.compareSync(FACTORY_CASHIER_PIN, cashier!.pin_hash!)).toBe(
      true,
    );

    expect(countRows("printers")).toBe(0);
    expect(countRows("cashier_stations")).toBe(0);
    expect(countRows("categories")).toBe(0);
    expect(countRows("items")).toBe(0);
    expect(countRows("tables")).toBe(0);
    expect(countRows("orders")).toBe(0);

    const mode = sqlite
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get(SETTING_DEPLOYMENT_MODE) as { value: string };
    expect(mode.value).toBe("counter");
  });

  it("full factory seed creates both venues and users only", () => {
    const created = createMemoryDb();
    sqlite = created.sqlite;
    seedFactoryDatabase(created.db, "full");

    const venues = sqlite.prepare("SELECT id FROM venues ORDER BY id").all() as {
      id: string;
    }[];
    expect(venues.map((v) => v.id)).toEqual(["cafe", "restaurant"]);

    const users = sqlite
      .prepare("SELECT role FROM users ORDER BY role")
      .all() as { role: string }[];
    expect(users.map((u) => u.role)).toEqual(["admin", "cashier"]);

    expect(countRows("printers")).toBe(0);
    expect(countRows("cashier_stations")).toBe(0);
    expect(countRows("categories")).toBe(0);
    expect(countRows("items")).toBe(0);
    expect(countRows("tables")).toBe(0);
    expect(countRows("orders")).toBe(0);

    const mode = sqlite
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get(SETTING_DEPLOYMENT_MODE) as { value: string };
    expect(mode.value).toBe("full");
  });
});
