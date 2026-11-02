import type { ReportDocument, SectionKind } from "./types";

export type DocumentSpec = {
  fields: readonly string[];
  itemColumns: readonly string[];
  sections: Record<
    string,
    { kind: SectionKind; rowIds: readonly string[]; columnKeys: readonly string[] }
  >;
  placeholders: readonly string[];
  summaryAllowed: boolean;
  qr: boolean;
};

export const BASE_PLACEHOLDERS = ["title", "venue"] as const;

export const DOCUMENT_SPECS: Record<ReportDocument, DocumentSpec> = {
  receipt: {
    fields: [
      "orderNo",
      "invoiceId",
      "table",
      "waiter",
      "customer",
      "phone",
      "cashier",
      "payment",
      "time",
    ],
    itemColumns: ["name", "qty", "unitPrice", "lineTotal"],
    sections: {},
    placeholders: [
      ...BASE_PLACEHOLDERS,
      "subtitle",
      "brand.phone",
      "brand.address",
      "footer",
    ],
    summaryAllowed: true,
    qr: true,
  },
  kitchen: {
    fields: ["orderNo", "invoiceId", "table", "waiter", "time", "ticketPart"],
    itemColumns: ["name", "qty"],
    sections: {},
    placeholders: BASE_PLACEHOLDERS,
    summaryAllowed: false,
    qr: false,
  },
  shift: {
    fields: [
      "workDate",
      "openedAt",
      "closedAt",
      "printedAt",
      "printedByName",
      "openedByName",
      "closedByName",
    ],
    itemColumns: [],
    sections: {
      collection: {
        kind: "kv",
        rowIds: ["invoiceCount", "total", "noPayments", "totalItems", "tableQuick"],
        columnKeys: [],
      },
      expenses: {
        kind: "kv",
        rowIds: ["openingFloat", "expenseTotal"],
        columnKeys: [],
      },
      reconciliation: {
        kind: "kv",
        rowIds: ["expectedCash", "countedCash", "difference"],
        columnKeys: [],
      },
    },
    placeholders: [...BASE_PLACEHOLDERS, "status"],
    summaryAllowed: false,
    qr: false,
  },
  items: {
    fields: ["workDate", "printedAt", "printedByName"],
    itemColumns: [],
    sections: {
      overview: {
        kind: "kv",
        rowIds: ["categoryCount", "itemCount", "totalItems"],
        columnKeys: [],
      },
      categories: {
        kind: "table",
        rowIds: [],
        columnKeys: ["index", "name", "qty", "revenue"],
      },
      itemsList: {
        kind: "table",
        rowIds: [],
        columnKeys: ["index", "name", "qty", "revenue"],
      },
    },
    placeholders: BASE_PLACEHOLDERS,
    summaryAllowed: true,
    qr: false,
  },
  sales: {
    fields: ["from", "to", "printedAt"],
    itemColumns: [],
    sections: {
      totals: {
        kind: "kv",
        rowIds: ["total", "invoiceCount", "totalItems", "tableQuick", "noPayments"],
        columnKeys: [],
      },
      categories: {
        kind: "table",
        rowIds: [],
        columnKeys: ["index", "name", "qty", "revenue"],
      },
      itemsList: {
        kind: "table",
        rowIds: [],
        columnKeys: ["index", "name", "qty", "revenue"],
      },
    },
    placeholders: BASE_PLACEHOLDERS,
    summaryAllowed: true,
    qr: false,
  },
};
