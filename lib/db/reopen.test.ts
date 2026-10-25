import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string;
let previousCwd: string;
let closeDatabase: (() => void) | null = null;

beforeEach(() => {
  previousCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fastpos-db-reopen-"));
  process.chdir(tempDir);
  delete (globalThis as Record<string, unknown>).__posDb;
  delete (globalThis as Record<string, unknown>).__posSqlite;
  vi.resetModules();
});

afterEach(() => {
  try {
    closeDatabase?.();
  } catch {
    // ignore
  }
  closeDatabase = null;
  delete (globalThis as Record<string, unknown>).__posDb;
  delete (globalThis as Record<string, unknown>).__posSqlite;
  process.chdir(previousCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("database reopen", () => {
  it("serves the replaced database through getSqlite and the db proxy", async () => {
    const mod = await import("./index");
    closeDatabase = mod.closeDatabase;

    mod
      .getSqlite()
      .prepare(
        `INSERT INTO app_settings (key, value) VALUES ('reopen_marker', 'old')`,
      )
      .run();

    mod.closeDatabase();

    const dbPath = path.join(tempDir, "data", "pos.db");
    const raw = new Database(dbPath);
    raw
      .prepare(`UPDATE app_settings SET value = 'new' WHERE key = 'reopen_marker'`)
      .run();
    raw.close();

    const viaSqlite = mod
      .getSqlite()
      .prepare(`SELECT value FROM app_settings WHERE key = 'reopen_marker'`)
      .get() as { value: string };
    expect(viaSqlite.value).toBe("new");

    const viaDrizzle = mod.db.get(
      sql`SELECT value FROM app_settings WHERE key = 'reopen_marker'`,
    ) as { value: string };
    expect(viaDrizzle.value).toBe("new");
  });
});
