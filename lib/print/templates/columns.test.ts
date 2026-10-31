import { describe, expect, it } from "vitest";
import { charWidths, pixelBounds, pixelWidths } from "./columns";

describe("column width distribution", () => {
  it("sums to the paper width for 32 and 48 columns", () => {
    const weights = [11, 4, 7, 8];
    expect(charWidths(weights, 32).reduce((a, b) => a + b, 0)).toBe(32);
    expect(charWidths(weights, 48).reduce((a, b) => a + b, 0)).toBe(48);
  });

  it("sums to 384 pixels and preserves the weight order", () => {
    const widths = pixelWidths([11, 4, 7, 8]);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(384);
    expect(widths[0]).toBeGreaterThan(widths[1]!);
    expect(widths[3]).toBeGreaterThan(widths[2]!);
  });

  it("places the first column at the right edge (RTL)", () => {
    const bounds = pixelBounds([11, 4, 7, 8]);
    expect(bounds[0]).toMatchObject({ right: 384 });
    expect(bounds[1]!.right).toBe(384 - bounds[0]!.width);
    expect(bounds[bounds.length - 1]!.left).toBe(0);
    for (let index = 1; index < bounds.length; index += 1) {
      expect(bounds[index]!.right).toBe(bounds[index - 1]!.left);
    }
  });

  it("tolerates empty and invalid weights", () => {
    expect(charWidths([], 32)).toEqual([]);
    expect(charWidths([0, 0], 32).reduce((a, b) => a + b, 0)).toBe(32);
    const widths = charWidths([NaN, -3, Infinity], 32);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(32);
    for (const width of widths) {
      expect(Number.isInteger(width)).toBe(true);
      expect(width).toBeGreaterThan(0);
    }
  });
});
