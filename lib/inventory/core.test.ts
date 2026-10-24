import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import {
  adjustForInvoiceEdit,
  adjustItemStock,
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
    CREATE TABLE units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      factor_to_base INTEGER NOT NULL,
      built_in INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      preferred_unit_id INTEGER,
      stock_base INTEGER NOT NULL DEFAULT 0,
      low_stock_base INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      item_id INTEGER,
      target_name TEXT NOT NULL,
      qty_base INTEGER NOT NULL,
      unit_id INTEGER,
      unit_name TEXT,
      unit_kind TEXT,
      factor_to_base INTEGER,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL
    );
    CREATE TABLE item_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      qty_base INTEGER NOT NULL,
      UNIQUE(item_id, ingredient_id)
    );
    CREATE TABLE ingredient_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER,
      ingredient_name TEXT NOT NULL,
      delta_base INTEGER NOT NULL,
      kind TEXT NOT NULL,
      order_id INTEGER,
      invoice_id INTEGER,
      user_id INTEGER,
      user_name TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE item_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      item_name TEXT NOT NULL,
      delta_base INTEGER NOT NULL,
      kind TEXT NOT NULL,
      unit_name TEXT,
      unit_kind TEXT,
      factor_to_base INTEGER,
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
  let kiloId: number;
  let pieceId: number;
  let dozenId: number;

  beforeEach(() => {
    ({ sqlite, db } = createMemoryDb());
    const gram = db
      .insert(schema.units)
      .values({ name: "غرام", kind: "weight", factorToBase: 1, active: true })
      .returning()
      .get();
    const kilo = db
      .insert(schema.units)
      .values({ name: "كيلو", kind: "weight", factorToBase: 1000, active: true })
      .returning()
      .get();
    const piece = db
      .insert(schema.units)
      .values({ name: "حبة", kind: "count", factorToBase: 1, active: true })
      .returning()
      .get();
    const dozen = db
      .insert(schema.units)
      .values({ name: "دزينة", kind: "count", factorToBase: 12, active: true })
      .returning()
      .get();
    kiloId = kilo.id;
    pieceId = piece.id;
    dozenId = dozen.id;
    expect(gram.id).toBeGreaterThan(0);

    const ingredient = db
      .insert(schema.ingredients)
      .values({
        name: "لحم",
        preferredUnitId: kiloId,
        stockBase: 10_000,
        lowStockBase: 2_000,
        active: true,
      })
      .returning()
      .get();
    ingredientId = ingredient.id;

    db.insert(schema.itemIngredients)
      .values({ itemId: 10, ingredientId, qtyBase: 200 })
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

  function ingredientStockBase() {
    return db
      .select({ stockBase: schema.ingredients.stockBase })
      .from(schema.ingredients)
      .where(eq(schema.ingredients.id, ingredientId))
      .get()!.stockBase;
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
            targetType: "ingredient",
            targetId: ingredientId,
            qty: 2,
            unitId: kiloId,
            unitPrice: 30,
          },
        ],
        user,
      },
    );

    expect(result.totalCost).toBe(60);
    expect(ingredientStockBase()).toBe(12_000);

    const lines = db
      .select()
      .from(schema.purchaseInvoiceLines)
      .where(eq(schema.purchaseInvoiceLines.invoiceId, result.invoiceId))
      .all();
    expect(lines).toHaveLength(1);
    expect(lines[0]!.qtyBase).toBe(2_000);
    expect(lines[0]!.targetName).toBe("لحم");
    expect(lines[0]!.unitName).toBe("كيلو");
    expect(lines[0]!.factorToBase).toBe(1000);
    expect(lines[0]!.itemId).toBeNull();

    const movements = db
      .select()
      .from(schema.ingredientMovements)
      .where(eq(schema.ingredientMovements.invoiceId, result.invoiceId))
      .all();
    expect(movements).toHaveLength(1);
    expect(movements[0]!.kind).toBe("purchase");
    expect(movements[0]!.deltaBase).toBe(2_000);
  });

  it("consumes stock on payment and is idempotent", () => {
    const first = consumeForPaidOrder({ db, sqlite }, 1, user);
    expect(first.skipped).toBe(false);
    expect(first.consumed).toEqual([
      {
        targetType: "ingredient",
        targetId: ingredientId,
        name: "لحم",
        baseQty: 400,
        unitName: "كيلو",
        unitKind: "weight",
        factorToBase: 1000,
      },
    ]);
    expect(ingredientStockBase()).toBe(9_600);

    const second = consumeForPaidOrder({ db, sqlite }, 1, user);
    expect(second.skipped).toBe(true);
    expect(ingredientStockBase()).toBe(9_600);

    const movements = movementsFor(1);
    expect(movements).toHaveLength(1);
    expect(movements[0]!.kind).toBe("sale");
    expect(movements[0]!.deltaBase).toBe(-400);
  });

  it("allows negative stock and returns insufficiency warnings", () => {
    db.update(schema.ingredients)
      .set({ stockBase: 100 })
      .where(eq(schema.ingredients.id, ingredientId))
      .run();

    const result = consumeForPaidOrder({ db, sqlite }, 1, user);
    expect(result.warnings).toEqual([
      {
        targetId: ingredientId,
        targetType: "ingredient",
        name: "لحم",
        deficitBase: 300,
        unitName: "كيلو",
        unitKind: "weight",
        factorToBase: 1000,
      },
    ]);
    expect(ingredientStockBase()).toBe(-300);
  });

  it("applies invoice quantity deltas to paid orders", () => {
    consumeForPaidOrder({ db, sqlite }, 1, user);
    expect(ingredientStockBase()).toBe(9_600);

    const add = adjustForInvoiceEdit(
      { db, sqlite },
      1,
      [{ itemId: 10, deltaQty: 1 }],
      user,
    );
    expect(add.warnings).toEqual([]);
    expect(ingredientStockBase()).toBe(9_400);

    adjustForInvoiceEdit(
      { db, sqlite },
      1,
      [{ itemId: 10, deltaQty: -1 }],
      user,
    );
    expect(ingredientStockBase()).toBe(9_600);

    const edits = movementsFor(1).filter((m) => m.kind === "invoice_edit");
    expect(edits.map((m) => m.deltaBase)).toEqual([-200, 200]);
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
    expect(ingredientStockBase()).toBe(9_400);
    expect(movementsFor(1)).toHaveLength(2);
  });

  it("returns stock when a paid invoice is cancelled and re-consumes on restore", () => {
    consumeForPaidOrder({ db, sqlite }, 1, user);
    expect(ingredientStockBase()).toBe(9_600);

    const returned = returnForCancelledPaidOrder({ db, sqlite }, 1, user);
    expect(returned.returned).toEqual([
      {
        targetType: "ingredient",
        targetId: ingredientId,
        name: "لحم",
        baseQty: 400,
        unitName: "كيلو",
        unitKind: "weight",
        factorToBase: 1000,
      },
    ]);
    expect(ingredientStockBase()).toBe(10_000);

    const restored = reconsumeForRestoredOrder({ db, sqlite }, 1, user);
    expect(restored.skipped).toBe(false);
    expect(ingredientStockBase()).toBe(9_600);

    const kinds = movementsFor(1).map((m) => m.kind);
    expect(kinds).toEqual(["sale", "cancel_return", "sale"]);
  });

  it("adjusts stock manually and records an adjust movement", () => {
    const result = adjustStock(
      { db, sqlite },
      {
        ingredientId,
        delta: -1.5,
        unitId: kiloId,
        note: "جرد",
        user,
      },
    );
    expect(result.stockBase).toBe(8_500);

    const movements = db.select().from(schema.ingredientMovements).all();
    expect(movements).toHaveLength(1);
    expect(movements[0]!.kind).toBe("adjust");
    expect(movements[0]!.deltaBase).toBe(-1_500);
    expect(movements[0]!.userName).toBe("مدير");
  });

  it("tracks resale item stock on purchase, adjustment and payment", () => {
    const cola = db
      .insert(schema.items)
      .values({
        name: "كولا",
        price: 2,
        categoryId: 1,
        unitId: pieceId,
        trackStock: true,
        stockBase: 10,
        lowStockBase: 0,
        active: true,
      })
      .returning()
      .get();

    const itemStockBase = () =>
      db
        .select({ stockBase: schema.items.stockBase })
        .from(schema.items)
        .where(eq(schema.items.id, cola.id))
        .get()!.stockBase;

    receivePurchaseInvoice(
      { db, sqlite },
      {
        supplierId: null,
        invoiceNumber: "INV-2",
        note: null,
        lines: [
          {
            targetType: "item",
            targetId: cola.id,
            qty: 2,
            unitId: dozenId,
            unitPrice: 20,
          },
        ],
        user,
      },
    );
    expect(itemStockBase()).toBe(34);

    const purchaseLine = db
      .select()
      .from(schema.purchaseInvoiceLines)
      .where(eq(schema.purchaseInvoiceLines.itemId, cola.id))
      .get();
    expect(purchaseLine?.qtyBase).toBe(24);
    expect(purchaseLine?.unitName).toBe("دزينة");
    expect(purchaseLine?.ingredientId).toBeNull();

    const adjusted = adjustItemStock(
      { db, sqlite },
      { itemId: cola.id, delta: -2, unitId: pieceId, note: "تالف", user },
    );
    expect(adjusted.stockBase).toBe(32);

    db.insert(schema.orderItems)
      .values({
        orderId: 2,
        itemId: cola.id,
        itemName: "كولا",
        unitPrice: 2,
        qty: 3,
        lineTotal: 6,
        kitchenSentQty: 0,
      })
      .run();

    const result = consumeForPaidOrder({ db, sqlite }, 2, user);
    expect(result.skipped).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.consumed).toEqual([
      {
        targetType: "item",
        targetId: cola.id,
        name: "كولا",
        baseQty: 3,
        unitName: "حبة",
        unitKind: "count",
        factorToBase: 1,
      },
    ]);
    expect(itemStockBase()).toBe(29);

    const movements = db
      .select()
      .from(schema.itemMovements)
      .where(eq(schema.itemMovements.orderId, 2))
      .all();
    expect(movements).toHaveLength(1);
    expect(movements[0]!.kind).toBe("sale");
    expect(movements[0]!.deltaBase).toBe(-3);
    expect(movements[0]!.unitName).toBe("حبة");
  });
});
