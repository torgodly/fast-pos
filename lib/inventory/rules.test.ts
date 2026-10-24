import { describe, expect, it } from "vitest";
import {
  baseToQuantity,
  computeConsumption,
  findInsufficient,
  formatQuantity,
  gramsToDisplay,
  insufficientWarningText,
  isLowStock,
  lineCost,
  quantityToBase,
  roundMoney,
  type BomEntry,
  type IngredientStock,
} from "./rules";

const gram = { name: "غرام", kind: "weight" as const, factorToBase: 1 };
const kilo = { name: "كيلو", kind: "weight" as const, factorToBase: 1000 };
const dozen = { name: "دزينة", kind: "count" as const, factorToBase: 12 };

describe("inventory quantity helpers", () => {
  it("converts quantities to base units and rounds", () => {
    expect(quantityToBase(2.5, 1000)).toBe(2500);
    expect(quantityToBase(1.2345, 1000)).toBe(1235);
    expect(quantityToBase(350, 1)).toBe(350);
    expect(quantityToBase(350.6, 1)).toBe(351);
    expect(quantityToBase(2, 12)).toBe(24);
    expect(quantityToBase(Number.NaN, 1000)).toBe(0);
    expect(quantityToBase(2, 0)).toBe(0);
  });

  it("converts base units back to a display quantity", () => {
    expect(baseToQuantity(2500, 1000)).toBe(2.5);
    expect(baseToQuantity(24, 12)).toBe(2);
    expect(baseToQuantity(Number.NaN, 12)).toBe(0);
  });

  it("formats grams for display in g/kg", () => {
    expect(gramsToDisplay(350)).toBe("350 غ");
    expect(gramsToDisplay(0)).toBe("0 غ");
    expect(gramsToDisplay(2000)).toBe("2 كغ");
    expect(gramsToDisplay(2500)).toBe("2.5 كغ");
    expect(gramsToDisplay(1234)).toBe("1.234 كغ");
    expect(gramsToDisplay(-1500)).toBe("-1.5 كغ");
  });

  it("formats quantities using the unit snapshot", () => {
    expect(formatQuantity(2500, gram)).toBe("2.5 كغ");
    expect(formatQuantity(2500, kilo)).toBe("2.5 كيلو");
    expect(formatQuantity(24, dozen)).toBe("2 دزينة");
    expect(formatQuantity(24, null)).toBe("24 غ");
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
    [10, [{ ingredientId: 1, qtyBase: 200 }]],
    [
      11,
      [
        { ingredientId: 1, qtyBase: 50 },
        { ingredientId: 2, qtyBase: 30 },
      ],
    ],
  ]);

  it("aggregates base quantities per ingredient across lines", () => {
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
          { ingredientId: 1, qtyBase: 0 },
          { ingredientId: 2, qtyBase: 100 },
        ],
      ],
    ]);
    const result = computeConsumption(withZero, [{ itemId: 10, qty: 1 }]);
    expect(result.has(1)).toBe(false);
    expect(result.get(2)).toBe(100);
  });
});

describe("insufficiency warnings", () => {
  const stock = new Map<number, IngredientStock>([
    [
      1,
      {
        name: "لحم",
        stockBase: 500,
        unitName: "غرام",
        unitKind: "weight",
        factorToBase: 1,
      },
    ],
    [
      2,
      {
        name: "جبنة",
        stockBase: 100,
        unitName: "غرام",
        unitKind: "weight",
        factorToBase: 1,
      },
    ],
    [
      3,
      {
        name: "خبز",
        stockBase: 800,
        unitName: "غرام",
        unitKind: "weight",
        factorToBase: 1,
      },
    ],
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
      {
        targetId: 1,
        targetType: "ingredient",
        name: "لحم",
        deficitBase: 300,
        unitName: "غرام",
        unitKind: "weight",
        factorToBase: 1,
      },
      {
        targetId: 2,
        targetType: "ingredient",
        name: "جبنة",
        deficitBase: 50,
        unitName: "غرام",
        unitKind: "weight",
        factorToBase: 1,
      },
    ]);
  });

  it("counts existing negative stock as part of the deficit", () => {
    const warnings = findInsufficient(
      new Map([[1, 200]]),
      new Map([[1, {
        name: "لحم",
        stockBase: -100,
        unitName: "غرام",
        unitKind: "weight",
        factorToBase: 1,
      }]]),
    );
    expect(warnings).toEqual([
      {
        targetId: 1,
        targetType: "ingredient",
        name: "لحم",
        deficitBase: 300,
        unitName: "غرام",
        unitKind: "weight",
        factorToBase: 1,
      },
    ]);
  });

  it("formats warning text in Arabic", () => {
    expect(
      insufficientWarningText([
        {
          targetId: 1,
          targetType: "ingredient",
          name: "لحم",
          deficitBase: 300,
          unitName: "غرام",
          unitKind: "weight",
          factorToBase: 1,
        },
        {
          targetId: 2,
          targetType: "ingredient",
          name: "جبنة",
          deficitBase: 1500,
          unitName: "غرام",
          unitKind: "weight",
          factorToBase: 1,
        },
        {
          targetId: 3,
          targetType: "item",
          name: "كولا",
          deficitBase: 24,
          unitName: "حبة",
          unitKind: "count",
          factorToBase: 1,
        },
      ]),
    ).toBe("لحم (ناقص 300 غ)، جبنة (ناقص 1.5 كغ)، كولا (ناقص 24 حبة)");
  });
});
