import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categories,
  items,
  orderItems,
  orders,
  shifts,
  users,
} from "@/lib/db/schema";
import { REPORT_GROUP_NAMES } from "@/lib/reports/groups";
import type { VenueId } from "@/lib/types";
import { formatDateTime, getVenueName } from "@/lib/venues";
import { inputDate } from "@/lib/reports/filters";

export function workDateToday() {
  return inputDate(new Date());
}

export function nowSql() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function getOpenShift(venueId: VenueId) {
  return db
    .select()
    .from(shifts)
    .where(and(eq(shifts.venueId, venueId), eq(shifts.status, "open")))
    .get();
}

export function getTodayShifts(venueId: VenueId, workDate = workDateToday()) {
  return db
    .select()
    .from(shifts)
    .where(and(eq(shifts.venueId, venueId), eq(shifts.workDate, workDate)))
    .orderBy(asc(shifts.shiftNumber))
    .all();
}

export function nextShiftNumber(venueId: VenueId, workDate = workDateToday()) {
  const today = getTodayShifts(venueId, workDate);
  if (today.some((s) => s.status === "open")) return null;
  if (today.some((s) => s.shiftNumber === 1 && s.status === "closed")) {
    if (today.some((s) => s.shiftNumber === 2)) return null;
    return 2 as const;
  }
  if (today.length === 0) return 1 as const;
  if (today.every((s) => s.shiftNumber !== 1)) return 1 as const;
  return null;
}

export type ShiftReportData = {
  kind: "X" | "Z";
  venueName: string;
  shiftNumber: number;
  workDate: string;
  openedAt: string;
  closedAt: string | null;
  openedByName: string;
  closedByName: string | null;
  invoiceCount: number;
  totalSales: number;
  cashTotal: number;
  cardTotal: number;
  totalItems: number;
  tableSales: number;
  quickSales: number;
  groups: Array<{ name: string; qty: number; revenue: number }>;
};

export function buildShiftReportData(
  shift: typeof shifts.$inferSelect,
  kind: "X" | "Z",
): ShiftReportData {
  const paidOrders = db
    .select()
    .from(orders)
    .where(and(eq(orders.shiftId, shift.id), eq(orders.status, "paid")))
    .all();

  const totalSales = paidOrders.reduce((s, o) => s + o.total, 0);
  const cashTotal = paidOrders
    .filter((o) => o.paymentMethod === "cash")
    .reduce((s, o) => s + o.total, 0);
  const cardTotal = paidOrders
    .filter((o) => o.paymentMethod === "card")
    .reduce((s, o) => s + o.total, 0);
  const tableSales = paidOrders.filter((o) => o.tableId != null).length;
  const quickSales = paidOrders.length - tableSales;

  const groupRows = db
    .select({
      categoryName: categories.name,
      qty: sql<number>`coalesce(sum(${orderItems.qty}), 0)`.mapWith(Number),
      revenue: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)`.mapWith(
        Number,
      ),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(items, eq(orderItems.itemId, items.id))
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .where(and(eq(orders.shiftId, shift.id), eq(orders.status, "paid")))
    .groupBy(categories.name)
    .all();

  const byName = new Map(
    groupRows.map((row) => [
      row.categoryName ?? "غير مصنف",
      { qty: row.qty, revenue: row.revenue },
    ]),
  );

  const groups = REPORT_GROUP_NAMES.map((name) => ({
    name,
    qty: byName.get(name)?.qty ?? 0,
    revenue: byName.get(name)?.revenue ?? 0,
  }));

  const totalItems = groups.reduce((s, g) => s + g.qty, 0);

  const openedBy = shift.openedBy
    ? db.select().from(users).where(eq(users.id, shift.openedBy)).get()
    : null;
  const closedBy = shift.closedBy
    ? db.select().from(users).where(eq(users.id, shift.closedBy)).get()
    : null;

  return {
    kind,
    venueName: getVenueName(shift.venueId as VenueId),
    shiftNumber: shift.shiftNumber,
    workDate: shift.workDate,
    openedAt: formatDateTime(shift.openedAt),
    closedAt: shift.closedAt ? formatDateTime(shift.closedAt) : null,
    openedByName: openedBy?.name ?? "-",
    closedByName: closedBy?.name ?? null,
    invoiceCount: paidOrders.length,
    totalSales,
    cashTotal,
    cardTotal,
    totalItems,
    tableSales,
    quickSales,
    groups,
  };
}

export function getCashierShiftStatus(venueId: VenueId) {
  const workDate = workDateToday();
  const open = getOpenShift(venueId);
  const today = getTodayShifts(venueId, workDate);
  const next = nextShiftNumber(venueId, workDate);
  const shift1Closed = today.some(
    (s) => s.shiftNumber === 1 && s.status === "closed",
  );
  const shift2Closed = today.some(
    (s) => s.shiftNumber === 2 && s.status === "closed",
  );

  return {
    workDate,
    open,
    today,
    nextShiftNumber: next,
    dayComplete: shift1Closed && shift2Closed,
    canOpen: next !== null && !open,
  };
}
