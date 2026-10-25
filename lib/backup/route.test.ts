// @vitest-environment node
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  BACKUP_DB_ENTRY,
  createBackupArchive,
} from "./core";

const sessionState = vi.hoisted(() => ({
  value: null as null | { userId: number; name: string; role: string },
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => sessionState.value),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/print/logo", () => ({
  clearReceiptLogoCache: vi.fn(),
}));

let tempDir: string;
let previousCwd: string;
let dbModule: typeof import("@/lib/db");
let restoreRoute: typeof import("@/app/api/admin/backup/restore/route");
let downloadRoute: typeof import("@/app/api/admin/backup/route");
let adminId: number;

function setMarker(value: string) {
  dbModule
    .getSqlite()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES ('restore_marker', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(value);
}

function readMarker() {
  const row = dbModule
    .getSqlite()
    .prepare("SELECT value FROM app_settings WHERE key = 'restore_marker'")
    .get() as { value: string } | undefined;
  return row?.value;
}

function markerInFile(filePath: string) {
  const sqlite = new Database(filePath, { readonly: true });
  const row = sqlite
    .prepare("SELECT value FROM app_settings WHERE key = 'restore_marker'")
    .get() as { value: string } | undefined;
  sqlite.close();
  return row?.value;
}

async function buildArchive(marker: string) {
  setMarker(marker);
  return createBackupArchive({ sqlite: dbModule.getSqlite() });
}

function restoreRequest(archive: Buffer, password: string) {
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array(archive)], "backup.fastpos", {
      type: "application/zip",
    }),
  );
  form.set("password", password);
  return new Request("http://localhost/api/admin/backup/restore", {
    method: "POST",
    headers: { origin: "http://localhost", host: "localhost" },
    body: form,
  });
}

beforeAll(async () => {
  previousCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fastpos-restore-route-"));
  process.chdir(tempDir);
  delete (globalThis as Record<string, unknown>).__posDb;
  delete (globalThis as Record<string, unknown>).__posSqlite;
  vi.resetModules();

  dbModule = await import("@/lib/db");
  const admin = dbModule
    .getSqlite()
    .prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
    .get() as { id: number };
  adminId = admin.id;
  dbModule
    .getSqlite()
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(bcrypt.hashSync("secret123", 4), adminId);

  restoreRoute = await import("@/app/api/admin/backup/restore/route");
  downloadRoute = await import("@/app/api/admin/backup/route");
});

afterEach(() => {
  sessionState.value = null;
  fs.rmSync(path.join(tempDir, "data", "backups"), {
    recursive: true,
    force: true,
  });
});

afterAll(() => {
  dbModule?.closeDatabase();
  delete (globalThis as Record<string, unknown>).__posDb;
  delete (globalThis as Record<string, unknown>).__posSqlite;
  process.chdir(previousCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("backup download route", () => {
  it("requires an admin session", async () => {
    const response = await downloadRoute.GET();
    expect(response.status).toBe(401);
  });

  it("downloads an archive containing the live database", async () => {
    sessionState.value = { userId: adminId, name: "Admin", role: "admin" };

    const response = await downloadRoute.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      ".fastpos",
    );
    const zip = await JSZip.loadAsync(
      Buffer.from(await response.arrayBuffer()),
    );
    expect(zip.file(BACKUP_DB_ENTRY)).not.toBeNull();
  });
});

describe("backup restore route", () => {
  it("requires an admin session", async () => {
    const archive = await buildArchive("current");
    const response = await restoreRoute.POST(
      restoreRequest(archive.buffer, "secret123"),
    );
    expect(response.status).toBe(401);
  });

  it("rejects a wrong admin password without replacing the database", async () => {
    sessionState.value = { userId: adminId, name: "Admin", role: "admin" };
    const archive = await buildArchive("from-archive");
    setMarker("current");

    const response = await restoreRoute.POST(
      restoreRequest(archive.buffer, "wrong-password"),
    );

    expect(response.status).toBe(403);
    expect(readMarker()).toBe("current");
    expect(fs.existsSync(path.join(tempDir, "data", "backups"))).toBe(false);
  });

  it("restores the archive, keeps a safety snapshot, and warns about open shifts", async () => {
    sessionState.value = { userId: adminId, name: "Admin", role: "admin" };
    const archive = await buildArchive("from-archive");
    setMarker("current");
    dbModule
      .getSqlite()
      .prepare(
        `INSERT INTO shifts (venue_id, work_date, shift_number, status, opened_at)
         VALUES ('restaurant', '2026-10-25', 1, 'open', datetime('now'))`,
      )
      .run();

    const response = await restoreRoute.POST(
      restoreRequest(archive.buffer, "secret123"),
    );
    const body = (await response.json()) as {
      ok: boolean;
      replacedOpenShifts: number;
      safetyBackup: string;
      counts: { users: number };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.replacedOpenShifts).toBe(1);
    expect(body.counts.users).toBeGreaterThan(0);
    expect(readMarker()).toBe("from-archive");

    const safetyPath = path.join(tempDir, "data", "backups", body.safetyBackup);
    expect(fs.existsSync(safetyPath)).toBe(true);
    expect(markerInFile(safetyPath)).toBe("current");
  });

  it("rejects a corrupt upload and keeps serving the current database", async () => {
    sessionState.value = { userId: adminId, name: "Admin", role: "admin" };
    setMarker("current");

    const response = await restoreRoute.POST(
      restoreRequest(Buffer.from("not a backup"), "secret123"),
    );

    expect(response.status).toBe(400);
    expect(readMarker()).toBe("current");
  });
});
