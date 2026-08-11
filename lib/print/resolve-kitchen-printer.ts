import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
import { kitchenPrinterRolesFilter } from "@/lib/printers";
import { DISPLAY_PRINTER_GROUPS } from "@/lib/reports/groups";
import type { VenueId } from "@/lib/types";

type PrinterRow = typeof printers.$inferSelect;

function pickByKind(
  rows: PrinterRow[],
  kind: "kitchen" | "display",
): PrinterRow | null {
  if (rows.length === 0) return null;
  if (kind === "display") {
    const display = rows.find(
      (p) =>
        p.name.includes("دسبلي") ||
        p.name.includes("ديسبلي") ||
        p.name.toLowerCase().includes("display") ||
        p.name.includes("مشروبات"),
    );
    if (display) return display;
    return rows.length > 1 ? rows[rows.length - 1]! : rows[0]!;
  }
  const kitchen = rows.find(
    (p) => p.name.includes("مطبخ") && !p.name.includes("مشروبات"),
  );
  return kitchen ?? rows[0]!;
}

/** Resolve kitchen/display printer for a menu category at a selling venue. */
export function resolveKitchenPrinterForVenue(options: {
  venueId: VenueId;
  categoryName: string | null | undefined;
  categoryPrinterId: number | null | undefined;
  restaurantPrinterId?: number | null;
  cafePrinterId?: number | null;
  itemPrinterId: number | null | undefined;
}): PrinterRow | null {
  const {
    venueId,
    categoryName,
    categoryPrinterId,
    restaurantPrinterId,
    cafePrinterId,
    itemPrinterId,
  } = options;
  const venueLinked =
    venueId === "cafe" ? cafePrinterId : restaurantPrinterId;
  const managed =
    restaurantPrinterId != null || cafePrinterId != null;
  const candidateId = managed
    ? (venueLinked ?? null)
    : (venueLinked ?? categoryPrinterId ?? itemPrinterId ?? null);

  if (candidateId) {
    const linked = db
      .select()
      .from(printers)
      .where(
        and(
          eq(printers.id, candidateId),
          eq(printers.venueId, venueId),
          eq(printers.active, true),
          kitchenPrinterRolesFilter,
        ),
      )
      .get();
    if (linked) return linked;
  }

  // Once a shared category has per-venue printers, do not auto-pick the other branch.
  if (managed) return null;

  const venuePrinters = db
    .select()
    .from(printers)
    .where(
      and(
        eq(printers.venueId, venueId),
        eq(printers.active, true),
        kitchenPrinterRolesFilter,
      ),
    )
    .all();

  const kind =
    categoryName && DISPLAY_PRINTER_GROUPS.has(categoryName)
      ? "display"
      : "kitchen";

  return pickByKind(venuePrinters, kind);
}
