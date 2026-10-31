import { describe, expect, it } from "vitest";
import {
  addFooterLine,
  addHeaderLine,
  blankSample,
  blockLabel,
  blockVisible,
  canonicalBlockIds,
  moveBlock,
  orderedBlockIds,
  resizeColumns,
  setBlockVisible,
} from "./blocks";
import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import { tableWidths } from "./layout";
import { buildSampleDocuments, sampleSettings } from "./sample";
import { REPORT_DOCUMENTS } from "./types";

describe("block ids", () => {
  it("lists the canonical order for every document", () => {
    expect(canonicalBlockIds([])).toEqual([
      "header",
      "fields",
      "items",
      "summary",
      "footer",
    ]);
    expect(
      canonicalBlockIds(["collection", "expenses", "reconciliation"]),
    ).toEqual([
      "header",
      "fields",
      "items",
      "section:collection",
      "section:expenses",
      "section:reconciliation",
      "summary",
      "footer",
    ]);
    for (const doc of REPORT_DOCUMENTS) {
      const template = DEFAULT_REPORT_TEMPLATES[doc];
      expect(orderedBlockIds(template), doc).toEqual(
        canonicalBlockIds(template.sections.map((section) => section.id)),
      );
    }
  });

  it("normalizes partial, duplicate, and unknown order entries", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.shift);
    template.order = ["summary", "section:collection", "summary", "nope"];
    expect(orderedBlockIds(template)).toEqual([
      "summary",
      "section:collection",
      "header",
      "fields",
      "items",
      "section:expenses",
      "section:reconciliation",
      "footer",
    ]);
  });

  it("labels sections with their title", () => {
    expect(blockLabel(DEFAULT_REPORT_TEMPLATES.receipt, "header")).toBe("الترويسة");
    expect(blockLabel(DEFAULT_REPORT_TEMPLATES.shift, "section:collection")).toBe(
      "التحصيل",
    );
  });
});

describe("moveBlock", () => {
  it("moves blocks to the start, the end, and by one step", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    expect(orderedBlockIds(moveBlock(template, "summary", 0))[0]).toBe("summary");
    expect(orderedBlockIds(moveBlock(template, "summary", 99)).at(-1)).toBe("summary");
    expect(orderedBlockIds(moveBlock(moveBlock(template, "summary", 2), "summary", 3))).toEqual([
      "header",
      "fields",
      "items",
      "summary",
      "footer",
    ]);
    expect(moveBlock(template, "header", -5).order![0]).toBe("header");
  });
});

describe("visibility", () => {
  it("toggles every block without losing field selections", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    const hiddenFields = setBlockVisible(template, "fields", false);
    expect(hiddenFields.fields.visible).toBe(false);
    expect(hiddenFields.fields.show).toEqual(template.fields.show);
    expect(blockVisible(hiddenFields, "fields")).toBe(false);
    expect(blockVisible(setBlockVisible(hiddenFields, "fields", true), "fields")).toBe(true);

    expect(blockVisible(setBlockVisible(template, "header", false), "header")).toBe(false);
    expect(blockVisible(setBlockVisible(template, "summary", false), "summary")).toBe(false);
    expect(blockVisible(setBlockVisible(template, "footer", false), "footer")).toBe(false);

    const shift = structuredClone(DEFAULT_REPORT_TEMPLATES.shift);
    expect(
      blockVisible(setBlockVisible(shift, "section:collection", false), "section:collection"),
    ).toBe(false);
  });
});

describe("line additions", () => {
  it("caps header and footer lines at six", () => {
    let template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    for (let index = 0; index < 10; index += 1) template = addHeaderLine(template);
    expect(template.header.lines).toHaveLength(6);

    let footer = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    for (let index = 0; index < 10; index += 1) footer = addFooterLine(footer);
    expect(footer.footer.lines).toHaveLength(6);
  });
});

describe("resizeColumns", () => {
  it("reproduces requested widths and keeps the paper width", () => {
    const columns = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt).items.columns;
    const resized = resizeColumns(columns, [10, 7, 6, 9], 32);
    expect(resized.map((column) => column.width)).toEqual([10, 7, 6, 9]);
    expect(tableWidths(resized, 32)).toEqual([10, 7, 6, 9]);
    expect(resized.reduce((sum, column) => sum + column.width, 0)).toBe(32);
  });

  it("clamps a zero extra up to one character and round-trips exactly", () => {
    const columns = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt).items.columns;
    const resized = resizeColumns(columns, [10, 6, 6, 10], 32);
    expect(resized.map((column) => column.width)).toEqual([9, 7, 6, 10]);
    expect(resized.reduce((sum, column) => sum + column.width, 0)).toBe(32);
    expect(tableWidths(resized, 32)).toEqual([9, 7, 6, 10]);
  });

  it("reproduces the rendered default widths when fed back in", () => {
    const columns = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt).items.columns;
    const rendered = tableWidths(columns, 32);
    expect(rendered).toEqual([10, 7, 6, 9]);
    const resized = resizeColumns(columns, rendered, 32);
    expect(resized.map((column) => column.width)).toEqual(rendered);
    expect(tableWidths(resized, 32)).toEqual(rendered);
  });

  it("clamps below-label and oversized requests", () => {
    const columns = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt).items.columns;
    const resized = resizeColumns(columns, [5, 6, 5, 64], 32);
    const rendered = tableWidths(resized, 32);
    expect(rendered.reduce((sum, value) => sum + value, 0)).toBe(32);
    rendered.forEach((width, index) => {
      expect(width).toBeGreaterThanOrEqual(columns[index]!.label.length);
    });
    expect(resized.reduce((sum, column) => sum + column.width, 0)).toBe(32);
  });

  it("falls back when the labels alone exceed the paper, and handles 48 columns", () => {
    const columns = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt).items.columns;
    const wide = columns.map((column) => ({ ...column, label: "x".repeat(10) }));
    const fallback = resizeColumns(wide, [12, 12, 12, 12], 32);
    expect(tableWidths(fallback, 32).reduce((sum, value) => sum + value, 0)).toBe(32);

    const paper48 = resizeColumns(columns, [14, 10, 11, 13], 48);
    expect(tableWidths(paper48, 48)).toEqual([14, 10, 11, 13]);
    expect(paper48.reduce((sum, column) => sum + column.width, 0)).toBe(48);
  });
});

describe("blankSample", () => {
  it("blanks values while keeping the paper heading", () => {
    const sample = buildSampleDocuments(sampleSettings).receipt;
    const blank = blankSample(sample);
    expect(blank.title).toBe(sample.title);
    expect(blank.venue).toBe(sample.venue);
    expect(blank.footer).toBe(sample.footer);
    expect(blank.status).toBe("");
    expect(Object.values(blank.fields).every((value) => value === null)).toBe(true);
    expect(blank.items).toEqual([]);
    expect(blank.itemNotes).toEqual([]);
    expect(blank.sections).toEqual({});
    expect(blank.summary).toBeNull();
  });
});
