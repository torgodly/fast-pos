import { and, asc, desc, eq, gt, isNotNull, lte, sql } from "drizzle-orm";
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
import { nowSqlTripoli, workDateTripoli } from "@/lib/time/tripoli";
import type { VenueId } from "@/lib/types";
import { formatDateTime, getVenueName } from "@/lib/venues";

export function workDateToday() {
  return workDateTripoli();
}

export function nowSql() {
  return nowSqlTripoli();
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

export function getLastClosedShift(venueId: VenueId) {
  return db
    .select()
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
}

/** Z close immediately before `beforeClosedAt` (exclusive). */
export function getPreviousZAt(
  venueId: VenueId,
  beforeClosedAt: string,
): string | null {
  const row = db
    .select({ closedAt: shifts.closedAt })
    .from(shifts)
    .where(
      and(
        eq(shifts.venueId, venueId),
        eq(shifts.status, "closed"),
        isNotNull(shifts.closedAt),
        sql`${shifts.closedAt} < ${beforeClosedAt}`,
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
  /** True when reprinting a past Z (not a new close). */
  isReprint?: boolean;
};

function paidOrdersBetween(
  venueId: VenueId,
  fromExclusive: string | null,
  toInclusive: string,
) {
  return db
    .select()
    .from(orders)
    .where(
      fromExclusive
        ? and(
            eq(orders.venueId, venueId),
            eq(orders.status, "paid"),
            gt(orders.paidAt, fromExclusive),
            lte(orders.paidAt, toInclusive),
          )
        : and(
            eq(orders.venueId, venueId),
            eq(orders.status, "paid"),
            lte(orders.paidAt, toInclusive),
          ),
    )
    .all()
    .filter((o) => o.paidAt != null);
}

function groupSalesBetween(
  venueId: VenueId,
  fromExclusive: string | null,
  toInclusive: string,
) {
  return db
    .select({
      categoryName: sql<string>`coalesce(
        nullif(trim(${orderItems.categoryName}), ''),
        ${categories.name},
        'غير مصنف'
      )`,
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
      fromExclusive
        ? and(
            eq(orders.venueId, venueId),
            eq(orders.status, "paid"),
            gt(orders.paidAt, fromExclusive),
            lte(orders.paidAt, toInclusive),
          )
        : and(
            eq(orders.venueId, venueId),
            eq(orders.status, "paid"),
            lte(orders.paidAt, toInclusive),
          ),
    )
    .groupBy(
      sql`coalesce(
        nullif(trim(${orderItems.categoryName}), ''),
        ${categories.name},
        'غير مصنف'
      )`,
    )
    .all();
}

function assembleDayReport(options: {
  venueId: VenueId;
  kind: "X" | "Z";
  printedByName: string;
  periodFromExclusive: string | null;
  periodToInclusive: string;
  workDate: string;
  isReprint?: boolean;
}): DayReportData {
  const {
    venueId,
    kind,
    printedByName,
    periodFromExclusive,
    periodToInclusive,
    workDate,
    isReprint,
  } = options;

  const paidOrders = paidOrdersBetween(
    venueId,
    periodFromExclusive,
    periodToInclusive,
  );
  const totalSales = paidOrders.reduce((s, o) => s + o.total, 0);
  const cashTotal = paidOrders
    .filter((o) => o.paymentMethod === "cash")
    .reduce((s, o) => s + o.total, 0);
  const cardTotal = paidOrders
    .filter((o) => o.paymentMethod === "card")
    .reduce((s, o) => s + o.total, 0);
  const tableSales = paidOrders.filter((o) => o.tableId != null).length;
  const quickSales = paidOrders.length - tableSales;

  const groupRows = groupSalesBetween(
    venueId,
    periodFromExclusive,
    periodToInclusive,
  );
  const byName = new Map(
    groupRows.map((row) => [
      row.categoryName,
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
    workDate,
    periodFrom: periodFromExclusive
      ? formatDateTime(periodFromExclusive)
      : "بداية التشغيل",
    periodTo: formatDateTime(periodToInclusive),
    printedByName,
    invoiceCount: paidOrders.length,
    totalSales,
    cashTotal,
    cardTotal,
    totalItems,
    tableSales,
    quickSales,
    groups,
    zWindowStart: getZWindowStart(venueId),
    zWindowEnd: getZWindowEnd(venueId),
    canPrintZ: isWithinZWindow(new Date(), venueId),
    isReprint,
  };
}

export function buildDayReportData(
  venueId: VenueId,
  kind: "X" | "Z",
  printedByName: string,
): DayReportData {
  const lastZ = getLastZAt(venueId);
  const now = nowSql();
  return assembleDayReport({
    venueId,
    kind,
    printedByName,
    periodFromExclusive: lastZ,
    periodToInclusive: now,
    workDate: workDateToday(),
  });
}

/** Rebuild the last closed Z period for reprint (does not open a new day). */
export function buildLastZReprintData(
  venueId: VenueId,
  printedByName: string,
): DayReportData | null {
  const last = getLastClosedShift(venueId);
  if (!last?.closedAt) return null;
  return buildZReportByShiftId(last.id, printedByName);
}

/** Reprint any closed Z by shift row id. */
export function buildZReportByShiftId(
  shiftId: number,
  printedByName: string,
): DayReportData | null {
  const shift = db.select().from(shifts).where(eq(shifts.id, shiftId)).get();
  if (!shift?.closedAt || shift.status !== "closed") return null;
  if (shift.venueId !== "restaurant" && shift.venueId !== "cafe") return null;

  const previous = getPreviousZAt(shift.venueId, shift.closedAt);
  return assembleDayReport({
    venueId: shift.venueId,
    kind: "Z",
    printedByName,
    periodFromExclusive: previous,
    periodToInclusive: shift.closedAt,
    workDate: shift.workDate,
    isReprint: true,
  });
}

export type ZReportListItem = {
  shiftId: number;
  venueId: VenueId;
  workDate: string;
  shiftNumber: number;
  closedAt: string;
  closedByName: string | null;
  invoiceCount: number;
  totalSales: number;
  cashTotal: number;
  cardTotal: number;
  periodFrom: string | null;
};

export function listZReports(
  venueId: VenueId,
  limit = 100,
): ZReportListItem[] {
  const closed = db
    .select({
      id: shifts.id,
      venueId: shifts.venueId,
      workDate: shifts.workDate,
      shiftNumber: shifts.shiftNumber,
      closedAt: shifts.closedAt,
      closedByName: users.name,
    })
    .from(shifts)
    .leftJoin(users, eq(shifts.closedBy, users.id))
    .where(
      and(
        eq(shifts.venueId, venueId),
        eq(shifts.status, "closed"),
        isNotNull(shifts.closedAt),
      ),
    )
    .orderBy(desc(shifts.closedAt))
    .limit(limit)
    .all();

  return closed.flatMap((row) => {
    if (!row.closedAt) return [];
    if (row.venueId !== "restaurant" && row.venueId !== "cafe") return [];
    const previous = getPreviousZAt(row.venueId, row.closedAt);
    const paid = paidOrdersBetween(row.venueId, previous, row.closedAt);
    const totalSales = paid.reduce((sum, order) => sum + order.total, 0);
    const cashTotal = paid
      .filter((order) => order.paymentMethod === "cash")
      .reduce((sum, order) => sum + order.total, 0);
    const cardTotal = paid
      .filter((order) => order.paymentMethod === "card")
      .reduce((sum, order) => sum + order.total, 0);
    return [
      {
        shiftId: row.id,
        venueId: row.venueId,
        workDate: row.workDate,
        shiftNumber: row.shiftNumber,
        closedAt: row.closedAt,
        closedByName: row.closedByName,
        invoiceCount: paid.length,
        totalSales,
        cashTotal,
        cardTotal,
        periodFrom: previous,
      },
    ];
  });
}

export function getDayReportStatus(venueId: VenueId) {
  const lastZ = getLastZAt(venueId);
  return {
    venueId,
    lastZAt: lastZ,
    lastZLabel: lastZ ? formatDateTime(lastZ) : null,
    zWindowStart: getZWindowStart(venueId),
    zWindowEnd: getZWindowEnd(venueId),
    canPrintZ: isWithinZWindow(new Date(), venueId),
    workDate: workDateToday(),
    canReprintZ: Boolean(lastZ),
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
