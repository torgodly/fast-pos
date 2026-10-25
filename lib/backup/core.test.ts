import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKUP_DB_ENTRY,
  BACKUP_LOGO_ENTRY,
  BACKUP_MANIFEST_ENTRY,
  applyBackupLogo,
  createBackupArchive,
  createSafetySnapshot,
  inspectBackupDatabase,
  pruneBackups,
  readBackupFile,
  replaceDatabaseFile,
} from "./core";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fastpos-backup-test-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function createAppDatabase(filePath: string) {
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE venues (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE order_items (id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  sqlite.prepare("INSERT INTO venues (id, name) VALUES (?, ?)").run(
    "restaurant",
    "المطعم",
  );
  sqlite.prepare("INSERT INTO users (name) VALUES (?)").run("مدير");
  sqlite.prepare("INSERT INTO items (name) VALUES (?)").run("شاي");
  sqlite.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)").run(
    "brand_name",
    "Fast POS",
  );
  return sqlite;
}

describe("createBackupArchive", () => {
  it("snapshots WAL data, logo, manifest, and a dated file name", async () => {
    const sqlite = createAppDatabase(path.join(tempDir, "pos.db"));
    const logoPath = path.join(tempDir, "receipt-logo.png");
    const logo = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    fs.writeFileSync(logoPath, logo);

    const result = await createBackupArchive({
      sqlite,
      logoPath,
      now: new Date(2026, 9, 25, 14, 30),
    });
    sqlite.close();

    expect(result.fileName).toBe("fastpos-backup-2026-10-25-1430.fastpos");
    expect(result.manifest.formatVersion).toBe(1);
    expect(result.manifest.hasLogo).toBe(true);
    expect(result.manifest.counts).toEqual({
      venues: 1,
      users: 1,
      items: 1,
      orders: 0,
    });

    const zip = await JSZip.loadAsync(result.buffer);
    const snapshot = await zip.file(BACKUP_DB_ENTRY)!.async("nodebuffer");
    const snapshotPath = path.join(tempDir, "snapshot.db");
    fs.writeFileSync(snapshotPath, snapshot);
    const snapshotDb = new Database(snapshotPath, { readonly: true });
    const setting = snapshotDb
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get("brand_name") as { value: string };
    snapshotDb.close();
    expect(setting.value).toBe("Fast POS");

    expect(await zip.file(BACKUP_LOGO_ENTRY)!.async("nodebuffer")).toEqual(logo);
    const manifest = JSON.parse(
      await zip.file(BACKUP_MANIFEST_ENTRY)!.async("string"),
    );
    expect(manifest.counts.users).toBe(1);
  });
});

describe("readBackupFile", () => {
  it("reads the database, logo, and manifest from an archive", async () => {
    const sqlite = createAppDatabase(path.join(tempDir, "pos.db"));
    const logoPath = path.join(tempDir, "receipt-logo.png");
    const logo = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9]);
    fs.writeFileSync(logoPath, logo);
    const { buffer } = await createBackupArchive({ sqlite, logoPath });
    sqlite.close();

    const contents = await readBackupFile(buffer);

    expect(contents.source).toBe("archive");
    expect(contents.manifest?.counts.venues).toBe(1);
    expect(contents.logo).toEqual(logo);
    expect(contents.db.subarray(0, 16).toString("latin1")).toBe(
      "SQLite format 3\u0000",
    );
  });

  it("accepts a raw SQLite database file", async () => {
    const dbPath = path.join(tempDir, "manual.db");
    const sqlite = createAppDatabase(dbPath);
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
    sqlite.close();

    const contents = await readBackupFile(fs.readFileSync(dbPath));

    expect(contents.source).toBe("raw-db");
    expect(contents.manifest).toBeNull();
    expect(contents.logo).toBeNull();
    expect(contents.db.length).toBeGreaterThan(0);
  });

  it("rejects files that are neither a backup archive nor SQLite", async () => {
    await expect(readBackupFile(Buffer.from("hello world"))).rejects.toThrow(
      "صيغة الملف غير مدعومة",
    );
  });
});

describe("createSafetySnapshot", () => {
  it("writes a timestamped copy that includes WAL rows", async () => {
    const sqlite = createAppDatabase(path.join(tempDir, "pos.db"));
    const backupsDir = path.join(tempDir, "backups");

    const snapshotPath = await createSafetySnapshot({
      sqlite,
      backupsDir,
      now: new Date(2026, 9, 25, 16, 5, 7, 42),
    });
    sqlite.close();

    expect(path.basename(snapshotPath)).toBe(
      "pre-restore-20261025-160507-042.db",
    );
    const snapshotDb = new Database(snapshotPath, { readonly: true });
    const row = snapshotDb
      .prepare("SELECT COUNT(*) AS total FROM users")
      .get() as { total: number };
    snapshotDb.close();
    expect(row.total).toBe(1);
  });

  it("prunes old pre-restore snapshots and keeps the newest ones", async () => {
    const backupsDir = path.join(tempDir, "backups");
    fs.mkdirSync(backupsDir, { recursive: true });
    for (const name of [
      "pre-restore-20261025-100000-000.db",
      "pre-restore-20261025-110000-000.db",
      "pre-restore-20261025-120000-000.db",
      "pre-restore-20261025-130000-000.db",
    ]) {
      fs.writeFileSync(path.join(backupsDir, name), "x");
    }
    fs.writeFileSync(path.join(backupsDir, "unrelated.db"), "x");

    const removed = await pruneBackups(backupsDir, 2);

    expect(removed.map((file) => path.basename(file)).sort()).toEqual([
      "pre-restore-20261025-100000-000.db",
      "pre-restore-20261025-110000-000.db",
    ]);
    expect(fs.readdirSync(backupsDir).sort()).toEqual([
      "pre-restore-20261025-120000-000.db",
      "pre-restore-20261025-130000-000.db",
      "unrelated.db",
    ]);
  });
});

describe("applyBackupLogo", () => {
  it("restores the archived logo", () => {
    const logoPath = path.join(tempDir, "data", "receipt-logo.png");
    const logo = Buffer.from([0x89, 0x50, 0x4e, 0x47, 7]);

    const result = applyBackupLogo({ logoPath, logo, removeWhenMissing: true });

    expect(result).toBe("restored");
    expect(fs.readFileSync(logoPath)).toEqual(logo);
  });

  it("removes the custom logo when the archive has none", () => {
    const logoPath = path.join(tempDir, "receipt-logo.png");
    fs.writeFileSync(logoPath, "old");

    const result = applyBackupLogo({
      logoPath,
      logo: null,
      removeWhenMissing: true,
    });

    expect(result).toBe("removed");
    expect(fs.existsSync(logoPath)).toBe(false);
  });

  it("leaves the current logo alone for raw database restores", () => {
    const logoPath = path.join(tempDir, "receipt-logo.png");
    fs.writeFileSync(logoPath, "keep");

    const result = applyBackupLogo({
      logoPath,
      logo: null,
      removeWhenMissing: false,
    });

    expect(result).toBe("kept");
    expect(fs.readFileSync(logoPath, "utf8")).toBe("keep");
  });
});

describe("inspectBackupDatabase", () => {
  it("returns row counts for a valid Fast POS database", () => {
    const dbPath = path.join(tempDir, "valid.db");
    const sqlite = createAppDatabase(dbPath);
    sqlite.close();

    expect(inspectBackupDatabase(dbPath)).toEqual({
      venues: 1,
      users: 1,
      items: 1,
      orders: 0,
    });
  });

  it("rejects a database without the Fast POS tables", () => {
    const dbPath = path.join(tempDir, "empty.db");
    const sqlite = new Database(dbPath);
    sqlite.exec("CREATE TABLE venues (id TEXT PRIMARY KEY)");
    sqlite.close();

    expect(() => inspectBackupDatabase(dbPath)).toThrow(
      "قاعدة البيانات المرفوعة لا تحتوي على بيانات Fast POS",
    );
  });

  it("rejects a corrupted database file", () => {
    const dbPath = path.join(tempDir, "corrupt.db");
    fs.writeFileSync(
      dbPath,
      Buffer.concat([
        Buffer.from("SQLite format 3\u0000", "latin1"),
        Buffer.alloc(2048, 0x7f),
      ]),
    );

    expect(() => inspectBackupDatabase(dbPath)).toThrow(
      "قاعدة البيانات المرفوعة تالفة",
    );
  });
});

describe("replaceDatabaseFile", () => {
  function insertMarker(sqlite: Database.Database, value: string) {
    sqlite
      .prepare(
        `INSERT INTO app_settings (key, value) VALUES ('marker', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(value);
  }

  function readMarker(filePath: string) {
    const sqlite = new Database(filePath, { readonly: true });
    const row = sqlite
      .prepare("SELECT value FROM app_settings WHERE key = 'marker'")
      .get() as { value: string } | undefined;
    sqlite.close();
    return row?.value;
  }

  it("swaps in the replacement database and clears stale WAL files", async () => {
    const targetPath = path.join(tempDir, "pos.db");
    const replacementPath = path.join(tempDir, "replacement.db");
    const oldDb = createAppDatabase(targetPath);
    insertMarker(oldDb, "old");
    oldDb.close();
    const newDb = createAppDatabase(replacementPath);
    insertMarker(newDb, "new");
    newDb.close();

    fs.writeFileSync(`${targetPath}-wal`, "stale");
    fs.writeFileSync(`${targetPath}-shm`, "stale");

    const opened: string[] = [];
    let staleWalFound: boolean | null = null;
    const result = await replaceDatabaseFile({
      targetPath,
      replacementPath,
      reopen: () => {
        staleWalFound =
          fs.existsSync(`${targetPath}-wal`) ||
          fs.existsSync(`${targetPath}-shm`);
        opened.push(readMarker(targetPath)!);
      },
    });

    expect(result.rolledBack).toBe(false);
    expect(opened).toEqual(["new"]);
    expect(staleWalFound).toBe(false);
    expect(readMarker(targetPath)).toBe("new");
  });

  it("keeps the restored database when deleting the displaced file fails", async () => {
    const targetPath = path.join(tempDir, "pos.db");
    const replacementPath = path.join(tempDir, "replacement.db");
    const oldDb = createAppDatabase(targetPath);
    insertMarker(oldDb, "old");
    oldDb.close();
    const newDb = createAppDatabase(replacementPath);
    insertMarker(newDb, "new");
    newDb.close();

    const realRmSync = fs.rmSync.bind(fs);
    const rmSpy = vi.spyOn(fs, "rmSync").mockImplementation(((
      filePath: fs.PathLike,
      options?: fs.RmOptions,
    ) => {
      if (String(filePath).includes(".restore-old-")) {
        throw new Error("locked by antivirus");
      }
      return realRmSync(filePath, options);
    }) as typeof fs.rmSync);

    try {
      const result = await replaceDatabaseFile({
        targetPath,
        replacementPath,
        reopen: () => {
          readMarker(targetPath);
        },
      });

      expect(result.rolledBack).toBe(false);
      expect(readMarker(targetPath)).toBe("new");
    } finally {
      rmSpy.mockRestore();
    }
  });

  it("rolls back to the previous database when reopening fails", async () => {
    const targetPath = path.join(tempDir, "pos.db");
    const replacementPath = path.join(tempDir, "replacement.db");
    const oldDb = createAppDatabase(targetPath);
    insertMarker(oldDb, "old");
    oldDb.close();
    const newDb = createAppDatabase(replacementPath);
    insertMarker(newDb, "new");
    newDb.close();

    const opened: string[] = [];
    const result = await replaceDatabaseFile({
      targetPath,
      replacementPath,
      reopen: () => {
        const marker = readMarker(targetPath)!;
        opened.push(marker);
        if (marker === "new") {
          throw new Error("migration failed");
        }
      },
    });

    expect(result.rolledBack).toBe(true);
    expect(opened).toEqual(["new", "old"]);
    expect(readMarker(targetPath)).toBe("old");
  });
});
