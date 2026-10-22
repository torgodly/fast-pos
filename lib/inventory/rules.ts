export type QuantityBasis = "g" | "kg";

export type MovementKind =
  | "purchase"
  | "sale"
  | "adjust"
  | "invoice_edit"
  | "cancel_return";

export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  purchase: "شراء",
  sale: "بيع",
  adjust: "تعديل يدوي",
  invoice_edit: "تعديل فاتورة",
  cancel_return: "إرجاع إلغاء",
};

export function isLowStock(stockGrams: number, lowStockGrams: number): boolean {
  return lowStockGrams > 0 && stockGrams <= lowStockGrams;
}

export type BomEntry = {
  ingredientId: number;
  /** Grams consumed per one sold unit. */
  gramsPerUnit: number;
};

export type IngredientStock = {
  name: string;
  stockGrams: number;
};

export type InsufficientIngredient = {
  ingredientId: number;
  name: string;
  /** Positive grams missing from stock. */
  deficit: number;
};

export function kgToGrams(kg: number): number {
  return Math.round(kg * 1000);
}

export function gramsFromQuantity(qty: number, basis: QuantityBasis): number {
  if (!Number.isFinite(qty)) return 0;
  return basis === "kg" ? kgToGrams(qty) : Math.round(qty);
}

/** 350 → "350 غ", 2500 → "2.5 كغ", 2000 → "2 كغ". */
export function gramsToDisplay(grams: number): string {
  const value = Math.round(grams);
  if (Math.abs(value) >= 1000) {
    const kg = value / 1000;
    const text = Number.isInteger(kg)
      ? String(kg)
      : kg.toFixed(2).replace(/\.?0+$/, "");
    return `${text} كغ`;
  }
  return `${value} غ`;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function lineCost(qty: number, unitPrice: number): number {
  if (!Number.isFinite(qty) || !Number.isFinite(unitPrice)) return 0;
  return roundMoney(qty * unitPrice);
}

/**
 * Aggregate grams consumed by a set of sold lines using each item's BOM.
 * Lines without an item id (deleted menu item) or without a BOM are skipped.
 */
export function computeConsumption(
  bomByItem: ReadonlyMap<number, readonly BomEntry[]>,
  lines: ReadonlyArray<{ itemId: number | null; qty: number }>,
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const line of lines) {
    if (line.itemId == null) continue;
    const bom = bomByItem.get(line.itemId);
    if (!bom?.length) continue;
    const qty = Math.max(0, Math.trunc(line.qty));
    if (qty === 0) continue;
    for (const entry of bom) {
      if (entry.gramsPerUnit <= 0) continue;
      totals.set(
        entry.ingredientId,
        (totals.get(entry.ingredientId) ?? 0) + entry.gramsPerUnit * qty,
      );
    }
  }
  return totals;
}

/** Ingredients whose required consumption exceeds current stock (negative stock included). */
export function findInsufficient(
  consumption: ReadonlyMap<number, number>,
  stockByIngredient: ReadonlyMap<number, IngredientStock>,
): InsufficientIngredient[] {
  const result: InsufficientIngredient[] = [];
  for (const [ingredientId, grams] of consumption) {
    const stock = stockByIngredient.get(ingredientId);
    if (!stock || grams <= 0) continue;
    const deficit = grams - stock.stockGrams;
    if (deficit > 0) {
      result.push({ ingredientId, name: stock.name, deficit });
    }
  }
  return result.sort((a, b) => b.deficit - a.deficit);
}

/** Arabic warning text for a payment toast / audit detail. */
export function insufficientWarningText(
  warnings: readonly InsufficientIngredient[],
): string {
  return warnings
    .map((item) => `${item.name} (ناقص ${gramsToDisplay(item.deficit)})`)
    .join("، ");
}
