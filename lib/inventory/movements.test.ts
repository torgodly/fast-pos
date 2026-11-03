import { describe, expect, it } from "vitest";
import { resolveMovementFilters } from "./movements";

describe("resolveMovementFilters", () => {
  it("trims the item search and keeps a valid category id", () => {
    expect(
      resolveMovementFilters({ item: "  قهوة  ", category: "7" }),
    ).toEqual({ item: "قهوة", categoryId: 7 });
  });

  it("treats blank values as no filter", () => {
    expect(resolveMovementFilters({ item: "   ", category: "" })).toEqual({
      item: "",
      categoryId: null,
    });
    expect(resolveMovementFilters({})).toEqual({ item: "", categoryId: null });
  });

  it("rejects invalid category ids", () => {
    expect(resolveMovementFilters({ category: "0" }).categoryId).toBeNull();
    expect(resolveMovementFilters({ category: "-3" }).categoryId).toBeNull();
    expect(resolveMovementFilters({ category: "abc" }).categoryId).toBeNull();
    expect(resolveMovementFilters({ category: "4.5" }).categoryId).toBeNull();
  });
});
