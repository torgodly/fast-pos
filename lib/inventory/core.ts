import { and, eq, inArray, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";
import * as schema from "@/lib/db/schema";
import {
  ingredientMovements,
  ingredients,
  itemIngredients,
  orderItems,
  purchaseInvoiceLines,
  purchaseInvoices,
} from "@/lib/db/schema";
import {
  computeConsumption,
  findInsufficient,
  gramsFromQuantity,
  insufficientWarningText,
  lineCost,
  roundMoney,
  type BomEntry,
  type InsufficientIngredient,
  type QuantityBasis,
} from "./rules";

export type InventoryDbContext = {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: Database.Database;
};

export type InventoryUser = {
  userId: number;
  name: string;
};

export type PurchaseLineInput = {
  ingredientId: number;
  qty: number;
  unitBasis: QuantityBasis;
  unitPrice: number;
};

export type PurchaseInvoiceInput = {
  supplierId: number | null;
  invoiceNumber?: string | null;
  note?: string | null;
  lines: PurchaseLineInput[];
  user: InventoryUser;
};

export type ConsumptionResult = {
  skipped: boolean;
  warnings: InsufficientIngredient[];
  consumed: Array<{ ingredientId: number; name: string; grams: number }>;
};

export type InvoiceDelta = {
  itemId: number | null;
  deltaQty: number;
};

const ORDER_KINDS = ["sale", "invoice_edit", "cancel_return"] as const;

function loadBom(
  ctx: InventoryDbContext,
  itemIds: number[],
): Map<number, BomEntry[]> {
  const map = new Map<number, BomEntry[]>();
  const unique = [...new Set(itemIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return map;

  const rows = ctx.db
    .select({
      itemId: itemIngredients.itemId,
      ingredientId: itemIngredients.ingredientId,
      gramsPerUnit: itemIngredients.gramsPerUnit,
    })
    .from(itemIngredients)
    .where(inArray(itemIngredients.itemId, unique))
    .all();

  for (const row of rows) {
    const list = map.get(row.itemId) ?? [];
    list.push({
      ingredientId: row.ingredientId,
      gramsPerUnit: row.gramsPerUnit,
    });
    map.set(row.itemId, list);
  }
  return map;
}

/** Net grams per ingredient for an order: negative means consumed, positive returned. */
function netForOrder(
  ctx: InventoryDbContext,
  orderId: number,
): Map<number, number> {
  const rows = ctx.db
    .select({
      ingredientId: ingredientMovements.ingredientId,
      deltaGrams: ingredientMovements.deltaGrams,
    })
    .from(ingredientMovements)
    .where(
      and(
        eq(ingredientMovements.orderId, orderId),
        inArray(ingredientMovements.kind, [...ORDER_KINDS]),
      ),
    )
    .all();

  const net = new Map<number, number>();
  for (const row of rows) {
    if (row.ingredientId == null) continue;
    net.set(
      row.ingredientId,
      (net.get(row.ingredientId) ?? 0) + row.deltaGrams,
    );
  }
  return net;
}

function ingredientStockMap(
  ctx: InventoryDbContext,
  ids: number[],
): Map<number, { name: string; stockGrams: number }> {
  const map = new Map<number, { name: string; stockGrams: number }>();
  if (ids.length === 0) return map;
  const rows = ctx.db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      stockGrams: ingredients.stockGrams,
    })
    .from(ingredients)
    .where(inArray(ingredients.id, ids))
    .all();
  for (const row of rows) {
    map.set(row.id, { name: row.name, stockGrams: row.stockGrams });
  }
  return map;
}

function addStock(ctx: InventoryDbContext, ingredientId: number, deltaGrams: number) {
  ctx.db
    .update(ingredients)
    .set({ stockGrams: sql`${ingredients.stockGrams} + ${deltaGrams}` })
    .where(eq(ingredients.id, ingredientId))
    .run();
}

function writeMovement(
  ctx: InventoryDbContext,
  input: {
    ingredientId: number;
    ingredientName: string;
    deltaGrams: number;
    kind: (typeof schema.ingredientMovements.$inferInsert)["kind"];
    orderId?: number | null;
    invoiceId?: number | null;
    user: InventoryUser;
    note?: string | null;
  },
) {
  ctx.db
    .insert(ingredientMovements)
    .values({
      ingredientId: input.ingredientId,
      ingredientName: input.ingredientName,
      deltaGrams: input.deltaGrams,
      kind: input.kind,
      orderId: input.orderId ?? null,
      invoiceId: input.invoiceId ?? null,
      userId: input.user.userId,
      userName: input.user.name,
      note: input.note ?? null,
    })
    .run();
}

/** Must run inside a transaction. */
function consumeWithin(
  ctx: InventoryDbContext,
  orderId: number,
  user: InventoryUser,
): ConsumptionResult {
  const net = netForOrder(ctx, orderId);
  const alreadyConsumed = [...net.values()].some((value) => value < 0);
  if (alreadyConsumed) {
    return { skipped: true, warnings: [], consumed: [] };
  }

  const lines = ctx.db
    .select({ itemId: orderItems.itemId, qty: orderItems.qty })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();
  if (lines.length === 0) {
    return { skipped: true, warnings: [], consumed: [] };
  }

  const bom = loadBom(
    ctx,
    lines.map((line) => line.itemId).filter((id): id is number => id != null),
  );
  const consumption = computeConsumption(bom, lines);
  if (consumption.size === 0) {
    return { skipped: true, warnings: [], consumed: [] };
  }

  const stock = ingredientStockMap(ctx, [...consumption.keys()]);
  const warnings = findInsufficient(consumption, stock);
  const consumed: ConsumptionResult["consumed"] = [];

  for (const [ingredientId, grams] of consumption) {
    const ingredient = stock.get(ingredientId);
    if (!ingredient || grams <= 0) continue;
    addStock(ctx, ingredientId, -grams);
    writeMovement(ctx, {
      ingredientId,
      ingredientName: ingredient.name,
      deltaGrams: -grams,
      kind: "sale",
      orderId,
      user,
      note: "استهلاك عند الدفع",
    });
    consumed.push({ ingredientId, name: ingredient.name, grams });
  }

  return { skipped: false, warnings, consumed };
}

export function receivePurchaseInvoice(
  ctx: InventoryDbContext,
  input: PurchaseInvoiceInput,
): { invoiceId: number; totalCost: number } {
  if (input.lines.length === 0) {
    throw new Error("أضف بنداً واحداً على الأقل");
  }

  const normalized = input.lines.map((line) => {
    const qty = Number(line.qty);
    const unitPrice = Number(line.unitPrice);
    const basis: QuantityBasis = line.unitBasis === "g" ? "g" : "kg";
    const qtyGrams = gramsFromQuantity(qty, basis);
    if (!Number.isInteger(line.ingredientId) || line.ingredientId <= 0) {
      throw new Error("بند مشتريات غير صالح");
    }
    if (!Number.isFinite(qty) || qty <= 0 || qtyGrams <= 0) {
      throw new Error("الكمية يجب أن تكون أكبر من صفر");
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error("سعر الوحدة غير صالح");
    }
    return { ...line, basis, qty, unitPrice, qtyGrams };
  });

  const ids = [...new Set(normalized.map((line) => line.ingredientId))];
  const ingredientRows = ctx.db
    .select()
    .from(ingredients)
    .where(inArray(ingredients.id, ids))
    .all();
  const byId = new Map(ingredientRows.map((row) => [row.id, row]));
  for (const id of ids) {
    if (!byId.has(id)) throw new Error("أحد المكونات غير موجود");
  }

  const totalCost = roundMoney(
    normalized.reduce((sum, line) => sum + lineCost(line.qty, line.unitPrice), 0),
  );

  return ctx.sqlite.transaction(() => {
    const invoice = ctx.db
      .insert(purchaseInvoices)
      .values({
        supplierId: input.supplierId ?? null,
        invoiceNumber: input.invoiceNumber?.trim() || null,
        note: input.note?.trim() || null,
        totalCost,
        createdBy: input.user.userId,
        createdByName: input.user.name,
      })
      .returning()
      .get();

    for (const line of normalized) {
      const ingredient = byId.get(line.ingredientId)!;
      ctx.db
        .insert(purchaseInvoiceLines)
        .values({
          invoiceId: invoice.id,
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          qtyGrams: line.qtyGrams,
          unitPrice: line.unitPrice,
          unitBasis: line.basis,
          lineTotal: lineCost(line.qty, line.unitPrice),
        })
        .run();
      addStock(ctx, ingredient.id, line.qtyGrams);
      writeMovement(ctx, {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        deltaGrams: line.qtyGrams,
        kind: "purchase",
        invoiceId: invoice.id,
        user: input.user,
        note: input.invoiceNumber?.trim() || null,
      });
    }

    return { invoiceId: invoice.id, totalCost };
  })();
}

/** Consume stock for a newly paid order. Idempotent across retries. */
export function consumeForPaidOrder(
  ctx: InventoryDbContext,
  orderId: number,
  user: InventoryUser,
): ConsumptionResult {
  return ctx.sqlite.transaction(() => consumeWithin(ctx, orderId, user))();
}

/** Restock everything a paid order consumed (admin cancels a paid invoice). */
export function returnForCancelledPaidOrder(
  ctx: InventoryDbContext,
  orderId: number,
  user: InventoryUser,
): { returned: Array<{ name: string; grams: number }> } {
  return ctx.sqlite.transaction(() => {
    const net = netForOrder(ctx, orderId);
    const returned: Array<{ name: string; grams: number }> = [];
    const stock = ingredientStockMap(
      ctx,
      [...net.entries()]
        .filter(([, delta]) => delta < 0)
        .map(([id]) => id),
    );

    for (const [ingredientId, delta] of net) {
      if (delta >= 0) continue;
      const ingredient = stock.get(ingredientId);
      if (!ingredient) continue;
      const grams = -delta;
      addStock(ctx, ingredientId, grams);
      writeMovement(ctx, {
        ingredientId,
        ingredientName: ingredient.name,
        deltaGrams: grams,
        kind: "cancel_return",
        orderId,
        user,
        note: "إلغاء فاتورة مدفوعة",
      });
      returned.push({ name: ingredient.name, grams });
    }
    return { returned };
  })();
}

/** Re-consume when a cancelled paid invoice is restored to paid. */
export function reconsumeForRestoredOrder(
  ctx: InventoryDbContext,
  orderId: number,
  user: InventoryUser,
): ConsumptionResult {
  return ctx.sqlite.transaction(() => consumeWithin(ctx, orderId, user))();
}

/**
 * Apply an invoice line delta on a paid invoice (add item or qty change).
 * `deltas` describe newQty − oldQty per line; call before mutating the line
 * so the legacy baseline (if never consumed) sees pre-edit quantities.
 */
export function adjustForInvoiceEdit(
  ctx: InventoryDbContext,
  orderId: number,
  deltas: InvoiceDelta[],
  user: InventoryUser,
): { warnings: InsufficientIngredient[] } {
  return ctx.sqlite.transaction(() => {
    const net = netForOrder(ctx, orderId);
    const alreadyConsumed = [...net.values()].some((value) => value < 0);
    const warnings: InsufficientIngredient[] = [];

    if (!alreadyConsumed) {
      const baseline = consumeWithin(ctx, orderId, user);
      warnings.push(...baseline.warnings);
    }

    const relevant = deltas.filter((delta) => delta.deltaQty !== 0);
    if (relevant.length === 0) return { warnings };

    const bom = loadBom(
      ctx,
      relevant
        .map((delta) => delta.itemId)
        .filter((id): id is number => id != null),
    );

    const gramsByIngredient = new Map<number, number>();
    for (const delta of relevant) {
      if (delta.itemId == null) continue;
      const entries = bom.get(delta.itemId);
      if (!entries) continue;
      for (const entry of entries) {
        gramsByIngredient.set(
          entry.ingredientId,
          (gramsByIngredient.get(entry.ingredientId) ?? 0) +
            entry.gramsPerUnit * delta.deltaQty,
        );
      }
    }

    const stock = ingredientStockMap(ctx, [...gramsByIngredient.keys()]);
    for (const [ingredientId, grams] of gramsByIngredient) {
      if (grams === 0) continue;
      const ingredient = stock.get(ingredientId);
      if (!ingredient) continue;
      if (grams > 0) {
        const deficit = grams - ingredient.stockGrams;
        if (deficit > 0) {
          warnings.push({
            ingredientId,
            name: ingredient.name,
            deficit,
          });
        }
      }
      addStock(ctx, ingredientId, -grams);
      writeMovement(ctx, {
        ingredientId,
        ingredientName: ingredient.name,
        deltaGrams: -grams,
        kind: "invoice_edit",
        orderId,
        user,
        note: "تعديل فاتورة مدفوعة",
      });
    }

    return { warnings };
  })();
}

/** Manual stock adjustment (positive or negative grams). */
export function adjustStock(
  ctx: InventoryDbContext,
  input: {
    ingredientId: number;
    deltaGrams: number;
    note?: string | null;
    user: InventoryUser;
  },
): { stockGrams: number } {
  const delta = Math.trunc(input.deltaGrams);
  if (!Number.isInteger(input.ingredientId) || input.ingredientId <= 0) {
    throw new Error("المكوّن غير موجود");
  }
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("أدخل قيمة تعديل غير صفرية");
  }

  return ctx.sqlite.transaction(() => {
    const ingredient = ctx.db
      .select()
      .from(ingredients)
      .where(eq(ingredients.id, input.ingredientId))
      .get();
    if (!ingredient) throw new Error("المكوّن غير موجود");

    addStock(ctx, ingredient.id, delta);
    writeMovement(ctx, {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      deltaGrams: delta,
      kind: "adjust",
      user: input.user,
      note: input.note?.trim() || "تعديل يدوي",
    });

    const updated = ctx.db
      .select({ stockGrams: ingredients.stockGrams })
      .from(ingredients)
      .where(eq(ingredients.id, ingredient.id))
      .get();
    return { stockGrams: updated?.stockGrams ?? ingredient.stockGrams + delta };
  })();
}

export { insufficientWarningText };
