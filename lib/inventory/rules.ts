export type UnitKind = "weight" | "count";

export type UnitLike = {
  name: string;
  kind: UnitKind;
  factorToBase: number;
};

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

export const UNIT_KIND_LABELS: Record<UnitKind, string> = {
  weight: "وزن",
  count: "عدد",
};

/** Converts a user-entered quantity to canonical base units (gram / piece). */
export function quantityToBase(qty: number, factorToBase: number): number {
  if (!Number.isFinite(qty) || !Number.isFinite(factorToBase) || factorToBase <= 0) {
    return 0;
  }
  return Math.round(qty * factorToBase);
}

export function baseToQuantity(base: number, factorToBase: number): number {
  if (!Number.isFinite(base) || !Number.isFinite(factorToBase) || factorToBase <= 0) {
    return 0;
  }
  return base / factorToBase;
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/\.?0+$/, "");
}

/** 350 → "350 غ", 2500 → "2.5 كغ" (weight base only). */
export function gramsToDisplay(grams: number): string {
  const value = Math.round(grams);
  if (Math.abs(value) >= 1000) {
    const kg = value / 1000;
    return `${formatNumber(kg)} كغ`;
  }
  return `${value} غ`;
}

export function formatBaseQuantity(base: number, kind: UnitKind): string {
  if (kind === "count") return `${Math.round(base)} حبة`;
  return gramsToDisplay(base);
}

/**
 * Formats a canonical base quantity using a unit snapshot.
 * Weight shown in base grams keeps the familiar g/kg shortcut.
 */
export function formatQuantity(
  base: number,
  unit: UnitLike | null | undefined,
): string {
  if (!unit) return formatBaseQuantity(base, "weight");
  if (unit.kind === "weight" && unit.factorToBase === 1) {
    return gramsToDisplay(base);
  }
  return `${formatNumber(baseToQuantity(base, unit.factorToBase))} ${unit.name}`;
}

export function isLowStock(stockBase: number, lowStockBase: number): boolean {
  return lowStockBase > 0 && stockBase <= lowStockBase;
}

export type BomEntry = {
  ingredientId: number;
  /** Base quantity consumed per one sold unit. */
  qtyBase: number;
};

export type IngredientStock = {
  name: string;
  stockBase: number;
  unitName: string;
  unitKind: UnitKind;
  factorToBase: number;
};

export type InsufficientStock = {
  targetId: number;
  targetType: "ingredient" | "item";
  name: string;
  /** Positive base quantity missing from stock. */
  deficitBase: number;
  unitName: string;
  unitKind: UnitKind;
  factorToBase: number;
};

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function lineCost(qty: number, unitPrice: number): number {
  if (!Number.isFinite(qty) || !Number.isFinite(unitPrice)) return 0;
  return roundMoney(qty * unitPrice);
}

/**
 * Aggregate base quantities consumed by a set of sold lines using each item's
 * BOM. Lines without an item id (deleted menu item) or without a BOM are skipped.
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
      if (entry.qtyBase <= 0) continue;
      totals.set(
        entry.ingredientId,
        (totals.get(entry.ingredientId) ?? 0) + entry.qtyBase * qty,
      );
    }
  }
  return totals;
}

/** Stocks whose required consumption exceeds current stock (negative included). */
export function findInsufficient(
  consumption: ReadonlyMap<number, number>,
  stockByIngredient: ReadonlyMap<number, IngredientStock>,
): InsufficientStock[] {
  const result: InsufficientStock[] = [];
  for (const [ingredientId, baseQty] of consumption) {
    const stock = stockByIngredient.get(ingredientId);
    if (!stock || baseQty <= 0) continue;
    const deficit = baseQty - stock.stockBase;
    if (deficit > 0) {
      result.push({
        targetId: ingredientId,
        targetType: "ingredient",
        name: stock.name,
        deficitBase: deficit,
        unitName: stock.unitName,
        unitKind: stock.unitKind,
        factorToBase: stock.factorToBase,
      });
    }
  }
  return result.sort((a, b) => b.deficitBase - a.deficitBase);
}

/** Arabic warning text for a payment toast / audit detail. */
export function insufficientWarningText(
  warnings: readonly InsufficientStock[],
): string {
  return warnings
    .map(
      (item) =>
        `${item.name} (ناقص ${formatQuantity(item.deficitBase, {
          name: item.unitName,
          kind: item.unitKind,
          factorToBase: item.factorToBase,
        })})`,
    )
    .join("، ");
}
