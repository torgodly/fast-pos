import Database from "better-sqlite3";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import {
  canWaiterCancelTable,
  canWaiterReduceLineQty,
  clampCancelQty,
  nextKitchenSentAfterCancel,
  orderHasKitchenPending,
} from "@/lib/orders/rules";

/**
 * In-memory SQLite workflow tests — mirrors production order line rules
 * without touching the live data/pos.db file.
 */
function createMemoryDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE venues (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      venue_id TEXT,
      username TEXT,
      password_hash TEXT,
      pin_hash TEXT,
      is_main_cashier INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    CREATE TABLE printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 9100,
      connection_type TEXT NOT NULL DEFAULT 'network',
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      kitchen_printer_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL,
      table_id INTEGER,
      waiter_id INTEGER,
      cashier_id INTEGER,
      shift_id INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      payment_method TEXT,
      total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT
    );
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_id INTEGER,
      item_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      line_total REAL NOT NULL,
      kitchen_sent_qty INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE cancelled_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      order_item_id INTEGER,
      item_id INTEGER,
      item_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      qty_before INTEGER NOT NULL,
      qty_removed INTEGER NOT NULL,
      qty_after INTEGER NOT NULL,
      line_total_removed REAL NOT NULL,
      remaining_total REAL NOT NULL,
      remaining_items_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      removed_by INTEGER,
      removed_by_name TEXT NOT NULL,
      removed_by_role TEXT NOT NULL,
      venue_id TEXT,
      kitchen_was_sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER,
      user_name TEXT NOT NULL,
      role TEXT NOT NULL,
      venue_id TEXT,
      kind TEXT NOT NULL,
      order_id INTEGER REFERENCES orders(id),
      printer_name TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      detail TEXT NOT NULL
    );
  `);

  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

describe("order workflow (memory db)", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof createMemoryDb>["db"];

  beforeEach(() => {
    ({ sqlite, db } = createMemoryDb());
    db.insert(schema.venues)
      .values([
        { id: "cafe", name: "كافيه" },
        { id: "restaurant", name: "مطعم" },
      ])
      .run();
    db.insert(schema.users)
      .values({
        name: "كاشير",
        role: "cashier",
        isMainCashier: true,
        active: true,
      })
      .run();
    db.insert(schema.categories)
      .values({ name: "مشروبات", venueId: null, sortOrder: 1, active: true })
      .run();
    db.insert(schema.items)
      .values({
        name: "شاي",
        price: 7,
        categoryId: 1,
        venueId: null,
        active: true,
      })
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  it("creates quick sale with lines and total in one transaction", () => {
    const order = sqlite.transaction(() => {
      const created = db
        .insert(schema.orders)
        .values({
          venueId: "cafe",
          tableId: null,
          cashierId: 1,
          status: "open",
          total: 14,
        })
        .returning()
        .get();
      db.insert(schema.orderItems)
        .values({
          orderId: created.id,
          itemId: 1,
          itemName: "شاي",
          unitPrice: 7,
          qty: 2,
          lineTotal: 14,
          kitchenSentQty: 0,
        })
        .run();
      return created;
    })();

    const lines = db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, order.id))
      .all();
    expect(lines).toHaveLength(1);
    expect(order.total).toBe(14);
    expect(orderHasKitchenPending(lines)).toBe(true);
  });

  it("keeps paid quick sale when kitchen was never sent (print-later case)", () => {
    const order = db
      .insert(schema.orders)
      .values({
        venueId: "cafe",
        tableId: null,
        cashierId: 1,
        status: "paid",
        paymentMethod: "cash",
        total: 14,
        paidAt: "2026-08-12 10:00:00",
      })
      .returning()
      .get();
    db.insert(schema.orderItems)
      .values({
        orderId: order.id,
        itemId: 1,
        itemName: "شاي",
        unitPrice: 7,
        qty: 2,
        lineTotal: 14,
        kitchenSentQty: 0,
      })
      .run();

    const saved = db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, order.id))
      .get();
    const lines = db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, order.id))
      .all();

    expect(saved?.status).toBe("paid");
    expect(lines).toHaveLength(1);
    expect(orderHasKitchenPending(lines)).toBe(true);
  });

  it("does not leave empty total-only order if audit blocks delete — cleanup cancels ghost", () => {
    const order = db
      .insert(schema.orders)
      .values({
        venueId: "cafe",
        tableId: null,
        cashierId: 1,
        status: "open",
        total: 14,
      })
      .returning()
      .get();
    db.insert(schema.auditEvents)
      .values({
        userName: "كاشير",
        role: "cashier",
        venueId: "cafe",
        kind: "kitchen",
        orderId: order.id,
        success: false,
        detail: "fail",
      })
      .run();

    // Simulate old abort: delete lines, fail to delete order due to FK
    db.delete(schema.orderItems)
      .where(eq(schema.orderItems.orderId, order.id))
      .run();
    expect(() =>
      db.delete(schema.orders).where(eq(schema.orders.id, order.id)).run(),
    ).toThrow();

    // Production cleanup: cancel open quick sales with no lines
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

    const ghost = db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, order.id))
      .get();
    expect(ghost?.status).toBe("cancelled");
    expect(ghost?.total).toBe(0);
  });

  it("main-cashier cancel after kitchen updates qty and ledger", () => {
    const order = db
      .insert(schema.orders)
      .values({
        venueId: "cafe",
        tableId: null,
        cashierId: 1,
        status: "open",
        total: 21,
      })
      .returning()
      .get();
    const line = db
      .insert(schema.orderItems)
      .values({
        orderId: order.id,
        itemId: 1,
        itemName: "شاي",
        unitPrice: 7,
        qty: 3,
        lineTotal: 21,
        kitchenSentQty: 3,
      })
      .returning()
      .get();

    expect(
      canWaiterReduceLineQty({
        qty: line.qty,
        kitchenSentQty: line.kitchenSentQty,
        nextQty: 1,
      }),
    ).toBe(false);

    const removeQty = clampCancelQty(1, line.qty)!;
    const qtyAfter = line.qty - removeQty;
    db.update(schema.orderItems)
      .set({
        qty: qtyAfter,
        lineTotal: qtyAfter * line.unitPrice,
        kitchenSentQty: nextKitchenSentAfterCancel(
          line.kitchenSentQty,
          qtyAfter,
        ),
      })
      .where(eq(schema.orderItems.id, line.id))
      .run();

    const remaining = db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, order.id))
      .all();
    const remainingTotal = remaining.reduce((s, r) => s + r.lineTotal, 0);
    db.update(schema.orders)
      .set({ total: remainingTotal })
      .where(eq(schema.orders.id, order.id))
      .run();
    db.insert(schema.cancelledItems)
      .values({
        orderId: order.id,
        orderItemId: line.id,
        itemId: line.itemId,
        itemName: line.itemName,
        unitPrice: line.unitPrice,
        qtyBefore: 3,
        qtyRemoved: removeQty,
        qtyAfter,
        lineTotalRemoved: removeQty * line.unitPrice,
        remainingTotal,
        remainingItemsJson: JSON.stringify(remaining),
        reason: "خطأ طلب",
        removedBy: 1,
        removedByName: "كاشير",
        removedByRole: "main_cashier",
        venueId: "cafe",
        kitchenWasSent: true,
      })
      .run();

    const updated = db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.id, line.id))
      .get();
    const cancelled = db.select().from(schema.cancelledItems).all();
    expect(updated?.qty).toBe(2);
    expect(updated?.kitchenSentQty).toBe(2);
    expect(cancelled).toHaveLength(1);
    expect(
      canWaiterCancelTable({
        role: "waiter",
        lines: [updated!],
      }),
    ).toBe(false);
  });

  it("marks kitchen sent only up to current qty after successful print mark", () => {
    const order = db
      .insert(schema.orders)
      .values({
        venueId: "cafe",
        status: "open",
        total: 7,
      })
      .returning()
      .get();
    const line = db
      .insert(schema.orderItems)
      .values({
        orderId: order.id,
        itemId: 1,
        itemName: "شاي",
        unitPrice: 7,
        qty: 1,
        lineTotal: 7,
        kitchenSentQty: 0,
      })
      .returning()
      .get();

    db.update(schema.orderItems)
      .set({ kitchenSentQty: line.qty })
      .where(eq(schema.orderItems.id, line.id))
      .run();

    const after = db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.id, line.id))
      .get();
    expect(after?.kitchenSentQty).toBe(1);
    expect(orderHasKitchenPending([after!])).toBe(false);
  });

  it("counts paid revenue only from paid orders", () => {
    db.insert(schema.orders)
      .values([
        {
          venueId: "cafe",
          status: "paid",
          total: 14,
          paymentMethod: "cash",
          paidAt: "2026-08-12 10:00:00",
        },
        {
          venueId: "cafe",
          status: "open",
          total: 99,
        },
        {
          venueId: "cafe",
          status: "cancelled",
          total: 50,
        },
      ])
      .run();

    const paid = db
      .select({
        total: sql<number>`sum(${schema.orders.total})`.mapWith(Number),
      })
      .from(schema.orders)
      .where(
        and(eq(schema.orders.venueId, "cafe"), eq(schema.orders.status, "paid")),
      )
      .get();

    expect(paid?.total).toBe(14);
  });
});
