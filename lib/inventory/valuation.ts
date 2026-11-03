import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  ingredients,
  items,
  purchaseInvoiceLines,
  purchaseInvoices,
} from "@/lib/db/schema";

export type PurchaseCostLine = {
  ingredientId: number | null;
  itemId: number | null;
  qtyBase: number | null;
  lineTotal: number;
};

export type StockTarget = {
  targetType: "ingredient" | "item";
  id: number;
  name: string;
  stockBase: number;
};

export type InventoryValueSummary = {
  total: number;
  ingredientValue: number;
  trackedItemValue: number;
  pricedCount: number;
  unpricedCount: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function latestCostsPerBase(lines: PurchaseCostLine[]) {
  const costs = new Map<string, number>();
  for (const line of lines) {
    const qtyBase = line.qtyBase ?? 0;
    if (qtyBase <= 0) continue;
    const key =
      line.ingredientId !== null
        ? `ingredient:${line.ingredientId}`
        : line.itemId !== null
          ? `item:${line.itemId}`
          : null;
    if (!key || costs.has(key)) continue;
    costs.set(key, line.lineTotal / qtyBase);
  }
  return costs;
}

export function summarizeInventoryValue(
  targets: StockTarget[],
  costs: Map<string, number>,
): InventoryValueSummary {
  let ingredientValue = 0;
  let trackedItemValue = 0;
  let pricedCount = 0;
  let unpricedCount = 0;

  for (const target of targets) {
    const cost = costs.get(`${target.targetType}:${target.id}`);
    if (cost === undefined) {
      if (target.stockBase !== 0) unpricedCount += 1;
      continue;
    }
    const value = target.stockBase * cost;
    if (target.targetType === "ingredient") ingredientValue += value;
    else trackedItemValue += value;
    pricedCount += 1;
  }

  return {
    total: round2(ingredientValue + trackedItemValue),
    ingredientValue: round2(ingredientValue),
    trackedItemValue: round2(trackedItemValue),
    pricedCount,
    unpricedCount,
  };
}

export function getInventoryValuation() {
  const lines = db
    .select({
      ingredientId: purchaseInvoiceLines.ingredientId,
      itemId: purchaseInvoiceLines.itemId,
      qtyBase: purchaseInvoiceLines.qtyBase,
      lineTotal: purchaseInvoiceLines.lineTotal,
    })
    .from(purchaseInvoiceLines)
    .innerJoin(
      purchaseInvoices,
      eq(purchaseInvoiceLines.invoiceId, purchaseInvoices.id),
    )
    .orderBy(
      desc(purchaseInvoices.createdAt),
      desc(purchaseInvoiceLines.id),
    )
    .all();

  const ingredientTargets: StockTarget[] = db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      stockBase: ingredients.stockBase,
    })
    .from(ingredients)
    .all()
    .map((row) => ({ ...row, targetType: "ingredient" as const }));

  const trackedItemTargets: StockTarget[] = db
    .select({
      id: items.id,
      name: items.name,
      stockBase: items.stockBase,
    })
    .from(items)
    .where(eq(items.trackStock, true))
    .all()
    .map((row) => ({ ...row, targetType: "item" as const }));

  const targets = [...ingredientTargets, ...trackedItemTargets];
  const costs = latestCostsPerBase(lines);
  return {
    summary: summarizeInventoryValue(targets, costs),
    targets,
    costs,
  };
}

export type InventoryValuation = ReturnType<typeof getInventoryValuation>;
