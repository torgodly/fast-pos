import { and, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  purchaseInvoiceLines,
  purchaseInvoices,
  suppliers,
} from "@/lib/db/schema";
import { normalizeFilterDateTime, parseId } from "./filters";

export type PurchaseFiltersInput = {
  from?: string;
  to?: string;
  supplier?: string;
  q?: string;
};

export type PurchaseInvoiceSummary = {
  id: number;
  supplierName: string | null;
  invoiceNumber: string | null;
  totalCost: number;
  createdAt: string;
  lineCount: number;
  createdByName?: string;
};

export type PurchaseSummaryTotals = {
  invoiceCount: number;
  totalSpent: number;
  lineCount: number;
  supplierCount: number;
};

export type PurchaseRange = {
  from: string | null;
  to: string | null;
  fromSql: string | null;
  toSql: string | null;
  fromLabel: string;
  toLabel: string;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function resolvePurchaseRange(input: {
  from?: string;
  to?: string;
}): PurchaseRange {
  const from = input.from?.trim() || null;
  const to = input.to?.trim() || null;
  return {
    from,
    to,
    fromSql: from ? normalizeFilterDateTime(from, "", "start") || null : null,
    toSql: to ? normalizeFilterDateTime(to, "", "end") || null : null,
    fromLabel: from ?? "البداية",
    toLabel: to ?? "الآن",
  };
}

export function summarizePurchaseRows(
  rows: PurchaseInvoiceSummary[],
): PurchaseSummaryTotals {
  const supplierNames = new Set(
    rows
      .map((row) => row.supplierName?.trim())
      .filter((name): name is string => Boolean(name)),
  );
  return {
    invoiceCount: rows.length,
    totalSpent: round2(rows.reduce((sum, row) => sum + row.totalCost, 0)),
    lineCount: rows.reduce((sum, row) => sum + row.lineCount, 0),
    supplierCount: supplierNames.size,
  };
}

export function getPurchaseSummary(input: PurchaseFiltersInput) {
  const range = resolvePurchaseRange(input);
  const q = (input.q ?? "").trim();
  const supplierId = parseId(input.supplier);

  const conditions: SQL[] = [];
  if (range.fromSql) {
    conditions.push(sql`${purchaseInvoices.createdAt} >= ${range.fromSql}`);
  }
  if (range.toSql) {
    conditions.push(sql`${purchaseInvoices.createdAt} <= ${range.toSql}`);
  }
  if (supplierId) {
    conditions.push(eq(purchaseInvoices.supplierId, supplierId));
  }
  if (q) {
    const pattern = `%${q}%`;
    const numeric = Number(q.replace("#", ""));
    const matches: SQL[] = [
      like(purchaseInvoices.invoiceNumber, pattern),
      like(purchaseInvoices.note, pattern),
      like(suppliers.name, pattern),
    ];
    if (Number.isInteger(numeric) && numeric > 0) {
      matches.push(eq(purchaseInvoices.id, numeric));
    }
    const combined = or(...matches);
    if (combined) conditions.push(combined);
  }

  const supplier =
    supplierId !== null
      ? db
          .select({ name: suppliers.name })
          .from(suppliers)
          .where(eq(suppliers.id, supplierId))
          .get()
      : null;

  const rows = db
    .select({
      id: purchaseInvoices.id,
      supplierName: suppliers.name,
      invoiceNumber: purchaseInvoices.invoiceNumber,
      totalCost: purchaseInvoices.totalCost,
      createdAt: purchaseInvoices.createdAt,
      createdByName: purchaseInvoices.createdByName,
      lineCount: sql<number>`count(${purchaseInvoiceLines.id})`.mapWith(Number),
    })
    .from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .leftJoin(
      purchaseInvoiceLines,
      eq(purchaseInvoiceLines.invoiceId, purchaseInvoices.id),
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(purchaseInvoices.id)
    .orderBy(desc(purchaseInvoices.createdAt), desc(purchaseInvoices.id))
    .all();

  return {
    ...range,
    q,
    supplierId,
    supplierName: supplier?.name ?? null,
    rows,
    totals: summarizePurchaseRows(rows),
  };
}

export type PurchaseSummary = ReturnType<typeof getPurchaseSummary>;
