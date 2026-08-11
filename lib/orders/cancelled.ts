import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cancelledItems } from "@/lib/db/schema";
import type { CancelledReceiptLine } from "@/lib/print/receipts";

export function cancelledReceiptLines(orderId: number): CancelledReceiptLine[] {
  return db
    .select()
    .from(cancelledItems)
    .where(eq(cancelledItems.orderId, orderId))
    .all()
    .map((row) => ({
      name: row.itemName,
      qty: row.qtyRemoved,
      unitPrice: row.unitPrice,
      lineTotal: row.lineTotalRemoved,
      reason: row.reason,
      removedByName: row.removedByName,
    }));
}

export function parseRemainingItemsJson(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as {
        name?: unknown;
        qty?: unknown;
        unitPrice?: unknown;
        lineTotal?: unknown;
      };
      if (typeof row.name !== "string") return [];
      return [
        {
          name: row.name,
          qty: Number(row.qty) || 0,
          unitPrice: Number(row.unitPrice) || 0,
          lineTotal: Number(row.lineTotal) || 0,
        },
      ];
    });
  } catch {
    return [];
  }
}
