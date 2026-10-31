// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  sqlite: null as import("better-sqlite3").Database | null,
  raw: vi.fn(),
  network: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({
    userId: 1,
    name: "مدير",
    role: "admin",
    venueId: null,
    mustChangePin: false,
  }),
}));
vi.mock("@/lib/print/windows-raw", () => ({
  printRawToWindowsPrinter: (...args: unknown[]) => holder.raw(...args),
}));
vi.mock("@/lib/print/network", () => ({
  printToPrinter: (...args: unknown[]) => holder.network(...args),
}));
vi.mock("@/lib/print/test-bytes", () => ({
  buildTestPrintBytes: async () => new Uint8Array([1, 2, 3]),
}));
vi.mock("@/lib/db", async () => {
  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const schema = await import("@/lib/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      host TEXT NOT NULL DEFAULT '',
      port INTEGER NOT NULL DEFAULT 9100,
      connection_type TEXT NOT NULL DEFAULT 'network',
      auto_print INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE cashier_stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL,
      name TEXT NOT NULL,
      printer_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1
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
  return { db: drizzle(sqlite, { schema }), getSqlite: () => sqlite };
});

import { testPrinter, upsertPrinter } from "@/app/actions/admin";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

function printerRow() {
  return holder.sqlite!
    .prepare("SELECT * FROM printers ORDER BY id LIMIT 1")
    .get() as Record<string, unknown>;
}

beforeEach(() => {
  holder.sqlite!.exec(
    "DELETE FROM audit_events; DELETE FROM cashier_stations; DELETE FROM printers;",
  );
  holder.raw.mockReset();
  holder.network.mockReset();
  holder.raw.mockResolvedValue(undefined);
  holder.network.mockResolvedValue(undefined);
});

describe("upsertPrinter connection types", () => {
  it("accepts a local system printer for the kitchen", async () => {
    const result = await upsertPrinter(
      formData({
        name: "مطبخ مباشر",
        role: "kitchen",
        connectionType: "local",
        host: "XP-80C",
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(printerRow()).toMatchObject({
      venue_id: null,
      host: "XP-80C",
      port: 0,
      connection_type: "local",
      auto_print: 1,
    });
  });

  it("rejects a local printer without a specific Windows queue", async () => {
    const result = await upsertPrinter(
      formData({
        name: "كاشير",
        role: "checkout",
        venueId: "restaurant",
        connectionType: "local",
        host: "default",
      }),
    );

    expect(result).toEqual({
      error: expect.stringContaining("طابعة Windows محددة"),
    });
    expect(
      holder.sqlite!.prepare("SELECT COUNT(*) AS count FROM printers").get(),
    ).toEqual({ count: 0 });
  });

  it("rejects an invalid network port", async () => {
    const result = await upsertPrinter(
      formData({
        name: "مطبخ",
        role: "kitchen",
        connectionType: "network",
        host: "192.168.1.50",
        port: "70000",
      }),
    );

    expect(result).toEqual({ error: "منفذ الطابعة غير صالح" });
  });

  it("links a local checkout printer to its cashier station", async () => {
    const result = await upsertPrinter(
      formData({
        name: "كاشير المطعم",
        role: "checkout",
        venueId: "restaurant",
        connectionType: "local",
        host: "XP-80C",
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(
      holder.sqlite!
        .prepare("SELECT venue_id, name, active FROM cashier_stations")
        .get(),
    ).toEqual({ venue_id: "restaurant", name: "كاشير المطعم", active: 1 });
  });
});

describe("testPrinter", () => {
  it("prints a local test page through the Windows worker", async () => {
    holder.sqlite!
      .prepare(
        `INSERT INTO printers
          (id, venue_id, name, role, host, port, connection_type, auto_print, active)
         VALUES (1, 'restaurant', 'XP-80C', 'checkout', 'XP-80C', 0, 'local', 1, 1)`,
      )
      .run();

    const result = await testPrinter(1);

    expect(result).toEqual({
      ok: true,
      message: expect.stringContaining("XP-80C"),
    });
    expect(holder.raw).toHaveBeenCalledWith("XP-80C", expect.any(Uint8Array));
    expect(holder.network).not.toHaveBeenCalled();
  });

  it("prints a network test page over TCP and audits the target", async () => {
    holder.sqlite!
      .prepare(
        `INSERT INTO printers
          (id, venue_id, name, role, host, port, connection_type, auto_print, active)
         VALUES (1, NULL, 'مطبخ الشبكة', 'kitchen', '192.168.1.50', 9100, 'network', 0, 1)`,
      )
      .run();

    const result = await testPrinter(1);

    expect(result).toEqual({
      ok: true,
      message: expect.stringContaining("مطبخ الشبكة"),
    });
    expect(holder.network).toHaveBeenCalledWith({
      host: "192.168.1.50",
      port: 9100,
      data: expect.any(Uint8Array),
    });
    expect(holder.raw).not.toHaveBeenCalled();

    const audit = holder.sqlite!
      .prepare("SELECT kind, printer_name, success, detail FROM audit_events")
      .get();
    expect(audit).toMatchObject({
      kind: "test",
      printer_name: "مطبخ الشبكة",
      success: 1,
      detail: "اختبار مطبخ الشبكة (192.168.1.50)",
    });
  });

  it("returns the worker error for a local printer", async () => {
    holder.sqlite!
      .prepare(
        `INSERT INTO printers
          (id, venue_id, name, role, host, port, connection_type, auto_print, active)
         VALUES (1, 'restaurant', 'XP-80C', 'checkout', 'XP-80C', 0, 'local', 1, 1)`,
      )
      .run();
    holder.raw.mockRejectedValueOnce(
      new Error("Cannot open printer: XP-80C"),
    );

    expect(await testPrinter(1)).toEqual({
      error: "Cannot open printer: XP-80C",
    });
  });
});
