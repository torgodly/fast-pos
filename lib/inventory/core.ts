import { and, eq, inArray, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";
import * as schema from "@/lib/db/schema";
import {
  ingredientMovements,
  ingredients,
  itemIngredients,
  itemMovements,
  items,
  orderItems,
  purchaseInvoiceLines,
  purchaseInvoices,
  units,
} from "@/lib/db/schema";
import {
  computeConsumption,
  findInsufficient,
  insufficientWarningText,
  lineCost,
  quantityToBase,
  roundMoney,
  type BomEntry,
  type IngredientStock,
  type InsufficientStock,
  type UnitKind,
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
  targetType: "ingredient" | "item";
  targetId: number;
  qty: number;
  unitId: number;
  unitPrice: number;
};

export type PurchaseInvoiceInput = {
  supplierId: number | null;
  invoiceNumber?: string | null;
  note?: string | null;
  lines: PurchaseLineInput[];
  user: InventoryUser;
};

export type ConsumedStock = {
  targetType: "ingredient" | "item";
  targetId: number;
  name: string;
  baseQty: number;
  unitName: string;
  unitKind: UnitKind;
  factorToBase: number;
};

export type ConsumptionResult = {
  skipped: boolean;
  warnings: InsufficientStock[];
  consumed: ConsumedStock[];
};

export type InvoiceDelta = {
  itemId: number | null;
  deltaQty: number;
};

type UnitSnapshot = {
  unitName: string;
  unitKind: UnitKind;
  factorToBase: number;
};

type IngredientRow = {
  id: number;
  name: string;
  stockBase: number;
  lowStockBase: number;
} & UnitSnapshot;

type ItemStockRow = {
  id: number;
  name: string;
  trackStock: boolean;
  stockBase: number;
  lowStockBase: number;
} & UnitSnapshot;

const ORDER_KINDS = ["sale", "invoice_edit", "cancel_return"] as const;

function unitSnapshot(
  name: string | null,
  kind: string | null,
  factor: number | null,
  fallbackKind: UnitKind = "weight",
): UnitSnapshot {
  const resolvedKind: UnitKind =
    kind === "weight" || kind === "count" ? kind : fallbackKind;
  return {
    unitName: name ?? (resolvedKind === "weight" ? "غرام" : "حبة"),
    unitKind: resolvedKind,
    factorToBase:
      typeof factor === "number" && factor > 0 ? factor : 1,
  };
}

function loadIngredientRows(
  ctx: InventoryDbContext,
  ids: number[],
): Map<number, IngredientRow> {
  const map = new Map<number, IngredientRow>();
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return map;

  const rows = ctx.db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      stockBase: ingredients.stockBase,
      lowStockBase: ingredients.lowStockBase,
      unitName: units.name,
      unitKind: units.kind,
      factorToBase: units.factorToBase,
    })
    .from(ingredients)
    .leftJoin(units, eq(ingredients.preferredUnitId, units.id))
    .where(inArray(ingredients.id, unique))
    .all();

  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      stockBase: row.stockBase,
      lowStockBase: row.lowStockBase,
      ...unitSnapshot(row.unitName, row.unitKind, row.factorToBase),
    });
  }
  return map;
}

function loadItemStockRows(
  ctx: InventoryDbContext,
  ids: number[],
): Map<number, ItemStockRow> {
  const map = new Map<number, ItemStockRow>();
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return map;

  const rows = ctx.db
    .select({
      id: items.id,
      name: items.name,
      trackStock: items.trackStock,
      stockBase: items.stockBase,
      lowStockBase: items.lowStockBase,
      unitName: units.name,
      unitKind: units.kind,
      factorToBase: units.factorToBase,
    })
    .from(items)
    .leftJoin(units, eq(items.unitId, units.id))
    .where(inArray(items.id, unique))
    .all();

  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      trackStock: row.trackStock,
      stockBase: row.stockBase,
      lowStockBase: row.lowStockBase,
      ...unitSnapshot(row.unitName, row.unitKind, row.factorToBase, "count"),
    });
  }
  return map;
}

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
      qtyBase: itemIngredients.qtyBase,
    })
    .from(itemIngredients)
    .where(inArray(itemIngredients.itemId, unique))
    .all();

  for (const row of rows) {
    const list = map.get(row.itemId) ?? [];
    list.push({ ingredientId: row.ingredientId, qtyBase: row.qtyBase });
    map.set(row.itemId, list);
  }
  return map;
}

/** Net base quantity per stock target: negative consumed, positive returned. */
function netForOrder(ctx: InventoryDbContext, orderId: number) {
  const ingredientRows = ctx.db
    .select({
      id: ingredientMovements.ingredientId,
      deltaBase: ingredientMovements.deltaBase,
    })
    .from(ingredientMovements)
    .where(
      and(
        eq(ingredientMovements.orderId, orderId),
        inArray(ingredientMovements.kind, [...ORDER_KINDS]),
      ),
    )
    .all();

  const itemRows = ctx.db
    .select({
      id: itemMovements.itemId,
      deltaBase: itemMovements.deltaBase,
    })
    .from(itemMovements)
    .where(
      and(
        eq(itemMovements.orderId, orderId),
        inArray(itemMovements.kind, [...ORDER_KINDS]),
      ),
    )
    .all();

  const ingredientTotals = new Map<number, number>();
  for (const row of ingredientRows) {
    if (row.id == null) continue;
    ingredientTotals.set(
      row.id,
      (ingredientTotals.get(row.id) ?? 0) + row.deltaBase,
    );
  }

  const itemTotals = new Map<number, number>();
  for (const row of itemRows) {
    if (row.id == null) continue;
    itemTotals.set(row.id, (itemTotals.get(row.id) ?? 0) + row.deltaBase);
  }

  return { ingredients: ingredientTotals, items: itemTotals };
}

function addIngredientStock(
  ctx: InventoryDbContext,
  ingredientId: number,
  deltaBase: number,
) {
  ctx.db
    .update(ingredients)
    .set({ stockBase: sql`${ingredients.stockBase} + ${deltaBase}` })
    .where(eq(ingredients.id, ingredientId))
    .run();
}

function addItemStock(ctx: InventoryDbContext, itemId: number, deltaBase: number) {
  ctx.db
    .update(items)
    .set({ stockBase: sql`${items.stockBase} + ${deltaBase}` })
    .where(eq(items.id, itemId))
    .run();
}

function writeIngredientMovement(
  ctx: InventoryDbContext,
  input: {
    ingredientId: number;
    ingredientName: string;
    deltaBase: number;
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
      deltaBase: input.deltaBase,
      kind: input.kind,
      orderId: input.orderId ?? null,
      invoiceId: input.invoiceId ?? null,
      userId: input.user.userId,
      userName: input.user.name,
      note: input.note ?? null,
    })
    .run();
}

function writeItemMovement(
  ctx: InventoryDbContext,
  input: {
    itemId: number;
    itemName: string;
    deltaBase: number;
    kind: (typeof schema.itemMovements.$inferInsert)["kind"];
    unit: UnitSnapshot;
    orderId?: number | null;
    invoiceId?: number | null;
    user: InventoryUser;
    note?: string | null;
  },
) {
  ctx.db
    .insert(itemMovements)
    .values({
      itemId: input.itemId,
      itemName: input.itemName,
      deltaBase: input.deltaBase,
      kind: input.kind,
      unitName: input.unit.unitName,
      unitKind: input.unit.unitKind,
      factorToBase: input.unit.factorToBase,
      orderId: input.orderId ?? null,
      invoiceId: input.invoiceId ?? null,
      userId: input.user.userId,
      userName: input.user.name,
      note: input.note ?? null,
    })
    .run();
}

function stockWarnings(
  consumption: ReadonlyMap<number, number>,
  stock: ReadonlyMap<number, IngredientRow>,
): InsufficientStock[] {
  const asStocks = new Map<number, IngredientStock>();
  for (const [id, row] of stock) {
    asStocks.set(id, {
      name: row.name,
      stockBase: row.stockBase,
      unitName: row.unitName,
      unitKind: row.unitKind,
      factorToBase: row.factorToBase,
    });
  }
  return findInsufficient(consumption, asStocks);
}

function itemStockWarnings(
  consumption: ReadonlyMap<number, number>,
  stock: ReadonlyMap<number, ItemStockRow>,
): InsufficientStock[] {
  const warnings: InsufficientStock[] = [];
  for (const [itemId, baseQty] of consumption) {
    const row = stock.get(itemId);
    if (!row || baseQty <= 0) continue;
    const deficit = baseQty - row.stockBase;
    if (deficit <= 0) continue;
    warnings.push({
      targetId: itemId,
      targetType: "item",
      name: row.name,
      deficitBase: deficit,
      unitName: row.unitName,
      unitKind: row.unitKind,
      factorToBase: row.factorToBase,
    });
  }
  return warnings;
}

/** Must run inside a transaction. */
function consumeWithin(
  ctx: InventoryDbContext,
  orderId: number,
  user: InventoryUser,
): ConsumptionResult {
  const net = netForOrder(ctx, orderId);
  const alreadyConsumed = [...net.ingredients.values(), ...net.items.values()].some(
    (value) => value < 0,
  );
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

  const itemIds = lines
    .map((line) => line.itemId)
    .filter((id): id is number => id != null);
  const bom = loadBom(ctx, itemIds);
  const itemRows = loadItemStockRows(ctx, itemIds);

  const ingredientConsumption = computeConsumption(bom, lines);
  const itemConsumption = new Map<number, number>();
  for (const line of lines) {
    if (line.itemId == null) continue;
    const item = itemRows.get(line.itemId);
    if (!item?.trackStock) continue;
    const qty = Math.max(0, Math.trunc(line.qty));
    if (qty === 0) continue;
    itemConsumption.set(
      line.itemId,
      (itemConsumption.get(line.itemId) ?? 0) + qty * item.factorToBase,
    );
  }

  if (ingredientConsumption.size === 0 && itemConsumption.size === 0) {
    return { skipped: true, warnings: [], consumed: [] };
  }

  const ingredientStock = loadIngredientRows(ctx, [...ingredientConsumption.keys()]);
  const warnings = [
    ...stockWarnings(ingredientConsumption, ingredientStock),
    ...itemStockWarnings(itemConsumption, itemRows),
  ].sort((a, b) => b.deficitBase - a.deficitBase);

  const consumed: ConsumedStock[] = [];

  for (const [ingredientId, baseQty] of ingredientConsumption) {
    const ingredient = ingredientStock.get(ingredientId);
    if (!ingredient || baseQty <= 0) continue;
    addIngredientStock(ctx, ingredientId, -baseQty);
    writeIngredientMovement(ctx, {
      ingredientId,
      ingredientName: ingredient.name,
      deltaBase: -baseQty,
      kind: "sale",
      orderId,
      user,
      note: "استهلاك عند الدفع",
    });
    consumed.push({
      targetType: "ingredient",
      targetId: ingredientId,
      name: ingredient.name,
      baseQty,
      unitName: ingredient.unitName,
      unitKind: ingredient.unitKind,
      factorToBase: ingredient.factorToBase,
    });
  }

  for (const [itemId, baseQty] of itemConsumption) {
    const item = itemRows.get(itemId);
    if (!item || baseQty <= 0) continue;
    addItemStock(ctx, itemId, -baseQty);
    writeItemMovement(ctx, {
      itemId,
      itemName: item.name,
      deltaBase: -baseQty,
      kind: "sale",
      unit: item,
      orderId,
      user,
      note: "بيع صنف متتبع المخزون",
    });
    consumed.push({
      targetType: "item",
      targetId: itemId,
      name: item.name,
      baseQty,
      unitName: item.unitName,
      unitKind: item.unitKind,
      factorToBase: item.factorToBase,
    });
  }

  return { skipped: false, warnings, consumed };
}

type ResolvedPurchaseLine = PurchaseLineInput & {
  ingredientId: number | null;
  itemId: number | null;
  targetName: string;
  qtyBase: number;
  unitName: string;
  unitKind: UnitKind;
  factorToBase: number;
};

export function receivePurchaseInvoice(
  ctx: InventoryDbContext,
  input: PurchaseInvoiceInput,
): { invoiceId: number; totalCost: number } {
  if (input.lines.length === 0) {
    throw new Error("أضف بنداً واحداً على الأقل");
  }

  const unitIds = [
    ...new Set(
      input.lines
        .map((line) => Number(line.unitId))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  const unitRows = ctx.db
    .select()
    .from(units)
    .where(inArray(units.id, unitIds))
    .all();
  const unitsById = new Map(unitRows.map((row) => [row.id, row]));

  const ingredientIds = [
    ...new Set(
      input.lines
        .filter((line) => line.targetType === "ingredient")
        .map((line) => Number(line.targetId)),
    ),
  ];
  const itemIds = [
    ...new Set(
      input.lines
        .filter((line) => line.targetType === "item")
        .map((line) => Number(line.targetId)),
    ),
  ];
  const ingredientRows = loadIngredientRows(ctx, ingredientIds);
  const itemRows = loadItemStockRows(ctx, itemIds);

  const normalized: ResolvedPurchaseLine[] = input.lines.map((line) => {
    const qty = Number(line.qty);
    const unitPrice = Number(line.unitPrice);
    const targetId = Number(line.targetId);
    const unitId = Number(line.unitId);

    if (line.targetType !== "ingredient" && line.targetType !== "item") {
      throw new Error("بند مشتريات غير صالح");
    }
    if (!Number.isInteger(targetId) || targetId <= 0) {
      throw new Error("بند مشتريات غير صالح");
    }
    const unit = unitsById.get(unitId);
    if (!unit) throw new Error("الوحدة غير موجودة");

    let targetName: string;
    let targetKind: UnitKind;
    if (line.targetType === "ingredient") {
      const ingredient = ingredientRows.get(targetId);
      if (!ingredient) throw new Error("أحد المكونات غير موجود");
      targetName = ingredient.name;
      targetKind = ingredient.unitKind;
    } else {
      const item = itemRows.get(targetId);
      if (!item) throw new Error("أحد الأصناف غير موجود");
      if (!item.trackStock) {
        throw new Error(`الصنف «${item.name}» لا يتتبع المخزون`);
      }
      targetName = item.name;
      targetKind = item.unitKind;
    }

    const unitKind = unit.kind as UnitKind;
    if (unitKind !== targetKind) {
      throw new Error("الوحدة غير متوافقة مع وحدة الصنف/المكوّن");
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error("الكمية يجب أن تكون أكبر من صفر");
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error("سعر الوحدة غير صالح");
    }

    const qtyBase = quantityToBase(qty, unit.factorToBase);
    if (qtyBase <= 0) {
      throw new Error("الكمية يجب أن تكون أكبر من صفر");
    }

    return {
      ...line,
      targetId,
      unitId,
      qty,
      unitPrice,
      ingredientId: line.targetType === "ingredient" ? targetId : null,
      itemId: line.targetType === "item" ? targetId : null,
      targetName,
      qtyBase,
      unitName: unit.name,
      unitKind,
      factorToBase: unit.factorToBase,
    };
  });

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
      ctx.db
        .insert(purchaseInvoiceLines)
        .values({
          invoiceId: invoice.id,
          ingredientId: line.ingredientId,
          itemId: line.itemId,
          targetName: line.targetName,
          qtyBase: line.qtyBase,
          unitId: line.unitId,
          unitName: line.unitName,
          unitKind: line.unitKind,
          factorToBase: line.factorToBase,
          unitPrice: line.unitPrice,
          lineTotal: lineCost(line.qty, line.unitPrice),
        })
        .run();

      if (line.ingredientId != null) {
        addIngredientStock(ctx, line.ingredientId, line.qtyBase);
        writeIngredientMovement(ctx, {
          ingredientId: line.ingredientId,
          ingredientName: line.targetName,
          deltaBase: line.qtyBase,
          kind: "purchase",
          invoiceId: invoice.id,
          user: input.user,
          note: input.invoiceNumber?.trim() || null,
        });
      } else if (line.itemId != null) {
        addItemStock(ctx, line.itemId, line.qtyBase);
        writeItemMovement(ctx, {
          itemId: line.itemId,
          itemName: line.targetName,
          deltaBase: line.qtyBase,
          kind: "purchase",
          unit: line,
          invoiceId: invoice.id,
          user: input.user,
          note: input.invoiceNumber?.trim() || null,
        });
      }
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
): { returned: ConsumedStock[] } {
  return ctx.sqlite.transaction(() => {
    const net = netForOrder(ctx, orderId);
    const returned: ConsumedStock[] = [];
    const ingredientStock = loadIngredientRows(
      ctx,
      [...net.ingredients.entries()]
        .filter(([, delta]) => delta < 0)
        .map(([id]) => id),
    );
    const itemStock = loadItemStockRows(
      ctx,
      [...net.items.entries()]
        .filter(([, delta]) => delta < 0)
        .map(([id]) => id),
    );

    for (const [ingredientId, delta] of net.ingredients) {
      if (delta >= 0) continue;
      const ingredient = ingredientStock.get(ingredientId);
      if (!ingredient) continue;
      const baseQty = -delta;
      addIngredientStock(ctx, ingredientId, baseQty);
      writeIngredientMovement(ctx, {
        ingredientId,
        ingredientName: ingredient.name,
        deltaBase: baseQty,
        kind: "cancel_return",
        orderId,
        user,
        note: "إلغاء فاتورة مدفوعة",
      });
      returned.push({
        targetType: "ingredient",
        targetId: ingredientId,
        name: ingredient.name,
        baseQty,
        unitName: ingredient.unitName,
        unitKind: ingredient.unitKind,
        factorToBase: ingredient.factorToBase,
      });
    }

    for (const [itemId, delta] of net.items) {
      if (delta >= 0) continue;
      const item = itemStock.get(itemId);
      if (!item) continue;
      const baseQty = -delta;
      addItemStock(ctx, itemId, baseQty);
      writeItemMovement(ctx, {
        itemId,
        itemName: item.name,
        deltaBase: baseQty,
        kind: "cancel_return",
        unit: item,
        orderId,
        user,
        note: "إلغاء فاتورة مدفوعة",
      });
      returned.push({
        targetType: "item",
        targetId: itemId,
        name: item.name,
        baseQty,
        unitName: item.unitName,
        unitKind: item.unitKind,
        factorToBase: item.factorToBase,
      });
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
): { warnings: InsufficientStock[] } {
  return ctx.sqlite.transaction(() => {
    const net = netForOrder(ctx, orderId);
    const alreadyConsumed =
      [...net.ingredients.values(), ...net.items.values()].some(
        (value) => value < 0,
      );
    const warnings: InsufficientStock[] = [];

    if (!alreadyConsumed) {
      const baseline = consumeWithin(ctx, orderId, user);
      warnings.push(...baseline.warnings);
    }

    const relevant = deltas.filter((delta) => delta.deltaQty !== 0);
    if (relevant.length === 0) return { warnings };

    const ids = relevant
      .map((delta) => delta.itemId)
      .filter((id): id is number => id != null);
    const bom = loadBom(ctx, ids);
    const itemRows = loadItemStockRows(ctx, ids);

    const ingredientsByBase = new Map<number, number>();
    const itemsByBase = new Map<number, number>();

    for (const delta of relevant) {
      if (delta.itemId == null) continue;
      const item = itemRows.get(delta.itemId);
      if (item?.trackStock) {
        itemsByBase.set(
          delta.itemId,
          (itemsByBase.get(delta.itemId) ?? 0) +
            delta.deltaQty * item.factorToBase,
        );
      }
      const entries = bom.get(delta.itemId);
      if (!entries) continue;
      for (const entry of entries) {
        ingredientsByBase.set(
          entry.ingredientId,
          (ingredientsByBase.get(entry.ingredientId) ?? 0) +
            entry.qtyBase * delta.deltaQty,
        );
      }
    }

    const ingredientStock = loadIngredientRows(ctx, [...ingredientsByBase.keys()]);
    for (const [ingredientId, baseQty] of ingredientsByBase) {
      if (baseQty === 0) continue;
      const ingredient = ingredientStock.get(ingredientId);
      if (!ingredient) continue;
      if (baseQty > 0) {
        const deficit = baseQty - ingredient.stockBase;
        if (deficit > 0) {
          warnings.push({
            targetId: ingredientId,
            targetType: "ingredient",
            name: ingredient.name,
            deficitBase: deficit,
            unitName: ingredient.unitName,
            unitKind: ingredient.unitKind,
            factorToBase: ingredient.factorToBase,
          });
        }
      }
      addIngredientStock(ctx, ingredientId, -baseQty);
      writeIngredientMovement(ctx, {
        ingredientId,
        ingredientName: ingredient.name,
        deltaBase: -baseQty,
        kind: "invoice_edit",
        orderId,
        user,
        note: "تعديل فاتورة مدفوعة",
      });
    }

    for (const [itemId, baseQty] of itemsByBase) {
      if (baseQty === 0) continue;
      const item = itemRows.get(itemId);
      if (!item) continue;
      if (baseQty > 0) {
        const deficit = baseQty - item.stockBase;
        if (deficit > 0) {
          warnings.push({
            targetId: itemId,
            targetType: "item",
            name: item.name,
            deficitBase: deficit,
            unitName: item.unitName,
            unitKind: item.unitKind,
            factorToBase: item.factorToBase,
          });
        }
      }
      addItemStock(ctx, itemId, -baseQty);
      writeItemMovement(ctx, {
        itemId,
        itemName: item.name,
        deltaBase: -baseQty,
        kind: "invoice_edit",
        unit: item,
        orderId,
        user,
        note: "تعديل فاتورة مدفوعة",
      });
    }

    return { warnings };
  })();
}

/** Manual tracked-item stock adjustment in any compatible unit. */
export function adjustItemStock(
  ctx: InventoryDbContext,
  input: {
    itemId: number;
    delta: number;
    unitId: number;
    note?: string | null;
    user: InventoryUser;
  },
): { stockBase: number } {
  if (!Number.isInteger(input.itemId) || input.itemId <= 0) {
    throw new Error("الصنف غير موجود");
  }
  if (!Number.isFinite(input.delta) || input.delta === 0) {
    throw new Error("أدخل قيمة تعديل غير صفرية");
  }

  return ctx.sqlite.transaction(() => {
    const item = loadItemStockRows(ctx, [input.itemId]).get(input.itemId);
    if (!item) throw new Error("الصنف غير موجود");
    if (!item.trackStock) throw new Error("الصنف لا يتتبع المخزون");

    const unit = ctx.db
      .select()
      .from(units)
      .where(eq(units.id, input.unitId))
      .get();
    if (!unit) throw new Error("الوحدة غير موجودة");
    if (unit.kind !== item.unitKind) {
      throw new Error("الوحدة غير متوافقة مع وحدة الصنف");
    }

    const deltaBase = quantityToBase(input.delta, unit.factorToBase);
    if (deltaBase === 0) {
      throw new Error("أدخل قيمة تعديل غير صفرية");
    }

    addItemStock(ctx, item.id, deltaBase);
    writeItemMovement(ctx, {
      itemId: item.id,
      itemName: item.name,
      deltaBase,
      kind: "adjust",
      unit: {
        unitName: unit.name,
        unitKind: unit.kind as UnitKind,
        factorToBase: unit.factorToBase,
      },
      user: input.user,
      note: input.note?.trim() || "تعديل يدوي",
    });

    const updated = ctx.db
      .select({ stockBase: items.stockBase })
      .from(items)
      .where(eq(items.id, item.id))
      .get();
    return { stockBase: updated?.stockBase ?? item.stockBase + deltaBase };
  })();
}

/** Manual ingredient stock adjustment in any compatible unit. */
export function adjustStock(
  ctx: InventoryDbContext,
  input: {
    ingredientId: number;
    delta: number;
    unitId: number;
    note?: string | null;
    user: InventoryUser;
  },
): { stockBase: number } {
  if (!Number.isInteger(input.ingredientId) || input.ingredientId <= 0) {
    throw new Error("المكوّن غير موجود");
  }
  if (!Number.isFinite(input.delta) || input.delta === 0) {
    throw new Error("أدخل قيمة تعديل غير صفرية");
  }

  return ctx.sqlite.transaction(() => {
    const ingredient = loadIngredientRows(ctx, [input.ingredientId]).get(
      input.ingredientId,
    );
    if (!ingredient) throw new Error("المكوّن غير موجود");

    const unit = ctx.db
      .select()
      .from(units)
      .where(eq(units.id, input.unitId))
      .get();
    if (!unit) throw new Error("الوحدة غير موجودة");
    if (unit.kind !== ingredient.unitKind) {
      throw new Error("الوحدة غير متوافقة مع وحدة المكوّن");
    }

    const deltaBase = quantityToBase(input.delta, unit.factorToBase);
    if (deltaBase === 0) {
      throw new Error("أدخل قيمة تعديل غير صفرية");
    }

    addIngredientStock(ctx, ingredient.id, deltaBase);
    writeIngredientMovement(ctx, {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      deltaBase,
      kind: "adjust",
      user: input.user,
      note: input.note?.trim() || "تعديل يدوي",
    });

    const updated = ctx.db
      .select({ stockBase: ingredients.stockBase })
      .from(ingredients)
      .where(eq(ingredients.id, ingredient.id))
      .get();
    return { stockBase: updated?.stockBase ?? ingredient.stockBase + deltaBase };
  })();
}

export { insufficientWarningText };
