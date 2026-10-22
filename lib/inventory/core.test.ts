import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import {
  adjustForInvoiceEdit,
  adjustStock,
  consumeForPaidOrder,
  receivePurchaseInvoice,
  reconsumeForRestoredOrder,
  returnForCancelledPaidOrder,
  type InventoryUser,
} from "./core";

function createMemoryDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      stock_grams INTEGER NOT NULL DEFAULT 0,
      low_stock_grams INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE purchase_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER,
      invoice_number TEXT,
      note TEXT,
      total_cost REAL NOT NULL DEFAULT 0,
      created_by INTEGER,
      created_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE purchase_invoice_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      ingredient_id INTEGER,
      ingredient_name TEXT NOT NULL,
      qty_grams INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      unit_basis TEXT NOT NULL DEFAULT 'kg',
      line_total REAL NOT NULL
    );
    CREATE TABLE item_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      grams_per_unit INTEGER NOT NULL,
      UNIQUE(item_id, ingredient_id)
    );
    CREATE TABLE ingredient_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER,
      ingredient_name TEXT NOT NULL,
      delta_grams INTEGER NOT NULL,
      kind TEXT NOT NULL,
      order_id INTEGER,
      invoice_id INTEGER,
      user_id INTEGER,
      user_name TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  `);

  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

const user: InventoryUser = { userId: 1, name: "مدير" };

describe("inventory core (memory db)", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof createMemoryDb>["db"];
  let ingredientId: number;

  beforeEach(() => {
    ({ sqlite, db } = createMemoryDb());
    const ingredient = db
      .insert(schema.ingredients)
      .values({
        name: "لحم",
        stockGrams: 10_000,
        lowStockGrams: 2_000,
        active: true,
      })
      .returning()
      .get();
    ingredientId = ingredient.id;

    db.insert(schema.itemIngredients)
      .values({ itemId: 10, ingredientId, gramsPerUnit: 200 })
      .run();

    db.insert(schema.orderItems)
      .values({
        orderId: 1,
        itemId: 10,
        itemName: "برغر",
        unitPrice: 20,
        qty: 2,
        lineTotal: 40,
        kitchenSentQty: 0,
      })
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  function stockGrams() {
    return db
      .select({ stockGrams: schema.ingredients.stockGrams })
      .from(schema.ingredients)
      .where(eq(schema.ingredients.id, ingredientId))
      .get()!.stockGrams;
  }

  function movementsFor(orderId: number) {
    return db
      .select()
      .from(schema.ingredientMovements)
      .where(eq(schema.ingredientMovements.orderId, orderId))
      .all();
  }

  it("receives a purchase invoice and increments stock with movements", () => {
    const supplier = db
      .insert(schema.suppliers)
      .values({ name: "مورد اللحوم", active: true })
      .returning()
      .get();

    const result = receivePurchaseInvoice(
      { db, sqlite },
      {
        supplierId: supplier.id,
        invoiceNumber: "INV-1",
        note: null,
        lines: [
          {
            ingredientId,
            qty: 2,
            unitBasis: "kg",
            unitPrice: 30,
          },
        ],
        user,
      },
    );

    expect(result.totalCost).toBe(60);
    expect(stockGrams()).toBe(12_000);

    const lines = db
      .select()
      .from(schema.purchaseInvoiceLines)
      .where(eq(schema.purchaseInvoiceLines.invoiceId, result.invoiceId))
      .all();
    expect(lines).toHaveLength(1);
    expect(lines[0]!.qtyGrams).toBe(2_000);
    expect(lines[0]!.unitBasis).toBe("kg");

    const movements = db
      .select()
      .from(schema.ingredientMovements)
      .where(eq(schema.ingredientMovements.invoiceId, result.invoiceId))
      .all();
    expect(movements).toHaveLength(1);
    expect(movements[0]!.kind).toBe("purchase");
    expect(movements[0]!.deltaGrams).toBe(2_000);
  });

  it("consumes stock on payment and is idempotent", () => {
    const first = consumeForPaidOrder({ db, sqlite }, 1, user);
    expect(first.skipped).toBe(false);
    expect(first.consumed).toEqual([
      { ingredientId, name: "لحم", grams: 400 },
    ]);
    expect(stockGrams()).toBe(9_600);

    const second = consumeForPaidOrder({ db, sqlite }, 1, user);
    expect(second.skipped).toBe(true);
    expect(stockGrams()).toBe(9_600);

    const movements = movementsFor(1);
    expect(movements).toHaveLength(1);
    expect(movements[0]!.kind).toBe("sale");
    expect(movements[0]!.deltaGrams).toBe(-400);
  });

  it("allows negative stock and returns insufficiency warnings", () => {
    db.update(schema.ingredients)
      .set({ stockGrams: 100 })
      .where(eq(schema.ingredients.id, ingredientId))
      .run();

    const result = consumeForPaidOrder({ db, sqlite }, 1, user);
    expect(result.warnings).toEqual([
      { ingredientId, name: "لحم", deficit: 300 },
    ]);
    expect(stockGrams()).toBe(-300);
  });

  it("applies invoice quantity deltas to paid orders", () => {
    consumeForPaidOrder({ db, sqlite }, 1, user);
    expect(stockGrams()).toBe(9_600);

    const add = adjustForInvoiceEdit(
      { db, sqlite },
      1,
      [{ itemId: 10, deltaQty: 1 }],
      user,
    );
    expect(add.warnings).toEqual([]);
    expect(stockGrams()).toBe(9_400);

    adjustForInvoiceEdit(
      { db, sqlite },
      1,
      [{ itemId: 10, deltaQty: -1 }],
      user,
    );
    expect(stockGrams()).toBe(9_600);

    const edits = movementsFor(1).filter((m) => m.kind === "invoice_edit");
    expect(edits.map((m) => m.deltaGrams)).toEqual([-200, 200]);
  });

  it("consumes the pre-edit baseline for a legacy unpaid-consumed order", () => {
    const result = adjustForInvoiceEdit(
      { db, sqlite },
      1,
      [{ itemId: 10, deltaQty: 1 }],
      user,
    );
    expect(result.warnings).toEqual([]);
    // Baseline qty 2 (−400) plus the added unit (−200).
    expect(stockGrams()).toBe(9_400);
    expect(movementsFor(1)).toHaveLength(2);
  });

  it("returns stock when a paid invoice is cancelled and re-consumes on restore", () => {
    consumeForPaidOrder({ db, sqlite }, 1, user);
    expect(stockGrams()).toBe(9_600);

    const returned = returnForCancelledPaidOrder({ db, sqlite }, 1, user);
    expect(returned.returned).toEqual([{ name: "لحم", grams: 400 }]);
    expect(stockGrams()).toBe(10_000);

    const restored = reconsumeForRestoredOrder({ db, sqlite }, 1, user);
    expect(restored.skipped).toBe(false);
    expect(stockGrams()).toBe(9_600);

    const kinds = movementsFor(1).map((m) => m.kind);
    expect(kinds).toEqual(["sale", "cancel_return", "sale"]);
  });

  it("adjusts stock manually and records an adjust movement", () => {
    const result = adjustStock(
      { db, sqlite },
      {
        ingredientId,
        deltaGrams: -1_500,
        note: "جرد",
        user,
      },
    );
    expect(result.stockGrams).toBe(8_500);

    const movements = db.select().from(schema.ingredientMovements).all();
    expect(movements).toHaveLength(1);
    expect(movements[0]!.kind).toBe("adjust");
    expect(movements[0]!.deltaGrams).toBe(-1_500);
    expect(movements[0]!.userName).toBe("مدير");
  });
});
