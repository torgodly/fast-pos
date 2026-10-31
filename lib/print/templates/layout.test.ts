import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import { layoutTemplate } from "./layout";
import type { DocumentData, LayoutLine } from "./types";

const receiptData: DocumentData = {
  title: "Acme Corner",
  subtitle: "Fast Cafe · إيصال الدفع",
  venue: "Fast Cafe",
  brandPhone: "0911234567",
  brandAddress: "",
  footer: "شكراً لزيارتكم",
  status: "",
  logoAvailable: true,
  fields: {
    orderNo: "7",
    invoiceId: "#12",
    table: "4",
    waiter: null,
    customer: null,
    phone: null,
    cashier: "سارة",
    payment: "نقدي",
    time: "2026-10-31 14:05",
  },
  items: [
    { name: "كابتشينو", qty: "2", unitPrice: "12.00", lineTotal: "24.00" },
    { name: "قهوة عربية", qty: "1", unitPrice: "8.00", lineTotal: "8.00" },
  ],
  itemNotes: [null, "بدون سكر"],
  sections: {},
  summary: "32.00 د.ل",
};

function texts(lines: LayoutLine[]): string[] {
  return lines.flatMap((line) => (line.kind === "text" ? [line.text] : []));
}

describe("layoutTemplate — receipt", () => {
  it("expands header placeholders and skips empty optional lines", () => {
    const lines = layoutTemplate(DEFAULT_REPORT_TEMPLATES.receipt, receiptData);
    const header = texts(lines).slice(0, 4);
    expect(header).toEqual([
      "Acme Corner",
      "Fast Cafe · إيصال الدفع",
      "0911234567",
      // brand.address expanded to "" and was skipped, so no blank gap leaked:
      "رقم الطلب: 7",
    ]);
    expect(lines.some((line) => line.kind === "logo")).toBe(true);
  });

  it("prints only shown fields that have values, in template order", () => {
    const lines = layoutTemplate(DEFAULT_REPORT_TEMPLATES.receipt, receiptData);
    const body = texts(lines);
    expect(body).toContain("رقم الطلب: 7");
    expect(body).toContain("فاتورة: #12");
    expect(body).not.toContain("السفرادجي:");
    expect(body).not.toContain("العميل:");
    expect(body.indexOf("رقم الطلب: 7")).toBeLessThan(
      body.indexOf("فاتورة: #12"),
    );
  });

  it("uses the four-column header and one columns line per item", () => {
    const lines = layoutTemplate(DEFAULT_REPORT_TEMPLATES.receipt, receiptData);
    const columnLines = lines.filter(
      (line): line is Extract<LayoutLine, { kind: "columns" }> =>
        line.kind === "columns",
    );
    expect(columnLines).toHaveLength(3); // header + 2 items
    expect(columnLines[0]!.cells.map((cell) => cell.text)).toEqual([
      "الصنف",
      "الكمية",
      "السعر",
      "الإجمالي",
    ]);
    expect(columnLines[1]!.cells.map((cell) => cell.text)).toEqual([
      "كابتشينو",
      "2",
      "12.00",
      "24.00",
    ]);
    expect(columnLines[1]!.widths).toEqual([10, 7, 6, 9]);
    expect(columnLines[1]!.widths.reduce((a, b) => a + b, 0)).toBe(32);
  });

  it("prints notes and a bold xlarge summary, and expands the footer", () => {
    const lines = layoutTemplate(DEFAULT_REPORT_TEMPLATES.receipt, receiptData);
    expect(lines).toContainEqual({
      kind: "text",
      text: "• بدون سكر",
      align: "right",
      bold: false,
      size: "small",
    });
    const summary = lines.find(
      (line) => line.kind === "text" && line.text.startsWith("الإجمالي:"),
    );
    expect(summary).toMatchObject({ bold: true, size: "xlarge" });
    expect(texts(lines).at(-1)).toBe("شكراً لزيارتكم");
  });

  it("places dividers after header, fields, and items, and before the summary", () => {
    const lines = layoutTemplate(DEFAULT_REPORT_TEMPLATES.receipt, receiptData);
    const lastHeader = lines.findIndex(
      (line) => line.kind === "text" && line.text === "0911234567",
    );
    expect(lines[lastHeader + 1]).toEqual({ kind: "separator" });
    const lastField = lines.findIndex(
      (line) => line.kind === "text" && line.text.startsWith("الوقت: "),
    );
    expect(lines[lastField + 1]).toEqual({ kind: "separator" });
    const note = lines.findIndex(
      (line) => line.kind === "text" && line.text === "• بدون سكر",
    );
    expect(lines[note + 1]).toEqual({ kind: "separator" });
    const summary = lines.findIndex(
      (line) => line.kind === "text" && line.text.startsWith("الإجمالي:"),
    );
    expect(lines[summary - 1]).toEqual({ kind: "separator" });
  });

  it("wraps a long item name into continuation lines", () => {
    const long = "كابتشينو كبير جداً بالحليب";
    const lines = layoutTemplate(DEFAULT_REPORT_TEMPLATES.receipt, {
      ...receiptData,
      items: [{ name: long, qty: "1", unitPrice: "10.00", lineTotal: "10.00" }],
      itemNotes: [null],
    });
    const continuations = lines.filter(
      (line) =>
        line.kind === "text" &&
        line.text.length < long.length &&
        long.includes(line.text),
    );
    expect(continuations.length).toBeGreaterThan(0);
  });

  it("honours a label override", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    template.labels.customer = "الزبون";
    const lines = layoutTemplate(template, {
      ...receiptData,
      fields: { ...receiptData.fields, customer: "محمد" },
    });
    expect(texts(lines)).toContain("الزبون: محمد");
  });
});

describe("layoutTemplate — documents without an item table", () => {
  it("renders shift sections in template order and the status footer", () => {
    const template = DEFAULT_REPORT_TEMPLATES.shift;
    const lines = layoutTemplate(template, {
      ...receiptData,
      title: "إغلاق وردية #3",
      status: "تم إغلاق الوردية",
      fields: {
        workDate: "2026-10-31",
        openedAt: "09:00",
        closedAt: "18:00",
        printedAt: "18:00",
        printedByName: "سارة",
        openedByName: null,
        closedByName: null,
      },
      sections: {
        collection: {
          kind: "kv",
          rows: [
            { labelId: "invoiceCount", value: "2" },
            { labelId: "total", value: "30.00 د.ل", bold: true },
          ],
        },
        expenses: {
          kind: "kv",
          rows: [],
          emptyText: "لا مصروفات في هذه الوردية",
        },
        reconciliation: {
          kind: "kv",
          rows: [{ labelId: "expectedCash", value: "37.50 د.ل" }],
        },
      },
      summary: null,
    });
    const body = texts(lines);
    expect(body.indexOf("التحصيل")).toBeLessThan(
      body.indexOf("العهدة والمصروفات"),
    );
    expect(body).toContain("لا مصروفات في هذه الوردية");
    expect(body.at(-1)).toBe("تم إغلاق الوردية");
  });

  it("renders grouped tables with a group total and a summary", () => {
    const template = DEFAULT_REPORT_TEMPLATES.items;
    const lines = layoutTemplate(template, {
      ...receiptData,
      title: "تقرير أصناف الوردية #3",
      status: "",
      sections: {
        overview: {
          kind: "kv",
          rows: [
            { labelId: "categoryCount", value: "1" },
            { labelId: "itemCount", value: "2" },
            { labelId: "totalItems", value: "3", bold: true },
          ],
        },
        groups: {
          kind: "groupedTable",
          rows: [],
          groups: [
            {
              label: "مشروبات ساخنة",
              rows: [
                { name: "شاي", qty: "2" },
                { name: "قهوة", qty: "1" },
              ],
              total: "3 قطعة",
            },
            {
              label: "مشروبات باردة",
              rows: [{ name: "كولا", qty: "3" }],
              total: "3 قطعة",
            },
          ],
        },
      },
      summary: "6 قطعة",
    });
    const body = texts(lines);
    expect(body).toContain("— مشروبات ساخنة —");
    expect(body).toContain("إجمالي المجموعة: 3 قطعة");
    expect(body).toContain("الإجمالي العام: 6 قطعة");
    const secondGroup = lines.findIndex(
      (line) => line.kind === "text" && line.text === "— مشروبات باردة —",
    );
    expect(lines[secondGroup - 1]).toEqual({ kind: "separator" });
  });

  it("renders a table section with columns and an empty table message", () => {
    const lines = layoutTemplate(DEFAULT_REPORT_TEMPLATES.sales, {
      ...receiptData,
      title: "تقرير المبيعات",
      status: "",
      fields: { from: "2026-10-30", to: "2026-10-31", printedAt: "18:00" },
      sections: {
        totals: {
          kind: "kv",
          rows: [{ labelId: "total", value: "640.50 د.ل", bold: true }],
        },
        categories: {
          kind: "table",
          rows: [],
          table: [
            { index: "1", name: "مشروبات ساخنة", qty: "18", revenue: "420.50" },
          ],
        },
        itemsList: {
          kind: "table",
          rows: [],
          table: [],
          emptyText: "لا أصناف في هذه الفترة",
        },
      },
      summary: "640.50 د.ل",
    });
    const columnLines = lines.filter(
      (line): line is Extract<LayoutLine, { kind: "columns" }> =>
        line.kind === "columns",
    );
    expect(columnLines).toHaveLength(2); // categories header + one row; empty table prints no header
    expect(columnLines[0]!.cells.map((cell) => cell.text)).toEqual([
      "م",
      "المجموعة",
      "الكمية",
      "الإيراد",
    ]);
    expect(columnLines[1]!.cells.map((cell) => cell.text)).toEqual([
      "1",
      "مشروبات ساخنة",
      "18",
      "420.50",
    ]);
    expect(texts(lines)).toContain("لا أصناف في هذه الفترة");
  });
});

describe("layoutTemplate — block order and visibility", () => {
  it("renders blocks in a custom order", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    template.order = ["summary", "items", "header", "fields", "footer"];
    const body = texts(layoutTemplate(template, receiptData));
    // Item names live in `columns` cells, which `texts` drops; the items
    // block's title is the first text line it emits, so use that instead.
    expect(body.findIndex((text) => text.startsWith("الإجمالي:"))).toBeLessThan(
      body.indexOf("الأصناف"),
    );
    expect(body.indexOf("Acme Corner")).toBeLessThan(body.indexOf("رقم الطلب: 7"));
  });

  it("skips blocks hidden with the new flags", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    template.header.show = false;
    template.fields.visible = false;
    template.footer.show = false;
    template.summary.show = false;
    template.items.show = false;
    expect(layoutTemplate(template, receiptData)).toEqual([]);
  });

  it("falls back to canonical order when order is absent", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    delete template.order;
    expect(layoutTemplate(template, receiptData)).toEqual(
      layoutTemplate(DEFAULT_REPORT_TEMPLATES.receipt, receiptData),
    );
  });

  it("places a section block where order says", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.shift);
    template.order = [
      "section:reconciliation",
      "header",
      "fields",
      "items",
      "section:collection",
      "section:expenses",
      "summary",
      "footer",
    ];
    const lines = layoutTemplate(template, {
      ...receiptData,
      title: "إغلاق وردية #3",
      brandPhone: "",
      fields: {},
      items: [],
      itemNotes: [],
      sections: {
        collection: { kind: "kv", rows: [{ labelId: "invoiceCount", value: "2" }] },
        expenses: { kind: "kv", rows: [] },
        reconciliation: {
          kind: "kv",
          rows: [{ labelId: "expectedCash", value: "37.50 د.ل" }],
        },
      },
      summary: null,
    });
    const body = texts(lines);
    expect(body.indexOf("مطابقة النقد")).toBeLessThan(
      body.indexOf("إغلاق وردية #3"),
    );
  });
});
