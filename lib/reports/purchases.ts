import {
  and,
  desc,
  eq,
  inArray,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
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
  limit?: number;
  offset?: number;
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

function buildPurchaseContext(input: PurchaseFiltersInput) {
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

  return { range, q, supplierId, conditions };
}

export function countPurchaseInvoices(input: PurchaseFiltersInput): number {
  const { conditions } = buildPurchaseContext(input);
  return (
    db
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(purchaseInvoices)
      .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .get()?.value ?? 0
  );
}

export function getPurchaseSummary(input: PurchaseFiltersInput) {
  const { range, q, supplierId, conditions } = buildPurchaseContext(input);

  const supplier =
    supplierId !== null
      ? db
          .select({ name: suppliers.name })
          .from(suppliers)
          .where(eq(suppliers.id, supplierId))
          .get()
      : null;

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalsRow = db
    .select({
      invoiceCount: sql<number>`count(*)`.mapWith(Number),
      totalSpent: sql<number>`coalesce(sum(${purchaseInvoices.totalCost}), 0)`.mapWith(
        Number,
      ),
      supplierCount:
        sql<number>`count(distinct ${purchaseInvoices.supplierId})`.mapWith(
          Number,
        ),
    })
    .from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(where)
    .get();

  const matchingInvoiceIds = db
    .select({ id: purchaseInvoices.id })
    .from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(where);

  const lineCount =
    db
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(purchaseInvoiceLines)
      .where(inArray(purchaseInvoiceLines.invoiceId, matchingInvoiceIds))
      .get()?.value ?? 0;

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
    .where(where)
    .groupBy(purchaseInvoices.id)
    .orderBy(desc(purchaseInvoices.createdAt), desc(purchaseInvoices.id))
    .limit(input.limit ?? -1)
    .offset(input.offset ?? 0)
    .all();

  const totals: PurchaseSummaryTotals = {
    invoiceCount: totalsRow?.invoiceCount ?? 0,
    totalSpent: round2(totalsRow?.totalSpent ?? 0),
    lineCount,
    supplierCount: totalsRow?.supplierCount ?? 0,
  };

  return {
    ...range,
    q,
    supplierId,
    supplierName: supplier?.name ?? null,
    rows,
    total: totals.invoiceCount,
    totals,
  };
}

export type PurchaseSummary = ReturnType<typeof getPurchaseSummary>;
