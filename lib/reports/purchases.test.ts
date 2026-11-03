import { describe, expect, it } from "vitest";
import {
  resolvePurchaseRange,
  summarizePurchaseRows,
  type PurchaseInvoiceSummary,
} from "./purchases";

function row(
  partial: Partial<PurchaseInvoiceSummary> & { totalCost: number },
): PurchaseInvoiceSummary {
  return {
    id: partial.id ?? 1,
    supplierName: partial.supplierName ?? null,
    invoiceNumber: partial.invoiceNumber ?? null,
    totalCost: partial.totalCost,
    createdAt: partial.createdAt ?? "2026-11-01 10:00:00",
    lineCount: partial.lineCount ?? 0,
  };
}

describe("resolvePurchaseRange", () => {
  it("treats missing dates as all history", () => {
    expect(resolvePurchaseRange({})).toEqual({
      from: null,
      to: null,
      fromSql: null,
      toSql: null,
      fromLabel: "البداية",
      toLabel: "الآن",
    });
  });

  it("expands date-only values to full day boundaries", () => {
    const range = resolvePurchaseRange({ from: "2026-11-01", to: "2026-11-03" });
    expect(range.fromSql).toBe("2026-11-01 00:00:00");
    expect(range.toSql).toBe("2026-11-03 23:59:59");
    expect(range.fromLabel).toBe("2026-11-01");
    expect(range.toLabel).toBe("2026-11-03");
  });

  it("accepts datetime-local values", () => {
    const range = resolvePurchaseRange({
      from: "2026-11-01T09:30",
      to: "2026-11-01T18:45",
    });
    expect(range.fromSql).toBe("2026-11-01 09:30:00");
    expect(range.toSql).toBe("2026-11-01 18:45:00");
  });

  it("ignores blank values", () => {
    const range = resolvePurchaseRange({ from: "  ", to: "" });
    expect(range.fromSql).toBeNull();
    expect(range.toSql).toBeNull();
  });
});

describe("summarizePurchaseRows", () => {
  it("totals invoices, lines, and distinct suppliers", () => {
    const totals = summarizePurchaseRows([
      row({ id: 1, totalCost: 100, supplierName: "مورد أ", lineCount: 2 }),
      row({ id: 2, totalCost: 50.5, supplierName: "مورد أ", lineCount: 3 }),
      row({ id: 3, totalCost: 20, supplierName: null, lineCount: 1 }),
    ]);

    expect(totals).toEqual({
      invoiceCount: 3,
      totalSpent: 170.5,
      lineCount: 6,
      supplierCount: 1,
    });
  });

  it("returns zeros for an empty range", () => {
    expect(summarizePurchaseRows([])).toEqual({
      invoiceCount: 0,
      totalSpent: 0,
      lineCount: 0,
      supplierCount: 0,
    });
  });
});
