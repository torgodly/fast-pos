import {
  and,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  like,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { parseVenueParam } from "@/lib/admin-venue";
import { db } from "@/lib/db";
import {
  categories,
  items,
  orderItems,
  orders,
  tables,
  users,
} from "@/lib/db/schema";
import type { VenueId } from "@/lib/types";
import { getVenueName } from "@/lib/venues";
import {
  defaultReportRange,
  normalizeFilterDateTime,
  parseId,
  type ReportFiltersInput,
} from "./filters";

export type ReportSummary = {
  venue: VenueId;
  venueName: string;
  from: string;
  to: string;
  fromSql: string;
  toSql: string;
  q: string;
  waiterId: number | null;
  cashierId: number | null;
  categoryId: number | null;
  payment: "all" | "cash" | "card";
  saleType: "all" | "table" | "quick";
  rows: Array<{
    id: number;
    total: number;
    paymentMethod: string | null;
    paidAt: string | null;
    createdAt: string;
    tableName: string | null;
    waiterName: string | null;
    cashierName: string | null;
    waiterId: number | null;
    cashierId: number | null;
    tableId: number | null;
  }>;
  itemSales: Array<{
    itemId: number | null;
    itemName: string;
    qty: number;
    revenue: number;
  }>;
  categorySales: Array<{
    categoryId: number | null;
    categoryName: string;
    qty: number;
    revenue: number;
  }>;
  totalSales: number;
  totalItems: number;
  cashTotal: number;
  cardTotal: number;
  averageTicket: number;
  tableSales: number;
  quickSales: number;
  openCount: number;
  openTotal: number;
  cancelledCount: number;
  waiterPerformance: Array<{
    id: number;
    name: string;
    invoices: number;
    sales: number;
  }>;
  cashierPerformance: Array<{
    id: number;
    name: string;
    invoices: number;
    sales: number;
    cash: number;
    card: number;
  }>;
};

export function getReportSummary(input: ReportFiltersInput): ReportSummary {
  const venue = parseVenueParam(input.venue);
  const defaults = defaultReportRange();
  const q = (input.q ?? "").trim();
  const waiterId = parseId(input.waiter);
  const cashierId = parseId(input.cashier);
  const categoryId = parseId(input.category);
  const payment =
    input.payment === "cash" || input.payment === "card" ? input.payment : "all";
  const saleType =
    input.saleType === "table" || input.saleType === "quick"
      ? input.saleType
      : "all";

  const from = input.from || defaults.from;
  const to = input.to || defaults.to;
  const fromSql = normalizeFilterDateTime(from, defaults.fromSql, "start");
  const toSql = normalizeFilterDateTime(to, defaults.toSql, "end");

  const waiter = alias(users, "waiter");
  const cashier = alias(users, "cashier");

  const staff = db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .where(or(eq(users.role, "waiter"), eq(users.role, "cashier")))
    .all();
  const waiters = staff.filter((person) => person.role === "waiter");
  const cashiers = staff.filter((person) => person.role === "cashier");

  const orderConditions: SQL[] = [
    eq(orders.venueId, venue),
    eq(orders.status, "paid"),
    gte(orders.paidAt, fromSql),
    lte(orders.paidAt, toSql),
  ];
  if (waiterId) orderConditions.push(eq(orders.waiterId, waiterId));
  if (cashierId) orderConditions.push(eq(orders.cashierId, cashierId));
  if (payment !== "all") {
    orderConditions.push(eq(orders.paymentMethod, payment));
  }
  if (saleType === "table") orderConditions.push(isNotNull(orders.tableId));
  if (saleType === "quick") orderConditions.push(isNull(orders.tableId));

  const itemConditions: SQL[] = [...orderConditions];
  if (categoryId) itemConditions.push(eq(items.categoryId, categoryId));
  if (q) itemConditions.push(like(orderItems.itemName, `%${q}%`));

  const matchingOrderIds =
    categoryId || q
      ? new Set(
          db
            .selectDistinct({ orderId: orderItems.orderId })
            .from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(items, eq(orderItems.itemId, items.id))
            .where(and(...itemConditions))
            .all()
            .map((row) => row.orderId),
        )
      : null;

  const allPaidRows = db
    .select({
      id: orders.id,
      total: orders.total,
      paymentMethod: orders.paymentMethod,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      tableName: tables.name,
      waiterName: waiter.name,
      cashierName: cashier.name,
      waiterId: orders.waiterId,
      cashierId: orders.cashierId,
      tableId: orders.tableId,
    })
    .from(orders)
    .leftJoin(tables, eq(orders.tableId, tables.id))
    .leftJoin(waiter, eq(orders.waiterId, waiter.id))
    .leftJoin(cashier, eq(orders.cashierId, cashier.id))
    .where(and(...orderConditions))
    .orderBy(desc(orders.paidAt))
    .all();

  const rows = matchingOrderIds
    ? allPaidRows.filter((row) => matchingOrderIds.has(row.id))
    : allPaidRows;

  const itemSales = db
    .select({
      itemId: orderItems.itemId,
      itemName: orderItems.itemName,
      qty: sql<number>`sum(${orderItems.qty})`.mapWith(Number),
      revenue: sql<number>`sum(${orderItems.lineTotal})`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(items, eq(orderItems.itemId, items.id))
    .where(and(...itemConditions))
    .groupBy(orderItems.itemId, orderItems.itemName)
    .orderBy(desc(sql`sum(${orderItems.qty})`))
    .all();

  const categorySales = db
    .select({
      categoryId: categories.id,
      categoryName: sql<string>`coalesce(
        nullif(trim(${orderItems.categoryName}), ''),
        ${categories.name},
        'غير مصنف'
      )`,
      qty: sql<number>`sum(${orderItems.qty})`.mapWith(Number),
      revenue: sql<number>`sum(${orderItems.lineTotal})`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(items, eq(orderItems.itemId, items.id))
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .where(and(...itemConditions))
    .groupBy(
      sql`coalesce(
        nullif(trim(${orderItems.categoryName}), ''),
        ${categories.name},
        'غير مصنف'
      )`,
      categories.id,
    )
    .orderBy(desc(sql`sum(${orderItems.qty})`))
    .all();

  const totalSales = rows.reduce((s, r) => s + r.total, 0);
  const totalItems = itemSales.reduce((sum, row) => sum + row.qty, 0);
  const cashTotal = rows
    .filter((r) => r.paymentMethod === "cash")
    .reduce((s, r) => s + r.total, 0);
  const cardTotal = rows
    .filter((r) => r.paymentMethod === "card")
    .reduce((s, r) => s + r.total, 0);
  const averageTicket = rows.length ? totalSales / rows.length : 0;
  const tableSalesCount = rows.filter((row) => row.tableId !== null).length;
  const quickSalesCount = rows.length - tableSalesCount;

  const openRows = db
    .select({ total: orders.total })
    .from(orders)
    .where(and(eq(orders.venueId, venue), eq(orders.status, "open")))
    .all();
  const openTotal = openRows.reduce((sum, row) => sum + row.total, 0);

  const cancelledConditions: SQL[] = [
    eq(orders.venueId, venue),
    eq(orders.status, "cancelled"),
    gte(orders.createdAt, fromSql),
    lte(orders.createdAt, toSql),
  ];
  if (waiterId) cancelledConditions.push(eq(orders.waiterId, waiterId));
  if (cashierId) cancelledConditions.push(eq(orders.cashierId, cashierId));
  const cancelledCount =
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(orders)
      .where(and(...cancelledConditions))
      .get()?.count ?? 0;

  const waiterPerformance = waiters
    .map((person) => {
      const personRows = rows.filter((row) => row.waiterId === person.id);
      return {
        id: person.id,
        name: person.name,
        invoices: personRows.length,
        sales: personRows.reduce((sum, row) => sum + row.total, 0),
      };
    })
    .filter((person) => person.invoices > 0)
    .sort((a, b) => b.sales - a.sales);

  const cashierPerformance = cashiers
    .map((person) => {
      const personRows = rows.filter((row) => row.cashierId === person.id);
      return {
        id: person.id,
        name: person.name,
        invoices: personRows.length,
        sales: personRows.reduce((sum, row) => sum + row.total, 0),
        cash: personRows
          .filter((row) => row.paymentMethod === "cash")
          .reduce((sum, row) => sum + row.total, 0),
        card: personRows
          .filter((row) => row.paymentMethod === "card")
          .reduce((sum, row) => sum + row.total, 0),
      };
    })
    .filter((person) => person.invoices > 0)
    .sort((a, b) => b.sales - a.sales);

  return {
    venue,
    venueName: getVenueName(venue),
    from,
    to,
    fromSql,
    toSql,
    q,
    waiterId,
    cashierId,
    categoryId,
    payment,
    saleType,
    rows,
    itemSales,
    categorySales,
    totalSales,
    totalItems,
    cashTotal,
    cardTotal,
    averageTicket,
    tableSales: tableSalesCount,
    quickSales: quickSalesCount,
    openCount: openRows.length,
    openTotal,
    cancelledCount,
    waiterPerformance,
    cashierPerformance,
  };
}
