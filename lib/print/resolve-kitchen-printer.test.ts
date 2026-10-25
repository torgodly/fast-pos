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
  categoryName?: string;
  categoryPrinterId?: number | null;
  restaurantPrinterId?: number | null;
  cafePrinterId?: number | null;
  itemPrinterId?: number | null;
}) {
  return resolveKitchenPrinterForVenue({
    venueId: options.venueId,
    categoryName: options.categoryName ?? "بيتزا",
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
  it("falls back to the main kitchen printer when the category has none", () => {
    addPrinter({ id: 1, name: "Main Kitchen" });

    expect(resolve({ venueId: "restaurant" })?.id).toBe(1);
  });

  it("keeps printing when only the other venue has a category printer", () => {
    addPrinter({ id: 1, name: "Main Kitchen" });
    addPrinter({ id: 2, name: "مطبخ المطعم" });

    const printer = resolve({
      venueId: "cafe",
      restaurantPrinterId: 2,
    });

    expect(printer?.id).toBe(1);
  });

  it("falls back when the linked printer is inactive", () => {
    addPrinter({ id: 1, name: "Main Kitchen" });
    addPrinter({ id: 2, name: "Old Kitchen", active: false });

    expect(resolve({ venueId: "restaurant", restaurantPrinterId: 2 })?.id).toBe(
      1,
    );
  });

  it("ignores a removed linked printer", () => {
    addPrinter({ id: 1, name: "Main Kitchen" });

    expect(resolve({ venueId: "restaurant", restaurantPrinterId: 99 })?.id).toBe(
      1,
    );
  });

  it("uses the venue-linked printer when it is active", () => {
    addPrinter({ id: 1, name: "Main Kitchen" });
    addPrinter({ id: 2, name: "مطبخ المطعم" });

    expect(resolve({ venueId: "restaurant", restaurantPrinterId: 2 })?.id).toBe(
      2,
    );
  });

  it("routes display groups to a display printer", () => {
    addPrinter({ id: 1, name: "Main Kitchen" });
    addPrinter({ id: 2, name: "شاشة المشروبات" });

    expect(
      resolve({ venueId: "restaurant", categoryName: "مشروبات باردة" })?.id,
    ).toBe(2);
  });

  it("never sends a venue to the other venue's dedicated printer", () => {
    addPrinter({ id: 2, name: "مطبخ المطعم" });

    expect(
      resolve({ venueId: "cafe", restaurantPrinterId: 2 }),
    ).toBeNull();
  });

  it("returns null when no active kitchen printer exists", () => {
    addPrinter({ id: 1, name: "Cashier", role: "checkout" });

    expect(resolve({ venueId: "restaurant" })).toBeNull();
  });
});
