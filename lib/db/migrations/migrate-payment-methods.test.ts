import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migratePaymentMethods } from "./migrate-payment-methods";

function createLegacyDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL,
      payment_method TEXT,
      total REAL NOT NULL DEFAULT 0
    );
    INSERT INTO orders (venue_id, payment_method, total)
    VALUES ('restaurant', 'cash', 12);
  `);
  return sqlite;
}

describe("migratePaymentMethods", () => {
  it("creates the table, seeds built-in methods, and adds hold columns", () => {
    const sqlite = createLegacyDb();

    migratePaymentMethods(sqlite);

    const methods = sqlite
      .prepare(
        `SELECT code, name, deferred, cash_drawer, built_in, active, sort_order
         FROM payment_methods ORDER BY sort_order`,
      )
      .all();
    expect(methods).toEqual([
      {
        code: "cash",
        name: "نقدي",
        deferred: 0,
        cash_drawer: 1,
        built_in: 1,
        active: 1,
        sort_order: 10,
      },
      {
        code: "card",
        name: "بطاقة",
        deferred: 0,
        cash_drawer: 0,
        built_in: 1,
        active: 1,
        sort_order: 20,
      },
      {
        code: "phone",
        name: "طلبات هاتف",
        deferred: 1,
        cash_drawer: 0,
        built_in: 1,
        active: 1,
        sort_order: 30,
      },
    ]);

    const columns = (
      sqlite.prepare(`PRAGMA table_info(orders)`).all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);
    expect(columns).toContain("held_at");
    expect(columns).toContain("held_by");

    expect(
      sqlite.prepare(`SELECT payment_method, total FROM orders`).all(),
    ).toEqual([{ payment_method: "cash", total: 12 }]);
  });

  it("is idempotent and keeps custom methods and renamed built-ins", () => {
    const sqlite = createLegacyDb();
    migratePaymentMethods(sqlite);
    sqlite
      .prepare(
        `INSERT INTO payment_methods (code, name, deferred, cash_drawer, built_in, active, sort_order)
         VALUES ('presto', 'بريستو', 1, 0, 0, 1, 40)`,
      )
      .run();
    sqlite
      .prepare(`UPDATE payment_methods SET name = 'كاش' WHERE code = 'cash'`)
      .run();
    sqlite
      .prepare(`UPDATE payment_methods SET name = 'هاتف' WHERE code = 'phone'`)
      .run();

    migratePaymentMethods(sqlite);

    expect(
      sqlite
        .prepare(`SELECT COUNT(*) AS n FROM payment_methods WHERE code = 'presto'`)
        .get(),
    ).toEqual({ n: 1 });
    expect(
      sqlite
        .prepare(`SELECT name FROM payment_methods WHERE code = 'cash'`)
        .get(),
    ).toEqual({ name: "كاش" });
    expect(
      sqlite
        .prepare(
          `SELECT name, deferred, cash_drawer FROM payment_methods WHERE code = 'phone'`,
        )
        .get(),
    ).toEqual({ name: "هاتف", deferred: 1, cash_drawer: 0 });
    expect(
      sqlite.prepare(`SELECT COUNT(*) AS n FROM payment_methods`).get(),
    ).toEqual({ n: 4 });
  });
});
