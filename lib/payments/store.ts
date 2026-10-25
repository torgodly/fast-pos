import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentMethods } from "@/lib/db/schema";

export type PaymentMethodRow = typeof paymentMethods.$inferSelect;

export function listPaymentMethods(activeOnly = false): PaymentMethodRow[] {
  const query = db.select().from(paymentMethods);
  const rows = activeOnly
    ? query.where(eq(paymentMethods.active, true)).orderBy(
        asc(paymentMethods.sortOrder),
        asc(paymentMethods.id),
      ).all()
    : query.orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.id)).all();
  return rows;
}

export function getPaymentMethod(code: string): PaymentMethodRow | null {
  return (
    db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.code, code))
      .get() ?? null
  );
}

export function getActivePaymentMethod(code: string): PaymentMethodRow | null {
  const method = getPaymentMethod(code);
  return method?.active ? method : null;
}
