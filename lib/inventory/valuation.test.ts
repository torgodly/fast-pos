import { describe, expect, it } from "vitest";
import {
  latestCostsPerBase,
  summarizeInventoryValue,
  type PurchaseCostLine,
  type StockTarget,
} from "./valuation";

function costLine(partial: Partial<PurchaseCostLine>): PurchaseCostLine {
  return {
    ingredientId: partial.ingredientId ?? null,
    itemId: partial.itemId ?? null,
    qtyBase: partial.qtyBase ?? 1,
    lineTotal: partial.lineTotal ?? 1,
  };
}

function target(partial: Partial<StockTarget> & { stockBase: number }): StockTarget {
  return {
    targetType: partial.targetType ?? "ingredient",
    id: partial.id ?? 1,
    name: partial.name ?? "صنف",
    stockBase: partial.stockBase,
  };
}

describe("latestCostsPerBase", () => {
  it("keeps the first (newest) line per ingredient and item", () => {
    const costs = latestCostsPerBase([
      costLine({ ingredientId: 7, qtyBase: 1000, lineTotal: 12 }),
      costLine({ ingredientId: 7, qtyBase: 1000, lineTotal: 9 }),
      costLine({ itemId: 3, qtyBase: 6, lineTotal: 30 }),
    ]);

    expect(costs.get("ingredient:7")).toBeCloseTo(0.012);
    expect(costs.get("item:3")).toBeCloseTo(5);
    expect(costs.size).toBe(2);
  });

  it("skips lines without a positive base quantity", () => {
    const costs = latestCostsPerBase([
      costLine({ ingredientId: 1, qtyBase: 0, lineTotal: 10 }),
    ]);
    expect(costs.size).toBe(0);
  });
});

describe("summarizeInventoryValue", () => {
  it("values stock at the latest cost and splits ingredients from items", () => {
    const costs = new Map<string, number>([
      ["ingredient:1", 0.01],
      ["item:2", 2.5],
    ]);
    const summary = summarizeInventoryValue(
      [
        target({ targetType: "ingredient", id: 1, stockBase: 2000 }),
        target({ targetType: "item", id: 2, stockBase: 3 }),
        target({ targetType: "item", id: 3, stockBase: 5 }),
      ],
      costs,
    );

    expect(summary).toEqual({
      total: 27.5,
      ingredientValue: 20,
      trackedItemValue: 7.5,
      pricedCount: 2,
      unpricedCount: 1,
    });
  });

  it("does not flag zero-stock targets without a known cost", () => {
    const summary = summarizeInventoryValue(
      [target({ targetType: "item", id: 5, stockBase: 0 })],
      new Map(),
    );
    expect(summary.unpricedCount).toBe(0);
    expect(summary.total).toBe(0);
  });
});
