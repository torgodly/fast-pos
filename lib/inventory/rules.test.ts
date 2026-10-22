import { describe, expect, it } from "vitest";
import {
  computeConsumption,
  findInsufficient,
  gramsFromQuantity,
  gramsToDisplay,
  insufficientWarningText,
  isLowStock,
  kgToGrams,
  lineCost,
  roundMoney,
  type BomEntry,
} from "./rules";

describe("inventory quantity helpers", () => {
  it("converts kilograms to grams and rounds", () => {
    expect(kgToGrams(2.5)).toBe(2500);
    expect(kgToGrams(1.2345)).toBe(1235);
    expect(gramsFromQuantity(2.5, "kg")).toBe(2500);
    expect(gramsFromQuantity(350, "g")).toBe(350);
    expect(gramsFromQuantity(350.6, "g")).toBe(351);
    expect(gramsFromQuantity(Number.NaN, "kg")).toBe(0);
  });

  it("formats grams for display in g/kg", () => {
    expect(gramsToDisplay(350)).toBe("350 غ");
    expect(gramsToDisplay(0)).toBe("0 غ");
    expect(gramsToDisplay(2000)).toBe("2 كغ");
    expect(gramsToDisplay(2500)).toBe("2.5 كغ");
    expect(gramsToDisplay(1234)).toBe("1.23 كغ");
    expect(gramsToDisplay(-1500)).toBe("-1.5 كغ");
  });

  it("rounds money and computes line costs", () => {
    expect(roundMoney(10.006)).toBe(10.01);
    expect(lineCost(2.5, 30)).toBe(75);
    expect(lineCost(Number.NaN, 10)).toBe(0);
  });

  it("flags low stock only when a threshold is set", () => {
    expect(isLowStock(500, 500)).toBe(true);
    expect(isLowStock(499, 500)).toBe(true);
    expect(isLowStock(501, 500)).toBe(false);
    expect(isLowStock(0, 0)).toBe(false);
    expect(isLowStock(-10, 0)).toBe(false);
  });
});

describe("consumption aggregation", () => {
  const bom = new Map<number, BomEntry[]>([
    [10, [{ ingredientId: 1, gramsPerUnit: 200 }]],
    [
      11,
      [
        { ingredientId: 1, gramsPerUnit: 50 },
        { ingredientId: 2, gramsPerUnit: 30 },
      ],
    ],
  ]);

  it("aggregates grams per ingredient across lines", () => {
    const result = computeConsumption(bom, [
      { itemId: 10, qty: 2 },
      { itemId: 11, qty: 3 },
    ]);
    expect(result.get(1)).toBe(550);
    expect(result.get(2)).toBe(90);
  });

  it("skips deleted items, missing BOMs, and zero quantities", () => {
    const result = computeConsumption(bom, [
      { itemId: null, qty: 5 },
      { itemId: 99, qty: 4 },
      { itemId: 10, qty: 0 },
      { itemId: 10, qty: -3 },
    ]);
    expect(result.size).toBe(0);
  });

  it("ignores non-positive BOM entries", () => {
    const withZero = new Map<number, BomEntry[]>([
      [
        10,
        [
          { ingredientId: 1, gramsPerUnit: 0 },
          { ingredientId: 2, gramsPerUnit: 100 },
        ],
      ],
    ]);
    const result = computeConsumption(withZero, [{ itemId: 10, qty: 1 }]);
    expect(result.has(1)).toBe(false);
    expect(result.get(2)).toBe(100);
  });
});

describe("insufficiency warnings", () => {
  const stock = new Map([
    [1, { name: "لحم", stockGrams: 500 }],
    [2, { name: "جبنة", stockGrams: 100 }],
    [3, { name: "خبز", stockGrams: 800 }],
  ]);

  it("reports only ingredients with a deficit, largest first", () => {
    const warnings = findInsufficient(
      new Map([
        [1, 800],
        [2, 150],
        [3, 800],
      ]),
      stock,
    );
    expect(warnings).toEqual([
      { ingredientId: 1, name: "لحم", deficit: 300 },
      { ingredientId: 2, name: "جبنة", deficit: 50 },
    ]);
  });

  it("counts existing negative stock as part of the deficit", () => {
    const warnings = findInsufficient(
      new Map([[1, 200]]),
      new Map([[1, { name: "لحم", stockGrams: -100 }]]),
    );
    expect(warnings).toEqual([{ ingredientId: 1, name: "لحم", deficit: 300 }]);
  });

  it("formats warning text in Arabic", () => {
    expect(
      insufficientWarningText([
        { ingredientId: 1, name: "لحم", deficit: 300 },
        { ingredientId: 2, name: "جبنة", deficit: 1500 },
      ]),
    ).toBe("لحم (ناقص 300 غ)، جبنة (ناقص 1.5 كغ)");
  });
});
