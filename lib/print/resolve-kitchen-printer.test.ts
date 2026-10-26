// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  sqlite: null as import("better-sqlite3").Database | null,
}));

vi.mock("@/lib/db", async () => {
  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const schema = await import("@/lib/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 9100,
      connection_type TEXT NOT NULL DEFAULT 'network',
      auto_print INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
  `);
  holder.sqlite = sqlite;
  return { db: drizzle(sqlite, { schema }) };
});

import { resolveKitchenPrinterForVenue } from "./resolve-kitchen-printer";

function addPrinter(row: {
  id: number;
  name: string;
  role?: "kitchen" | "checkout" | "both";
  active?: boolean;
}) {
  holder.sqlite!
    .prepare(
      `INSERT INTO printers
         (id, venue_id, name, role, host, port, connection_type, auto_print, active)
       VALUES (?, NULL, ?, ?, ?, 9100, 'network', 0, ?)`,
    )
    .run(row.id, row.name, row.role ?? "kitchen", `10.0.0.${row.id}`, row.active === false ? 0 : 1);
}

function resolve(options: {
  venueId: "restaurant" | "cafe";
  categoryPrinterId?: number | null;
  restaurantPrinterId?: number | null;
  cafePrinterId?: number | null;
  itemPrinterId?: number | null;
}) {
  return resolveKitchenPrinterForVenue({
    venueId: options.venueId,
    categoryPrinterId: options.categoryPrinterId ?? null,
    restaurantPrinterId: options.restaurantPrinterId ?? null,
    cafePrinterId: options.cafePrinterId ?? null,
    itemPrinterId: options.itemPrinterId ?? null,
  });
}

beforeEach(() => {
  holder.sqlite!.exec(`DELETE FROM printers`);
});

describe("resolveKitchenPrinterForVenue", () => {
  it("returns null when the category has no printer (line must be skipped)", () => {
    addPrinter({ id: 1, name: "Main Kitchen" });

    expect(resolve({ venueId: "restaurant" })).toBeNull();
  });

  it("returns null when only the other venue has a printer", () => {
    addPrinter({ id: 2, name: "مطبخ المطعم" });

    expect(
      resolve({ venueId: "cafe", restaurantPrinterId: 2 }),
    ).toBeNull();
  });

  it("returns null when the linked printer is inactive", () => {
    addPrinter({ id: 2, name: "Old Kitchen", active: false });

    expect(resolve({ venueId: "restaurant", restaurantPrinterId: 2 })).toBeNull();
  });

  it("returns null when the linked printer no longer exists", () => {
    expect(resolve({ venueId: "restaurant", restaurantPrinterId: 99 })).toBeNull();
  });

  it("returns null for a checkout-only printer", () => {
    addPrinter({ id: 1, name: "Cashier", role: "checkout" });

    expect(resolve({ venueId: "restaurant", restaurantPrinterId: 1 })).toBeNull();
  });

  it("uses the active venue-linked printer", () => {
    addPrinter({ id: 2, name: "مطبخ المطعم" });

    expect(resolve({ venueId: "restaurant", restaurantPrinterId: 2 })?.id).toBe(
      2,
    );
  });

  it("uses an active category printer when the venue has none", () => {
    addPrinter({ id: 3, name: "مطبخ البيتزا" });

    expect(resolve({ venueId: "restaurant", categoryPrinterId: 3 })?.id).toBe(3);
  });

  it("uses the item printer when neither venue nor category has one", () => {
    addPrinter({ id: 4, name: "Grill" });

    expect(resolve({ venueId: "restaurant", itemPrinterId: 4 })?.id).toBe(4);
  });

  it("does not auto-route to an unassigned display printer", () => {
    addPrinter({ id: 2, name: "شاشة المشروبات" });

    expect(resolve({ venueId: "restaurant" })).toBeNull();
  });
});
