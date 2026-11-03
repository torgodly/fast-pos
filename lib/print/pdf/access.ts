import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, users } from "@/lib/db/schema";

export type PdfSession = { userId: number; role: string };

/** Mirrors the reprint rules: admins print any invoice, cashiers their own. */
export function canDownloadOrderPdf(
  session: PdfSession,
  orderId: number,
): boolean {
  if (session.role === "admin") return true;
  if (session.role !== "cashier") return false;
  const order = db
    .select({ cashierId: orders.cashierId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .get();
  return order?.cashierId === session.userId;
}

export function canDownloadShiftPdf(session: PdfSession): boolean {
  if (session.role === "admin") return true;
  if (session.role !== "cashier") return false;
  return Boolean(
    db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, session.userId),
          eq(users.role, "cashier"),
          eq(users.active, true),
          eq(users.isMainCashier, true),
        ),
      )
      .get(),
  );
}

export function canDownloadSalesPdf(session: PdfSession): boolean {
  return session.role === "admin";
}

export function canDownloadPurchasesPdf(session: PdfSession): boolean {
  return session.role === "admin";
}

export function canDownloadDesignPdf(session: PdfSession): boolean {
  return session.role === "admin";
}
