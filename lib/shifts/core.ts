import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import {
  categories,
  items,
  orderItems,
  orders,
  shiftExpenses,
  shifts,
  users,
} from "@/lib/db/schema";
import {
  buildPaymentBreakdown,
  type PaymentBreakdownItem,
} from "@/lib/payments/core";
import { listPaymentMethods } from "@/lib/payments/store";
import { reportGroupsForVenue } from "@/lib/reports/groups";
import { nowSqlTripoli, workDateTripoli } from "@/lib/time/tripoli";
import type { VenueId } from "@/lib/types";
import { formatPrintTimestamp, getVenueName, isVenueId } from "@/lib/venues";
import {
  calculateShiftCash,
  roundMoney,
  validateShiftExpense,
} from "./cash";

export const OPEN_SHIFT_REQUIRED_ERROR =
  "لا توجد وردية مفتوحة — افتح الوردية أولاً قبل البيع";
export const SHIFT_ALREADY_OPEN_ERROR =
  "توجد وردية مفتوحة بالفعل لهذا القسم — أغلقها قبل فتح وردية جديدة";

export type ShiftRow = typeof shifts.$inferSelect;

export type ShiftExpenseRow = typeof shiftExpenses.$inferSelect;

export type ShiftExpenseItem = {
  id: number;
  reason: string;
  amount: number;
  createdByName: string;
  createdAt: string;
};

export type ShiftItemSale = {
  name: string;
  qty: number;
  categoryName: string;
};

export type ShiftReportKind = "summary" | "close" | "reprint";

export type ShiftReportData = {
  kind: ShiftReportKind;
  shiftId: number;
  shiftNumber: number;
  venueId: VenueId;
  venueName: string;
  workDate: string;
  openedAt: string;
  closedAt: string | null;
  printedAt: string;
  printedByName: string;
  openedByName: string | null;
  closedByName: string | null;
  invoiceCount: number;
  totalSales: number;
  cashTotal: number;
  nonCashTotal: number;
  paymentBreakdown: PaymentBreakdownItem[];
  totalItems: number;
  tableSales: number;
  quickSales: number;
  groups: Array<{ name: string; qty: number; revenue: number }>;
  items: ShiftItemSale[];
  openingFloat: number;
  expenseTotal: number;
  expenses: Array<{
    id: number;
    reason: string;
    amount: number;
    createdByName: string;
  }>;
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
};

export type ShiftTotals = {
  invoiceCount: number;
  totalSales: number;
  cashTotal: number;
  nonCashTotal: number;
  paymentBreakdown: PaymentBreakdownItem[];
  totalItems: number;
  tableSales: number;
  quickSales: number;
  groups: Array<{ name: string; qty: number; revenue: number }>;
  items: ShiftItemSale[];
  expenseTotal: number;
};

export type ShiftListItem = {
  shiftId: number;
  shiftNumber: number;
  workDate: string;
  openedAt: string;
  closedAt: string;
  openedByName: string | null;
  closedByName: string | null;
  openingFloat: number;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
  invoiceCount: number;
  totalSales: number;
  cashTotal: number;
  nonCashTotal: number;
  paymentBreakdown: PaymentBreakdownItem[];
  expenseTotal: number;
};

export function getOpenShift(venueId: VenueId): ShiftRow | null {
  return (
    db
      .select()
      .from(shifts)
      .where(and(eq(shifts.venueId, venueId), eq(shifts.status, "open")))
      .orderBy(desc(shifts.openedAt))
      .get() ?? null
  );
}

export function getShiftById(shiftId: number): ShiftRow | null {
  return db.select().from(shifts).where(eq(shifts.id, shiftId)).get() ?? null;
}

export function getLastClosedShift(venueId: VenueId): ShiftRow | null {
  return (
    db
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
      .get() ?? null
  );
}

export function openShift(
  venueId: VenueId,
  userId: number,
  openingFloat: number,
): { error: string } | { ok: true; shift: ShiftRow } {
  if (!Number.isFinite(openingFloat) || openingFloat < 0) {
    return { error: "العهدة الافتتاحية غير صالحة" };
  }
  if (getOpenShift(venueId)) {
    return { error: SHIFT_ALREADY_OPEN_ERROR };
  }

  const workDate = workDateTripoli();
  const last = db
    .select({ shiftNumber: shifts.shiftNumber })
    .from(shifts)
    .where(and(eq(shifts.venueId, venueId), eq(shifts.workDate, workDate)))
    .orderBy(desc(shifts.shiftNumber))
    .get();
  const shiftNumber = (last?.shiftNumber ?? 0) + 1;

  try {
    const shift = db
      .insert(shifts)
      .values({
        venueId,
        workDate,
        shiftNumber,
        status: "open",
        openedBy: userId,
        openedAt: nowSqlTripoli(),
        openingFloat: roundMoney(openingFloat),
      })
      .returning()
      .get();
    return { ok: true, shift };
  } catch {
    return { error: SHIFT_ALREADY_OPEN_ERROR };
  }
}

function paidOrdersForShift(shiftId: number) {
  return db
    .select()
    .from(orders)
    .where(and(eq(orders.shiftId, shiftId), eq(orders.status, "paid")))
    .all();
}

function groupSalesForShift(shiftId: number) {
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
    .where(and(eq(orders.shiftId, shiftId), eq(orders.status, "paid")))
    .groupBy(
      sql`coalesce(
        nullif(trim(${orderItems.categoryName}), ''),
        ${categories.name},
        'غير مصنف'
      )`,
    )
    .all();
}

function itemSalesForShift(shiftId: number): ShiftItemSale[] {
  return db
    .select({
      name: orderItems.itemName,
      categoryName: sql<string>`coalesce(
        nullif(trim(${orderItems.categoryName}), ''),
        ${categories.name},
        'غير مصنف'
      )`,
      qty: sql<number>`coalesce(sum(${orderItems.qty}), 0)`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(items, eq(orderItems.itemId, items.id))
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .where(and(eq(orders.shiftId, shiftId), eq(orders.status, "paid")))
    .groupBy(
      orderItems.itemName,
      sql`coalesce(
        nullif(trim(${orderItems.categoryName}), ''),
        ${categories.name},
        'غير مصنف'
      )`,
    )
    .all()
    .sort((a, b) => {
      if (a.categoryName === "غير مصنف") {
        return b.categoryName === "غير مصنف" ? 0 : 1;
      }
      if (b.categoryName === "غير مصنف") return -1;
      return (
        a.categoryName.localeCompare(b.categoryName, "ar") ||
        b.qty - a.qty ||
        a.name.localeCompare(b.name, "ar")
      );
    });
}

export function getShiftExpenseTotal(shiftId: number): number {
  const row = db
    .select({
      total: sql<number>`coalesce(sum(${shiftExpenses.amount}), 0)`.mapWith(
        Number,
      ),
    })
    .from(shiftExpenses)
    .where(eq(shiftExpenses.shiftId, shiftId))
    .get();
  return roundMoney(row?.total ?? 0);
}

export function listShiftExpenses(shiftId: number): ShiftExpenseItem[] {
  return db
    .select({
      id: shiftExpenses.id,
      reason: shiftExpenses.reason,
      amount: shiftExpenses.amount,
      createdByName: shiftExpenses.createdByName,
      createdAt: shiftExpenses.createdAt,
    })
    .from(shiftExpenses)
    .where(eq(shiftExpenses.shiftId, shiftId))
    .orderBy(asc(shiftExpenses.id))
    .all();
}

export function addShiftExpense(input: {
  shiftId: number;
  userId: number;
  userName: string;
  amount: number;
  reason: string;
}): { error: string } | { ok: true; expense: ShiftExpenseRow } {
  const shift = getShiftById(input.shiftId);
  if (!shift) return { error: "الوردية غير موجودة" };
  if (shift.status !== "open") {
    return { error: "لا يمكن تسجيل مصروف بعد إغلاق الوردية" };
  }

  const validation = validateShiftExpense(input.amount, input.reason);
  if (validation) return { error: validation };

  const expense = db
    .insert(shiftExpenses)
    .values({
      shiftId: shift.id,
      amount: roundMoney(input.amount),
      reason: input.reason.trim(),
      createdBy: input.userId,
      createdByName: input.userName,
    })
    .returning()
    .get();
  return { ok: true, expense };
}

export function removeShiftExpense(
  expenseId: number,
): { error: string } | { ok: true; expense: ShiftExpenseRow } {
  const expense = db
    .select()
    .from(shiftExpenses)
    .where(eq(shiftExpenses.id, expenseId))
    .get();
  if (!expense) return { error: "المصروف غير موجود" };

  const shift = getShiftById(expense.shiftId);
  if (!shift || shift.status !== "open") {
    return { error: "لا يمكن حذف مصروف بعد إغلاق الوردية" };
  }

  db.delete(shiftExpenses).where(eq(shiftExpenses.id, expense.id)).run();
  return { ok: true, expense };
}

export function getShiftTotals(venueId: VenueId, shiftId: number): ShiftTotals {
  const paidOrders = paidOrdersForShift(shiftId);
  const totalSales = roundMoney(
    paidOrders.reduce((sum, order) => sum + order.total, 0),
  );
  const payment = buildPaymentBreakdown(
    paidOrders.map((order) => ({
      paymentMethod: order.paymentMethod,
      total: order.total,
    })),
    listPaymentMethods(),
  );
  const tableSales = paidOrders.filter((order) => order.tableId !== null).length;

  const byName = new Map(
    groupSalesForShift(shiftId).map((row) => [
      row.categoryName,
      { qty: row.qty, revenue: row.revenue },
    ]),
  );
  const groups = reportGroupsForVenue(venueId).map((name) => ({
    name,
    qty: byName.get(name)?.qty ?? 0,
    revenue: byName.get(name)?.revenue ?? 0,
  }));
  const items = itemSalesForShift(shiftId);

  return {
    invoiceCount: paidOrders.length,
    totalSales,
    cashTotal: payment.cashTotal,
    nonCashTotal: payment.nonCashTotal,
    paymentBreakdown: payment.breakdown,
    totalItems: items.reduce((sum, item) => sum + item.qty, 0),
    tableSales,
    quickSales: paidOrders.length - tableSales,
    groups,
    items,
    expenseTotal: getShiftExpenseTotal(shiftId),
  };
}

export function buildShiftReportData(
  shiftId: number,
  printedByName: string,
  kind: ShiftReportKind,
): ShiftReportData | null {
  const shift = getShiftById(shiftId);
  if (!shift || !isVenueId(shift.venueId)) {
    return null;
  }

  const totals = getShiftTotals(shift.venueId, shift.id);
  const cash = calculateShiftCash(
    shift.openingFloat,
    totals.cashTotal,
    totals.expenseTotal,
    shift.countedCash,
  );
  const openedBy = shift.openedBy
    ? db.select().from(users).where(eq(users.id, shift.openedBy)).get()
    : null;
  const closedBy = shift.closedBy
    ? db.select().from(users).where(eq(users.id, shift.closedBy)).get()
    : null;

  return {
    kind,
    shiftId: shift.id,
    shiftNumber: shift.shiftNumber,
    venueId: shift.venueId,
    venueName: getVenueName(shift.venueId),
    workDate: shift.workDate,
    openedAt: formatPrintTimestamp(shift.openedAt),
    closedAt: shift.closedAt ? formatPrintTimestamp(shift.closedAt) : null,
    printedAt: formatPrintTimestamp(new Date()),
    printedByName,
    openedByName: openedBy?.name ?? null,
    closedByName: closedBy?.name ?? null,
    invoiceCount: totals.invoiceCount,
    totalSales: totals.totalSales,
    cashTotal: totals.cashTotal,
    nonCashTotal: totals.nonCashTotal,
    paymentBreakdown: totals.paymentBreakdown,
    totalItems: totals.totalItems,
    tableSales: totals.tableSales,
    quickSales: totals.quickSales,
    groups: totals.groups,
    items: totals.items,
    openingFloat: roundMoney(shift.openingFloat),
    expenseTotal: totals.expenseTotal,
    expenses: listShiftExpenses(shift.id).map((expense) => ({
      id: expense.id,
      reason: expense.reason,
      amount: expense.amount,
      createdByName: expense.createdByName,
    })),
    expectedCash: shift.expectedCash ?? cash.expectedCash,
    countedCash: shift.countedCash,
    difference: shift.difference ?? cash.difference,
  };
}

export function closeShift(
  shiftId: number,
  userId: number,
  countedCash: number,
): { error: string } | { ok: true; shift: ShiftRow; totals: ShiftTotals } {
  if (!Number.isFinite(countedCash) || countedCash < 0) {
    return { error: "المبلغ المعدود غير صالح" };
  }

  const shift = getShiftById(shiftId);
  if (!shift) return { error: "الوردية غير موجودة" };
  if (shift.status !== "open") return { error: "الوردية مغلقة بالفعل" };
  if (!isVenueId(shift.venueId)) {
    return { error: "فرع غير صالح" };
  }

  const totals = getShiftTotals(shift.venueId, shift.id);
  const counted = roundMoney(countedCash);
  const { expectedCash, difference } = calculateShiftCash(
    shift.openingFloat,
    totals.cashTotal,
    totals.expenseTotal,
    counted,
  );

  db.update(shifts)
    .set({
      status: "closed",
      closedBy: userId,
      closedAt: nowSqlTripoli(),
      expectedCash,
      countedCash: counted,
      difference,
    })
    .where(eq(shifts.id, shift.id))
    .run();

  return { ok: true, shift: getShiftById(shift.id)!, totals };
}

export function listShifts(venueId: VenueId, limit = 100): ShiftListItem[] {
  const closedUser = alias(users, "closed_user");
  const rows = db
    .select({
      id: shifts.id,
      shiftNumber: shifts.shiftNumber,
      workDate: shifts.workDate,
      openedAt: shifts.openedAt,
      closedAt: shifts.closedAt,
      openingFloat: shifts.openingFloat,
      expectedCash: shifts.expectedCash,
      countedCash: shifts.countedCash,
      difference: shifts.difference,
      openedByName: users.name,
      closedByName: closedUser.name,
    })
    .from(shifts)
    .leftJoin(users, eq(shifts.openedBy, users.id))
    .leftJoin(closedUser, eq(shifts.closedBy, closedUser.id))
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

  const methods = listPaymentMethods();
  const shiftIds = rows.map((row) => row.id);
  const paidRows = shiftIds.length
    ? db
        .select({
          shiftId: orders.shiftId,
          paymentMethod: orders.paymentMethod,
          total: orders.total,
        })
        .from(orders)
        .where(
          and(
            eq(orders.venueId, venueId),
            eq(orders.status, "paid"),
            inArray(orders.shiftId, shiftIds),
          ),
        )
        .all()
    : [];
  const paidByShift = new Map<
    number,
    Array<{ paymentMethod: string | null; total: number }>
  >();
  for (const row of paidRows) {
    if (row.shiftId === null) continue;
    const list = paidByShift.get(row.shiftId) ?? [];
    list.push({ paymentMethod: row.paymentMethod, total: row.total });
    paidByShift.set(row.shiftId, list);
  }
  const totalsByShift = new Map(
    [...paidByShift.entries()].map(([shiftId, list]) => {
      const payment = buildPaymentBreakdown(list, methods);
      return [
        shiftId,
        {
          invoiceCount: list.length,
          totalSales: roundMoney(
            list.reduce((sum, row) => sum + row.total, 0),
          ),
          cashTotal: payment.cashTotal,
          nonCashTotal: payment.nonCashTotal,
          paymentBreakdown: payment.breakdown,
        },
      ];
    }),
  );

  const expenseRows = db
    .select({
      shiftId: shiftExpenses.shiftId,
      expenseTotal: sql<number>`coalesce(sum(${shiftExpenses.amount}), 0)`.mapWith(
        Number,
      ),
    })
    .from(shiftExpenses)
    .groupBy(shiftExpenses.shiftId)
    .all();
  const expensesByShift = new Map(
    expenseRows.map((row) => [row.shiftId, row.expenseTotal]),
  );

  return rows.flatMap((row) => {
    if (!row.closedAt) return [];
    const totals = totalsByShift.get(row.id);
    return [
      {
        shiftId: row.id,
        shiftNumber: row.shiftNumber,
        workDate: row.workDate,
        openedAt: row.openedAt,
        closedAt: row.closedAt,
        openedByName: row.openedByName,
        closedByName: row.closedByName,
        openingFloat: row.openingFloat,
        expectedCash: row.expectedCash,
        countedCash: row.countedCash,
        difference: row.difference,
        invoiceCount: totals?.invoiceCount ?? 0,
        totalSales: totals?.totalSales ?? 0,
        cashTotal: totals?.cashTotal ?? 0,
        nonCashTotal: totals?.nonCashTotal ?? 0,
        paymentBreakdown: totals?.paymentBreakdown ?? [],
        expenseTotal: expensesByShift.get(row.id) ?? 0,
      },
    ];
  });
}
