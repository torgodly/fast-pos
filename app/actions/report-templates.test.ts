// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  sqlite: null as import("better-sqlite3").Database | null,
  raw: vi.fn(),
  network: vi.fn(),
  role: "admin" as "admin" | "cashier",
  settings: new Map<string, string>(),
  samples: [] as { document: string; template: unknown }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({
    userId: 1,
    name: "مدير",
    role: holder.role,
    venueId: null,
    mustChangePin: false,
  }),
}));
vi.mock("@/lib/settings", () => ({
  getSettingValue: (key: string) => holder.settings.get(key) ?? null,
  setSettingValue: (key: string, value: string) => {
    holder.settings.set(key, value);
  },
  deleteSettingValue: (key: string) => {
    holder.settings.delete(key);
  },
}));
vi.mock("@/lib/print/windows-raw", () => ({
  printRawToWindowsPrinter: (...args: unknown[]) => holder.raw(...args),
}));
vi.mock("@/lib/print/network", () => ({
  printToPrinter: (...args: unknown[]) => holder.network(...args),
}));
vi.mock("@/lib/print/templates/build", () => ({
  buildSampleEscPos: async (document: string, template: unknown) => {
    holder.samples.push({ document, template });
    return new Uint8Array([9, 9, 9]);
  },
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
      host TEXT NOT NULL DEFAULT '',
      port INTEGER NOT NULL DEFAULT 9100,
      connection_type TEXT NOT NULL DEFAULT 'network',
      auto_print INTEGER NOT NULL DEFAULT 0,
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

import {
  resetReportTemplate,
  saveReportTemplate,
  testPrintReportTemplate,
} from "@/app/actions/report-templates";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";

function validJson() {
  return JSON.stringify(DEFAULT_REPORT_TEMPLATES.receipt);
}

function seedPrinter(input: {
  name: string;
  connectionType: "local" | "network";
  host: string;
  port?: number;
  active?: boolean;
}) {
  const info = holder.sqlite!
    .prepare(
      `INSERT INTO printers
         (venue_id, name, role, host, port, connection_type, auto_print, active)
       VALUES (NULL, ?, 'checkout', ?, ?, ?, 0, ?)`,
    )
    .run(
      input.name,
      input.host,
      input.port ?? 9100,
      input.connectionType,
      input.active === false ? 0 : 1,
    );
  return Number(info.lastInsertRowid);
}

function latestAudit() {
  return holder.sqlite!
    .prepare(
      "SELECT kind, printer_name, success, detail FROM audit_events ORDER BY id DESC LIMIT 1",
    )
    .get() as Record<string, unknown> | undefined;
}

beforeEach(() => {
  holder.role = "admin";
  holder.settings.clear();
  holder.sqlite!.exec("DELETE FROM audit_events; DELETE FROM printers;");
  holder.raw.mockReset();
  holder.network.mockReset();
  holder.raw.mockResolvedValue(undefined);
  holder.network.mockResolvedValue(undefined);
  holder.samples.length = 0;
});

describe("report template actions", () => {
  it("rejects non-admin users", async () => {
    holder.role = "cashier";
    await expect(saveReportTemplate("receipt", validJson())).rejects.toThrow(
      "غير مصرح",
    );
    await expect(resetReportTemplate("receipt")).rejects.toThrow("غير مصرح");
    await expect(
      testPrintReportTemplate("receipt", validJson(), 1),
    ).rejects.toThrow("غير مصرح");
  });

  it("rejects an unknown document", async () => {
    expect(await saveReportTemplate("invoice", validJson())).toEqual({
      error: "نوع التقرير غير معروف",
    });
  });

  it("does not store invalid JSON", async () => {
    expect(await saveReportTemplate("receipt", "{")).toEqual({
      error: "ملف التصميم ليس JSON صالحاً",
    });
    expect(holder.settings.size).toBe(0);
  });

  it("saves a valid template and resets it", async () => {
    const template = JSON.parse(validJson()) as {
      labels: { orderNo: string };
    };
    template.labels.orderNo = "طلب";

    expect(
      await saveReportTemplate("receipt", JSON.stringify(template)),
    ).toEqual({ ok: true });
    expect(holder.settings.has("report_template.receipt")).toBe(true);

    expect(latestAudit()).toMatchObject({
      kind: "settings",
      detail: "حفظ تصميم إيصال الدفع",
    });

    expect(await resetReportTemplate("receipt")).toEqual({ ok: true });
    expect(holder.settings.has("report_template.receipt")).toBe(false);
    expect(latestAudit()).toMatchObject({
      kind: "settings",
      detail: "استعادة التصميم الافتراضي لإيصال الدفع",
    });
  });

  it("test prints to a local Windows printer using the unsaved template", async () => {
    const printerId = seedPrinter({
      name: "كاشير",
      connectionType: "local",
      host: "XP-80C",
    });
    const template = JSON.parse(validJson()) as {
      labels: { orderNo: string };
    };
    template.labels.orderNo = "طلب";
    holder.settings.set(
      "report_template.receipt",
      JSON.stringify({
        ...template,
        labels: { ...template.labels, orderNo: "محفوظ" },
      }),
    );

    expect(
      await testPrintReportTemplate("receipt", JSON.stringify(template), printerId),
    ).toEqual({
      ok: true,
      message: "تم إرسال معاينة التصميم إلى كاشير",
    });
    expect(holder.raw).toHaveBeenCalledWith(
      "XP-80C",
      new Uint8Array([9, 9, 9]),
    );
    expect(holder.network).not.toHaveBeenCalled();
    expect(holder.samples).toHaveLength(1);
    expect(holder.samples[0]!.document).toBe("receipt");
    expect(
      (holder.samples[0]!.template as { labels: { orderNo: string } }).labels
        .orderNo,
    ).toBe("طلب");
    expect(latestAudit()).toMatchObject({
      kind: "test",
      printer_name: "كاشير",
      success: 1,
      detail: "معاينة إيصال الدفع على كاشير",
    });
  });

  it("test prints to a network printer", async () => {
    const printerId = seedPrinter({
      name: "شبكة",
      connectionType: "network",
      host: "10.0.0.9",
      port: 9200,
    });

    expect(
      await testPrintReportTemplate("receipt", validJson(), printerId),
    ).toMatchObject({ ok: true });
    expect(holder.network).toHaveBeenCalledWith({
      host: "10.0.0.9",
      port: 9200,
      data: new Uint8Array([9, 9, 9]),
    });
    expect(holder.raw).not.toHaveBeenCalled();
  });

  it("refuses invalid templates and inactive or missing printers", async () => {
    const inactive = seedPrinter({
      name: "معطلة",
      connectionType: "local",
      host: "XP-80C",
      active: false,
    });

    expect(
      await testPrintReportTemplate("receipt", "{", inactive),
    ).toEqual({ error: "ملف التصميم ليس JSON صالحاً" });
    expect(
      await testPrintReportTemplate("receipt", validJson(), inactive),
    ).toEqual({ error: "الطابعة غير موجودة أو معطّلة" });
    expect(
      await testPrintReportTemplate("receipt", validJson(), 999),
    ).toEqual({ error: "الطابعة غير موجودة أو معطّلة" });
    expect(holder.raw).not.toHaveBeenCalled();
    expect(holder.network).not.toHaveBeenCalled();
  });
});
