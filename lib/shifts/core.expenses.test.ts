import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  sqlite: null as import("better-sqlite3").Database | null,
}));

vi.mock("@/lib/db", async () => {
  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const schema = await import("@/lib/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE venues (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      venue_id TEXT,
      username TEXT,
      password_hash TEXT,
      pin_hash TEXT,
      is_main_cashier INTEGER NOT NULL DEFAULT 0,
      must_change_pin INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES categories(id),
      name TEXT NOT NULL
    );
    CREATE TABLE payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      deferred INTEGER NOT NULL DEFAULT 0,
      cash_drawer INTEGER NOT NULL DEFAULT 0,
      built_in INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE shifts (
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
    CREATE TABLE shift_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL REFERENCES shifts(id),
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL REFERENCES venues(id),
      table_id INTEGER,
      customer_id INTEGER,
      waiter_id INTEGER,
      cashier_id INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      payment_method TEXT,
      total REAL NOT NULL DEFAULT 0,
      shift_id INTEGER REFERENCES shifts(id),
      held_at TEXT,
      held_by INTEGER,
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
  `);
  holder.sqlite = sqlite;
  return { db: drizzle(sqlite, { schema }) };
});

import {
  addShiftExpense,
  buildShiftReportData,
  closeShift,
  getShiftTotals,
  listShiftExpenses,
  removeShiftExpense,
} from "./core";

function sqlite() {
  return holder.sqlite!;
}

function seedBase() {
  const db = sqlite();
  db.exec(`
    INSERT INTO venues (id, name) VALUES ('restaurant', 'مطعم');
    INSERT INTO payment_methods (id, code, name, cash_drawer, built_in, sort_order)
    VALUES (1, 'cash', 'نقدي', 1, 1, 0), (2, 'card', 'بطاقة', 0, 1, 1);
    INSERT INTO users (id, name) VALUES (1, 'كاشير رئيسي'), (2, 'كاشير');
    INSERT INTO categories (id, name) VALUES (1, 'مشروبات ساخنة');
    INSERT INTO items (id, category_id, name) VALUES (1, 1, 'شاي'), (2, 1, 'قهوة');
    INSERT INTO shifts (id, venue_id, work_date, shift_number, status, opened_by, opened_at, opening_float)
    VALUES (1, 'restaurant', '2026-10-25', 1, 'open', 1, '2026-10-25 09:00:00', 30);
    INSERT INTO orders (id, venue_id, table_id, status, payment_method, total, shift_id, paid_at)
    VALUES (1, 'restaurant', 1, 'paid', 'cash', 20, 1, '2026-10-25 10:00:00'),
           (2, 'restaurant', NULL, 'paid', 'card', 10, 1, '2026-10-25 10:05:00'),
           (3, 'restaurant', 1, 'cancelled', 'cash', 99, 1, '2026-10-25 10:10:00'),
           (4, 'restaurant', 1, 'open', NULL, 0, 1, NULL);
    INSERT INTO order_items (order_id, item_id, item_name, category_name, unit_price, qty, line_total)
    VALUES (1, 1, 'شاي', 'مشروبات ساخنة', 10, 2, 20),
           (2, 2, 'قهوة', 'مشروبات ساخنة', 10, 1, 10),
           (3, 1, 'شاي', 'مشروبات ساخنة', 10, 9, 90),
           (4, 2, 'قهوة', 'مشروبات ساخنة', 10, 4, 40);
    INSERT INTO shift_expenses (shift_id, amount, reason, created_by, created_by_name, created_at)
    VALUES (1, 12.5, 'شراء ثلج', 2, 'كاشير', '2026-10-25 11:00:00');
  `);
}

beforeEach(() => {
  const db = sqlite();
  db.exec(`
    DELETE FROM shift_expenses;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM shifts;
    DELETE FROM items;
    DELETE FROM categories;
    DELETE FROM payment_methods;
    DELETE FROM users;
    DELETE FROM venues;
  `);
  seedBase();
});

describe("shift totals with expenses", () => {
  it("totals paid items, subtracts expenses, and sorts items by quantity", () => {
    addShiftExpense({
      shiftId: 1,
      userId: 2,
      userName: "كاشير",
      amount: 7.5,
      reason: "شراء ثلج",
    });

    const totals = getShiftTotals("restaurant", 1);

    expect(totals).toMatchObject({
      invoiceCount: 2,
      totalSales: 30,
      cashTotal: 20,
      nonCashTotal: 10,
      totalItems: 3,
      expenseTotal: 20,
    });
    expect(totals.paymentBreakdown).toEqual([
      {
        code: "cash",
        name: "نقدي",
        deferred: false,
        cashDrawer: true,
        total: 20,
        count: 1,
      },
      {
        code: "card",
        name: "بطاقة",
        deferred: false,
        cashDrawer: false,
        total: 10,
        count: 1,
      },
    ]);
    expect(totals.items).toEqual([
      { name: "شاي", qty: 2, categoryName: "مشروبات ساخنة" },
      { name: "قهوة", qty: 1, categoryName: "مشروبات ساخنة" },
    ]);
  });

  it("groups sold items under their category names", () => {
    sqlite().exec(`
      INSERT INTO categories (id, name) VALUES (2, 'مشروبات باردة');
      INSERT INTO items (id, category_id, name) VALUES (3, 2, 'كولا');
      INSERT INTO order_items (order_id, item_id, item_name, category_name, unit_price, qty, line_total)
      VALUES (2, 3, 'كولا', 'مشروبات باردة', 10, 3, 30);
    `);

    const totals = getShiftTotals("restaurant", 1);

    expect(totals.items).toEqual([
      { name: "كولا", qty: 3, categoryName: "مشروبات باردة" },
      { name: "شاي", qty: 2, categoryName: "مشروبات ساخنة" },
      { name: "قهوة", qty: 1, categoryName: "مشروبات ساخنة" },
    ]);
    expect(totals.totalItems).toBe(6);
  });

  it("counts items from categories outside the report group list", () => {
    sqlite().exec(`
      INSERT INTO categories (id, name) VALUES (3, 'البيتزا');
      INSERT INTO items (id, category_id, name) VALUES (4, 3, 'بيتزا');
      INSERT INTO order_items (order_id, item_id, item_name, category_name, unit_price, qty, line_total)
      VALUES (1, 4, 'بيتزا', 'البيتزا', 30, 4, 120);
    `);

    const totals = getShiftTotals("restaurant", 1);

    expect(totals.items).toContainEqual({
      name: "بيتزا",
      qty: 4,
      categoryName: "البيتزا",
    });
    expect(totals.totalItems).toBe(7);
  });

  it("uses expenses in the report's expected cash and expense lines", () => {
    const data = buildShiftReportData(1, "كاشير رئيسي", "summary");

    expect(data).not.toBeNull();
    expect(data!.expectedCash).toBe(37.5);
    expect(data!.expenses).toEqual([
      {
        id: expect.any(Number),
        reason: "شراء ثلج",
        amount: 12.5,
        createdByName: "كاشير",
      },
    ]);
  });
});

describe("expense lifecycle", () => {
  it("rejects empty reasons and non-positive amounts", () => {
    expect(
      addShiftExpense({
        shiftId: 1,
        userId: 2,
        userName: "كاشير",
        amount: 0,
        reason: "شراء ثلج",
      }),
    ).toEqual({ error: "أدخل مبلغ مصروف أكبر من صفر" });
    expect(
      addShiftExpense({
        shiftId: 1,
        userId: 2,
        userName: "كاشير",
        amount: 5,
        reason: "   ",
      }),
    ).toEqual({ error: "اكتب سبب المصروف" });
  });

  it("rejects expenses on a closed shift", () => {
    closeShift(1, 1, 30);

    expect(
      addShiftExpense({
        shiftId: 1,
        userId: 2,
        userName: "كاشير",
        amount: 5,
        reason: "شراء ثلج",
      }),
    ).toEqual({ error: "لا يمكن تسجيل مصروف بعد إغلاق الوردية" });
  });

  it("removes an expense while the shift is open only", () => {
    const added = addShiftExpense({
      shiftId: 1,
      userId: 2,
      userName: "كاشير",
      amount: 5,
      reason: "شراء ثلج",
    });
    if ("error" in added) throw new Error(added.error);

    expect(removeShiftExpense(added.expense.id)).toMatchObject({ ok: true });
    expect(listShiftExpenses(1).map((expense) => expense.id)).not.toContain(
      added.expense.id,
    );

    const second = addShiftExpense({
      shiftId: 1,
      userId: 2,
      userName: "كاشير",
      amount: 5,
      reason: "شراء ثلج",
    });
    if ("error" in second) throw new Error(second.error);
    closeShift(1, 1, 30);

    expect(removeShiftExpense(second.expense.id)).toEqual({
      error: "لا يمكن حذف مصروف بعد إغلاق الوردية",
    });
  });
});
