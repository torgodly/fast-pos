import { and, asc, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categories,
  items,
  orderItems,
  orders,
  shifts,
  users,
} from "@/lib/db/schema";
import { reportGroupsForVenue } from "@/lib/reports/groups";
import { getZWindowEnd, getZWindowStart, isWithinZWindow } from "@/lib/settings";
import type { VenueId } from "@/lib/types";
import { formatDateTime, getVenueName } from "@/lib/venues";
import { inputDate } from "@/lib/reports/filters";

export function workDateToday() {
  return inputDate(new Date());
}

export function nowSql() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/** Last Z closedAt for venue — start of current working day. */
export function getLastZAt(venueId: VenueId): string | null {
  const row = db
    .select({ closedAt: shifts.closedAt })
    .from(shifts)
    .where(
      and(
        eq(shifts.venueId, venueId),
        eq(shifts.status, "closed"),
        isNotNull(shifts.closedAt),
      ),
    )
    .orderBy(desc(shifts.closedAt))
    .get();
  return row?.closedAt ?? null;
}

export type DayReportData = {
  kind: "X" | "Z";
  venueName: string;
  workDate: string;
  periodFrom: string;
  periodTo: string;
  printedByName: string;
  invoiceCount: number;
  totalSales: number;
  cashTotal: number;
  cardTotal: number;
  totalItems: number;
  tableSales: number;
  quickSales: number;
  groups: Array<{ name: string; qty: number; revenue: number }>;
  zWindowStart: string;
  zWindowEnd: string;
  canPrintZ: boolean;
};

export function buildDayReportData(
  venueId: VenueId,
  kind: "X" | "Z",
  printedByName: string,
): DayReportData {
  const lastZ = getLastZAt(venueId);
  const now = nowSql();

  const paidOrders = db
    .select()
    .from(orders)
    .where(
      lastZ
        ? and(
            eq(orders.venueId, venueId),
            eq(orders.status, "paid"),
            gt(orders.paidAt, lastZ),
          )
        : and(eq(orders.venueId, venueId), eq(orders.status, "paid")),
    )
    .all()
    .filter((o) => o.paidAt != null);

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
    .where(
      lastZ
        ? and(
            eq(orders.venueId, venueId),
            eq(orders.status, "paid"),
            gt(orders.paidAt, lastZ),
          )
        : and(eq(orders.venueId, venueId), eq(orders.status, "paid")),
    )
    .groupBy(categories.name)
    .all();

  const byName = new Map(
    groupRows.map((row) => [
      row.categoryName ?? "غير مصنف",
      { qty: row.qty, revenue: row.revenue },
    ]),
  );

  const groups = reportGroupsForVenue(venueId).map((name) => ({
    name,
    qty: byName.get(name)?.qty ?? 0,
    revenue: byName.get(name)?.revenue ?? 0,
  }));

  const totalItems = groups.reduce((s, g) => s + g.qty, 0);

  return {
    kind,
    venueName: getVenueName(venueId),
    workDate: workDateToday(),
    periodFrom: lastZ ? formatDateTime(lastZ) : "بداية التشغيل",
    periodTo: formatDateTime(now),
    printedByName,
    invoiceCount: paidOrders.length,
    totalSales,
    cashTotal,
    cardTotal,
    totalItems,
    tableSales,
    quickSales,
    groups,
    zWindowStart: getZWindowStart(),
    zWindowEnd: getZWindowEnd(),
    canPrintZ: isWithinZWindow(),
  };
}

export function getDayReportStatus(venueId: VenueId) {
  const lastZ = getLastZAt(venueId);
  return {
    lastZAt: lastZ,
    lastZLabel: lastZ ? formatDateTime(lastZ) : null,
    zWindowStart: getZWindowStart(),
    zWindowEnd: getZWindowEnd(),
    canPrintZ: isWithinZWindow(),
    workDate: workDateToday(),
  };
}

/** Record a Z close marker (does not block selling). */
export function recordZClose(venueId: VenueId, userId: number) {
  const workDate = workDateToday();
  const existing = db
    .select()
    .from(shifts)
    .where(and(eq(shifts.venueId, venueId), eq(shifts.workDate, workDate)))
    .orderBy(asc(shifts.shiftNumber))
    .all();
  const nextNumber =
    existing.length === 0
      ? 1
      : Math.max(...existing.map((s) => s.shiftNumber)) + 1;

  // Close any leftover "open" shift rows from the old model
  db.update(shifts)
    .set({
      status: "closed",
      closedBy: userId,
      closedAt: nowSql(),
    })
    .where(and(eq(shifts.venueId, venueId), eq(shifts.status, "open")))
    .run();

  db.insert(shifts)
    .values({
      venueId,
      workDate,
      shiftNumber: nextNumber,
      status: "closed",
      openedBy: userId,
      openedAt: nowSql(),
      closedBy: userId,
      closedAt: nowSql(),
    })
    .run();
}

// Compat exports (unused by sell path)
export function getOpenShift(_venueId: VenueId) {
  return null;
}
