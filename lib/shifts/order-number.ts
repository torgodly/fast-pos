import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";

/** Next invoice number for a shift; each shift starts at 1. */
export function nextOrderNumber(shiftId: number): number {
  const row = db
    .select({ maxNo: sql<number>`COALESCE(MAX(${orders.orderNo}), 0)` })
    .from(orders)
    .where(eq(orders.shiftId, shiftId))
    .get();
  return Number(row?.maxNo ?? 0) + 1;
}
