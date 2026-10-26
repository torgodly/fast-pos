// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  sqlite: null as import("better-sqlite3").Database | null,
  printed: [] as Array<{ host: string; port: number }>,
  tickets: [] as Array<{ lines: Array<{ name: string; qty: number }> }>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({
    userId: 1,
    name: "سفرادجي",
    role: "waiter",
    venueId: "restaurant",
    mustChangePin: false,
  }),
}));
vi.mock("@/app/actions/station", () => ({
  getCashierStationContext: async () => null,
}));
vi.mock("@/lib/settings", () => ({
  getBrandDetails: () => ({ name: "Fast POS", phone: "", address: "" }),
  getReceiptFooterMessage: () => "",
}));
vi.mock("@/lib/print/logo", () => ({
  getReceiptLogoPrintDataUrl: () => null,
}));
vi.mock("@/lib/print/checkout-bytes", () => ({
  buildCheckoutPrintBytes: async () => new Uint8Array(),
}));
vi.mock("@/lib/print/windows-raw", () => ({
  printRawToWindowsPrinter: async () => {},
}));
vi.mock("@/lib/print/network", () => ({
  printToPrinter: async (options: { host: string; port: number }) => {
    holder.printed.push({ host: options.host, port: options.port });
  },
}));
vi.mock("@/lib/print/escpos", () => ({
  buildKitchenEscPos: (options: {
    lines: Array<{ name: string; qty: number }>;
  }) => {
    holder.tickets.push({ lines: options.lines });
    return new Uint8Array();
  },
  chunkKitchenLines: (lines: unknown[]) => [lines],
}));
vi.mock("@/lib/inventory/service", () => ({
  consumeForPaidOrder: async () => ({ skipped: true, warnings: [], consumed: [] }),
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
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      kitchen_printer_id INTEGER,
      restaurant_kitchen_printer_id INTEGER,
      cafe_kitchen_printer_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      kitchen_printer_id INTEGER,
      unit_id INTEGER,
      track_stock INTEGER NOT NULL DEFAULT 0,
      stock_base INTEGER NOT NULL DEFAULT 0,
      low_stock_base INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL,
      table_id INTEGER,
      customer_id INTEGER,
      waiter_id INTEGER,
      cashier_id INTEGER,
      shift_id INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      payment_method TEXT,
      held_at TEXT,
      held_by INTEGER,
      total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT
    );
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_id INTEGER,
      item_name TEXT NOT NULL,
      category_name TEXT,
      unit_price REAL NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      line_total REAL NOT NULL,
      kitchen_sent_qty INTEGER NOT NULL DEFAULT 0,
      note TEXT
    );
    CREATE TABLE audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER,
      user_name TEXT NOT NULL,
      role TEXT NOT NULL,
      venue_id TEXT,
      kind TEXT NOT NULL,
      order_id INTEGER,
      printer_name TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      detail TEXT NOT NULL
    );
  `);
  holder.sqlite = sqlite;
  return {
    db: drizzle(sqlite, { schema }),
    getSqlite: () => sqlite,
  };
});

import { confirmKitchenOrder } from "@/app/actions/orders";

function sqlite() {
  return holder.sqlite!;
}

function reset() {
  sqlite().exec(`
    DELETE FROM audit_events;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM items;
    DELETE FROM categories;
    DELETE FROM printers;
    INSERT INTO printers (id, name, role, host, port, active)
    VALUES (3, 'مطبخ المطعم', 'kitchen', '192.168.1.56', 9100, 1);
    INSERT INTO categories
      (id, name, kitchen_printer_id, restaurant_kitchen_printer_id, cafe_kitchen_printer_id)
    VALUES (1, 'بيتزا', NULL, 3, NULL),
           (2, 'مشروبات باردة', NULL, NULL, NULL);
    INSERT INTO items (id, category_id, name, price)
    VALUES (1, 1, 'بيتزا مارغريتا', 20),
           (2, 2, 'شاي مثلج', 7);
    INSERT INTO orders (id, venue_id, waiter_id, status, total)
    VALUES (1, 'restaurant', 1, 'open', 27);
    INSERT INTO order_items
      (id, order_id, item_id, item_name, category_name, unit_price, qty, line_total, kitchen_sent_qty)
    VALUES (1, 1, 1, 'بيتزا مارغريتا', 'بيتزا', 20, 1, 20, 0),
           (2, 1, 2, 'شاي مثلج', 'مشروبات باردة', 7, 1, 7, 0);
  `);
  holder.printed.length = 0;
  holder.tickets.length = 0;
}

beforeEach(reset);

describe("confirmKitchenOrder with unassigned categories", () => {
  it("prints assigned lines and skips lines from categories with no printer", async () => {
    const result = await confirmKitchenOrder(1);

    if ("error" in result) throw new Error(result.error);
    expect(result.printedTo.map((p) => p.printerName)).toEqual(["مطبخ المطعم"]);
    expect(result.message).toContain("بدون طابعة (لم تُطبع): شاي مثلج");
    expect(result.message).not.toContain("بيتزا مارغريتا — بدون");

    const ticketLines = holder.tickets.flatMap((t) => t.lines.map((l) => l.name));
    expect(ticketLines).toEqual(["بيتزا مارغريتا"]);
    expect(holder.printed).toEqual([{ host: "192.168.1.56", port: 9100 }]);

    const sent = sqlite()
      .prepare(`SELECT id, kitchen_sent_qty FROM order_items ORDER BY id`)
      .all() as Array<{ id: number; kitchen_sent_qty: number }>;
    expect(sent).toEqual([
      { id: 1, kitchen_sent_qty: 1 },
      { id: 2, kitchen_sent_qty: 0 },
    ]);

    const audit = sqlite()
      .prepare(`SELECT success, detail FROM audit_events WHERE order_id = 1`)
      .all() as Array<{ success: number; detail: string }>;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ success: 1 });
    expect(audit[0]!.detail).toContain("شاي مثلج");
  });

  it("reports an error and prints nothing when every pending line is unassigned", async () => {
    sqlite().exec(`DELETE FROM order_items WHERE id = 1`);

    const result = await confirmKitchenOrder(1);

    expect(result).toEqual({
      error: "لا توجد طابعة مربوطة لـ: شاي مثلج — لن تُطبع في المطبخ",
    });
    expect(holder.printed).toHaveLength(0);
    expect(holder.tickets).toHaveLength(0);

    const sentQty = sqlite()
      .prepare(`SELECT kitchen_sent_qty FROM order_items WHERE id = 2`)
      .get() as { kitchen_sent_qty: number };
    expect(sentQty.kitchen_sent_qty).toBe(0);

    const audit = sqlite()
      .prepare(`SELECT success, detail FROM audit_events WHERE order_id = 1`)
      .all() as Array<{ success: number; detail: string }>;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ success: 0 });
    expect(audit[0]!.detail).toContain("لا توجد طابعة مربوطة");
  });
});
