// lib/pagination.test.ts
import { describe, expect, it } from "vitest";
import {
  pageHref,
  pageItems,
  parsePageSize,
  resolvePageInfo,
} from "./pagination";

describe("parsePageSize", () => {
  it("accepts 25/50/100 and falls back to 25", () => {
    expect(parsePageSize("25")).toBe(25);
    expect(parsePageSize("50")).toBe(50);
    expect(parsePageSize("100")).toBe(100);
    expect(parsePageSize("7")).toBe(25);
    expect(parsePageSize(undefined)).toBe(25);
    expect(parsePageSize("abc")).toBe(25);
  });
});

describe("resolvePageInfo", () => {
  it("computes offsets and display ranges", () => {
    expect(resolvePageInfo({ page: "3", size: "25" }, 786)).toEqual({
      page: 3,
      size: 25,
      offset: 50,
      total: 786,
      totalPages: 32,
      from: 51,
      to: 75,
    });
  });

  it("clamps pages past the end and ignores invalid pages", () => {
    expect(resolvePageInfo({ page: "999", size: "25" }, 786).page).toBe(32);
    expect(resolvePageInfo({ page: "999", size: "25" }, 786)).toMatchObject({
      offset: 775,
      from: 776,
      to: 786,
    });
    expect(resolvePageInfo({ page: "-2", size: "25" }, 786).page).toBe(1);
    expect(resolvePageInfo({ page: "abc", size: "25" }, 786).page).toBe(1);
    expect(resolvePageInfo({ page: "2", size: "25" }, 0).page).toBe(1);
  });

  it("reports an empty range for zero rows", () => {
    expect(resolvePageInfo({}, 0)).toMatchObject({
      page: 1,
      offset: 0,
      total: 0,
      totalPages: 1,
      from: 0,
      to: 0,
    });
  });

  it("handles an exact multiple", () => {
    expect(resolvePageInfo({ page: "2", size: "25" }, 50)).toMatchObject({
      page: 2,
      offset: 25,
      totalPages: 2,
      from: 26,
      to: 50,
    });
  });
});

describe("pageHref", () => {
  it("preserves filters and omits default page and size", () => {
    expect(
      pageHref("/admin/invoices", { venue: "cafe", q: "42" }, 1, 25),
    ).toBe("/admin/invoices?venue=cafe&q=42");
    expect(pageHref("/admin/audit", {}, 1, 25)).toBe("/admin/audit");
  });

  it("writes non-default size and pages above 1", () => {
    expect(
      pageHref("/admin/invoices", { venue: "cafe" }, 2, 50),
    ).toBe("/admin/invoices?venue=cafe&size=50&page=2");
  });

  it("uses the first array value and drops blank values", () => {
    expect(
      pageHref(
        "/admin/invoices",
        { venue: ["cafe", "restaurant"], q: "   ", page: "9" },
        3,
        100,
      ),
    ).toBe("/admin/invoices?venue=cafe&size=100&page=3");
  });
});

describe("pageItems", () => {
  it("lists every page when they fit", () => {
    expect(pageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("adds ellipsis around edges", () => {
    expect(pageItems(1, 32)).toEqual([1, 2, "ellipsis", 32]);
    expect(pageItems(5, 32)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 32]);
    expect(pageItems(32, 32)).toEqual([1, "ellipsis", 31, 32]);
  });

  it("switches between listing every page and ellipses at the boundary", () => {
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageItems(4, 8)).toEqual([1, "ellipsis", 3, 4, 5, "ellipsis", 8]);
  });
});
