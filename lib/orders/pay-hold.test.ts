// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  sqlite: null as import("better-sqlite3").Database | null,
  consume: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({
    userId: 1,
    name: "كاشير",
    role: "cashier",
    venueId: "restaurant",
    mustChangePin: false,
  }),
}));
vi.mock("@/app/actions/station", () => ({
  getCashierStationContext: async () => ({
    station: { id: 1, venueId: "restaurant", name: "كاشير", printerId: 1, active: true },
    printer: {
      id: 1,
      venueId: "restaurant",
      name: "Checkout",
      role: "checkout",
      host: "default",
      port: 9100,
      connectionType: "local",
      autoPrint: false,
      active: true,
    },
  }),
}));
vi.mock("@/lib/settings", () => ({
  getBrandDetails: () => ({ name: "Fast POS", phone: "", address: "" }),
  getReceiptFooterMessage: () => "",
}));
vi.mock("@/lib/print/logo", () => ({
  getReceiptLogoPrintDataUrl: () => null,
}));
vi.mock("@/lib/print/checkout-bytes", () => ({
  buildCheckoutPrintBytes: async () => new Uint8Array(),
}));
vi.mock("@/lib/print/windows-raw", () => ({
  printRawToWindowsPrinter: async () => {},
}));
vi.mock("@/lib/print/network", () => ({
  printToPrinter: async () => {},
}));
vi.mock("@/lib/print/escpos", () => ({
  buildKitchenEscPos: () => new Uint8Array(),
  chunkKitchenLines: (lines: unknown[]) => [lines],
}));
vi.mock("@/lib/print/resolve-kitchen-printer", () => ({
  resolveKitchenPrinterForVenue: () => ({
    id: 2,
    venueId: null,
    name: "مطبخ",
    role: "kitchen",
    host: "127.0.0.1",
    port: 9100,
    connectionType: "network",
    autoPrint: false,
    active: true,
  }),
}));
vi.mock("@/lib/inventory/service", () => ({
  consumeForPaidOrder: (...args: unknown[]) => holder.consume(...args),
}));

vi.mock("@/lib/db", async () => {
  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const schema = await import("@/lib/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
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
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL,
      work_date TEXT NOT NULL,
      shift_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      opened_by INTEGER,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      opening_float REAL NOT NULL DEFAULT 0,
      closed_by INTEGER,
      closed_at TEXT,
      expected_cash REAL,
      counted_cash REAL,
      difference REAL,
      x_printed_at TEXT
    );
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      kitchen_printer_id INTEGER,
      restaurant_kitchen_printer_id INTEGER,
      cafe_kitchen_printer_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      kitchen_printer_id INTEGER,
      unit_id INTEGER,
      track_stock INTEGER NOT NULL DEFAULT 0,
      stock_base INTEGER NOT NULL DEFAULT 0,
      low_stock_base INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL,
      table_id INTEGER,
      customer_id INTEGER,
      waiter_id INTEGER,
      cashier_id INTEGER,
      shift_id INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      payment_method TEXT,
      held_at TEXT,
      held_by INTEGER,
      total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT
    );
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_id INTEGER,
      item_name TEXT NOT NULL,
      category_name TEXT,
      unit_price REAL NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      line_total REAL NOT NULL,
      kitchen_sent_qty INTEGER NOT NULL DEFAULT 0,
      note TEXT
    );
    CREATE TABLE audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER,
      user_name TEXT NOT NULL,
      role TEXT NOT NULL,
      venue_id TEXT,
      kind TEXT NOT NULL,
      order_id INTEGER,
      printer_name TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      detail TEXT NOT NULL
    );
  `);
  holder.sqlite = sqlite;
  return {
    db: drizzle(sqlite, { schema }),
    getSqlite: () => sqlite,
  };
});

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { payOrder, payQuickSale } from "@/app/actions/orders";

function sqlite() {
  return holder.sqlite!;
}

function reset() {
  const database = sqlite();
  database.exec(`
    DELETE FROM audit_events;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM items;
    DELETE FROM categories;
    DELETE FROM shifts;
    DELETE FROM customers;
    DELETE FROM users;
    DELETE FROM payment_methods;
    INSERT INTO payment_methods
      (code, name, deferred, cash_drawer, built_in, active, sort_order)
    VALUES ('cash', 'نقدي', 0, 1, 1, 1, 10),
           ('card', 'بطاقة', 0, 0, 1, 1, 20),
           ('presto', 'بريستو', 1, 0, 0, 1, 30),
           ('old', 'قديمة', 0, 0, 0, 0, 40);
    INSERT INTO users (id, name, role) VALUES (1, 'كاشير', 'cashier');
    INSERT INTO categories (id, name) VALUES (1, 'مشروبات');
    INSERT INTO items (id, category_id, name, price)
    VALUES (1, 1, 'شاي', 7);
    INSERT INTO shifts
      (id, venue_id, work_date, shift_number, status, opened_by, opened_at, opening_float)
    VALUES (1, 'restaurant', '2026-10-25', 1, 'open', 1, '2026-10-25 09:00:00', 30);
    INSERT INTO orders
      (id, venue_id, table_id, status, total, payment_method)
    VALUES (1, 'restaurant', NULL, 'open', 14, NULL);
    INSERT INTO order_items
      (order_id, item_id, item_name, category_name, unit_price, qty, line_total)
    VALUES (1, 1, 'شاي', 'مشروبات', 7, 2, 14);
  `);
  holder.consume.mockReset();
  holder.consume.mockReturnValue({
    skipped: false,
    warnings: [],
    consumed: [],
  });
}

function readOrder(id: number) {
  return db.select().from(orders).where(eq(orders.id, id)).get()!;
}

beforeEach(reset);

describe("payOrder deferred holds", () => {
  it("holds the order without payment, shift, inventory, or receipt", async () => {
    sqlite().exec(`DELETE FROM shifts`);

    const result = await payOrder(1, "presto");

    expect(result).toMatchObject({ ok: true, held: true });
    const saved = readOrder(1);
    expect(saved.status).toBe("open");
    expect(saved.paymentMethod).toBe("presto");
    expect(saved.heldAt).toBeTruthy();
    expect(saved.heldBy).toBe(1);
    expect(saved.paidAt).toBeNull();
    expect(saved.shiftId).toBeNull();
    expect(holder.consume).not.toHaveBeenCalled();

    const audit = sqlite()
      .prepare(`SELECT kind, detail FROM audit_events WHERE order_id = 1`)
      .all() as Array<{ kind: string; detail: string }>;
    expect(audit).toContainEqual(
      expect.objectContaining({
        kind: "hold",
        detail: expect.stringContaining("بريستو"),
      }),
    );
  });

  it("settles the held order with the real method and clears the hold", async () => {
    await payOrder(1, "presto");

    const result = await payOrder(1, "cash");

    expect(result).toMatchObject({ ok: true, browserPrint: true });
    if ("error" in result) throw new Error(result.error);
    expect(result.receiptHtml).toContain("نقدي");

    const saved = readOrder(1);
    expect(saved.status).toBe("paid");
    expect(saved.paymentMethod).toBe("cash");
    expect(saved.heldAt).toBeNull();
    expect(saved.heldBy).toBeNull();
    expect(saved.shiftId).toBe(1);
    expect(saved.paidAt).toBeTruthy();
    expect(holder.consume).toHaveBeenCalledWith(1, {
      userId: 1,
      name: "كاشير",
    });
  });

  it("rejects unknown and inactive methods", async () => {
    expect(await payOrder(1, "missing")).toEqual({
      error: "طريقة الدفع غير متاحة — حدّث الصفحة",
    });
    expect(await payOrder(1, "old")).toEqual({
      error: "طريقة الدفع غير متاحة — حدّث الصفحة",
    });
    expect(readOrder(1).status).toBe("open");
  });
});

describe("payQuickSale deferred holds", () => {
  it("holds a phone order, prints its kitchen ticket, and settles it later", async () => {
    sqlite().exec(`DELETE FROM shifts`);

    const held = await payQuickSale(
      "restaurant",
      [{ itemId: 1, name: "شاي", unitPrice: 7, qty: 2 }],
      "presto",
      null,
    );

    expect(held).toMatchObject({
      ok: true,
      held: true,
      kitchenFailed: false,
      receiptFailed: false,
    });
    if ("error" in held) throw new Error(held.error);

    const saved = readOrder(held.orderId);
    expect(saved.status).toBe("open");
    expect(saved.paymentMethod).toBe("presto");
    expect(saved.heldAt).toBeTruthy();
    expect(saved.paidAt).toBeNull();
    expect(saved.shiftId).toBeNull();
    expect(holder.consume).not.toHaveBeenCalled();

    const kitchenSent = sqlite()
      .prepare(`SELECT kitchen_sent_qty FROM order_items WHERE order_id = ?`)
      .get(held.orderId) as { kitchen_sent_qty: number };
    expect(kitchenSent.kitchen_sent_qty).toBe(2);

    sqlite().exec(`
      INSERT INTO shifts
        (id, venue_id, work_date, shift_number, status, opened_by, opened_at, opening_float)
      VALUES (1, 'restaurant', '2026-10-25', 1, 'open', 1, '2026-10-25 09:00:00', 30)
    `);

    const settled = await payOrder(held.orderId, "card");
    expect(settled).toMatchObject({ ok: true, browserPrint: true });

    const after = readOrder(held.orderId);
    expect(after.status).toBe("paid");
    expect(after.paymentMethod).toBe("card");
    expect(after.heldAt).toBeNull();
    expect(after.shiftId).toBe(1);
    expect(holder.consume).toHaveBeenCalledTimes(1);
  });
});
