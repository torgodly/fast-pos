import Database from "better-sqlite3";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_DB_ENTRY = "pos.db";
export const BACKUP_LOGO_ENTRY = "receipt-logo.png";
export const BACKUP_MANIFEST_ENTRY = "manifest.json";
export const BACKUP_FILE_EXTENSION = "fastpos";

export type BackupCounts = {
  venues: number;
  users: number;
  items: number;
  orders: number;
};

export type BackupManifest = {
  app: "FastPOS";
  formatVersion: number;
  createdAt: string;
  hasLogo: boolean;
  counts: BackupCounts;
};

const COUNTED_TABLES = ["venues", "users", "items", "orders"] as const;

const SQLITE_HEADER = "SQLite format 3\u0000";

const REQUIRED_TABLES = [
  "venues",
  "users",
  "items",
  "orders",
  "app_settings",
] as const;

export type ParsedBackup = {
  db: Buffer;
  logo: Buffer | null;
  manifest: BackupManifest | null;
  source: "archive" | "raw-db";
};

function isSqliteFile(buffer: Buffer) {
  return (
    buffer.length >= 16 &&
    buffer.subarray(0, 16).toString("latin1") === SQLITE_HEADER
  );
}

function isZipFile(buffer: Buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

export async function readBackupFile(buffer: Buffer): Promise<ParsedBackup> {
  if (isSqliteFile(buffer)) {
    return { db: buffer, logo: null, manifest: null, source: "raw-db" };
  }
  if (!isZipFile(buffer)) {
    throw new Error("صيغة الملف غير مدعومة — اختر نسخة .fastpos أو قاعدة بيانات .db");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("ملف النسخة الاحتياطية تالف");
  }

  const dbEntry = zip.file(BACKUP_DB_ENTRY);
  if (!dbEntry) {
    throw new Error("النسخة الاحتياطية لا تحتوي على قاعدة البيانات");
  }
  const db = await dbEntry.async("nodebuffer");
  if (!isSqliteFile(db)) {
    throw new Error("قاعدة البيانات داخل النسخة الاحتياطية غير صالحة");
  }

  const logoEntry = zip.file(BACKUP_LOGO_ENTRY);
  const logo = logoEntry ? await logoEntry.async("nodebuffer") : null;

  const manifestEntry = zip.file(BACKUP_MANIFEST_ENTRY);
  let manifest: BackupManifest | null = null;
  if (manifestEntry) {
    try {
      const parsed = JSON.parse(await manifestEntry.async("string")) as unknown;
      if (parsed && typeof parsed === "object") {
        manifest = parsed as BackupManifest;
      }
    } catch {
      throw new Error("بيانات النسخة الاحتياطية تالفة");
    }
  }

  return { db, logo, manifest, source: "archive" };
}

function countRows(sqlite: Database.Database, table: string): number {
  const row = sqlite
    .prepare(`SELECT COUNT(*) AS total FROM ${table}`)
    .get() as { total: number };
  return Number(row.total);
}

function readCounts(sqlite: Database.Database): BackupCounts {
  const counts = {} as BackupCounts;
  for (const table of COUNTED_TABLES) {
    counts[table] = countRows(sqlite, table);
  }
  return counts;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function backupFileName(now: Date) {
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join("-");
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `fastpos-backup-${stamp}-${time}.${BACKUP_FILE_EXTENSION}`;
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function createSafetySnapshot({
  sqlite,
  backupsDir,
  now = new Date(),
}: {
  sqlite: Database.Database;
  backupsDir: string;
  now?: Date;
}): Promise<string> {
  await fs.mkdir(backupsDir, { recursive: true });
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(
    now.getSeconds(),
  )}-${String(now.getMilliseconds()).padStart(3, "0")}`;

  let filePath = path.join(backupsDir, `pre-restore-${stamp}.db`);
  let suffix = 1;
  while (await pathExists(filePath)) {
    filePath = path.join(backupsDir, `pre-restore-${stamp}-${suffix}.db`);
    suffix += 1;
  }

  await sqlite.backup(filePath);
  return filePath;
}

export async function pruneBackups(
  backupsDir: string,
  keep = 5,
): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(backupsDir);
  } catch {
    return [];
  }

  const snapshots = entries
    .filter((name) => /^pre-restore-.*\.db$/.test(name))
    .sort();
  const stale = snapshots.slice(0, Math.max(0, snapshots.length - keep));
  const removed: string[] = [];
  for (const name of stale) {
    const filePath = path.join(backupsDir, name);
    try {
      await fs.unlink(filePath);
      removed.push(filePath);
    } catch {
      // best-effort cleanup
    }
  }
  return removed;
}

export function applyBackupLogo({
  logoPath,
  logo,
  removeWhenMissing,
}: {
  logoPath: string;
  logo: Buffer | null;
  removeWhenMissing: boolean;
}): "restored" | "removed" | "kept" {
  if (logo) {
    fsSync.mkdirSync(path.dirname(logoPath), { recursive: true });
    const temporaryPath = `${logoPath}.restore-${process.pid}-${Date.now()}`;
    fsSync.writeFileSync(temporaryPath, logo, { flag: "wx" });
    try {
      if (fsSync.existsSync(logoPath)) {
        fsSync.rmSync(logoPath, { force: true });
      }
      fsSync.renameSync(temporaryPath, logoPath);
    } catch (error) {
      fsSync.rmSync(temporaryPath, { force: true });
      throw error;
    }
    return "restored";
  }

  if (!removeWhenMissing) return "kept";
  if (fsSync.existsSync(logoPath)) {
    fsSync.rmSync(logoPath, { force: true });
  }
  return "removed";
}

export async function createBackupArchive({
  sqlite,
  logoPath,
  now = new Date(),
}: {
  sqlite: Database.Database;
  logoPath?: string;
  now?: Date;
}): Promise<{ buffer: Buffer; manifest: BackupManifest; fileName: string }> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "fastpos-backup-"));
  try {
    const snapshotPath = path.join(workDir, BACKUP_DB_ENTRY);
    await sqlite.backup(snapshotPath);
    const dbBuffer = await fs.readFile(snapshotPath);

    let logo: Buffer | null = null;
    if (logoPath) {
      try {
        logo = await fs.readFile(logoPath);
      } catch {
        logo = null;
      }
    }

    const manifest: BackupManifest = {
      app: "FastPOS",
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: now.toISOString(),
      hasLogo: Boolean(logo),
      counts: readCounts(sqlite),
    };

    const zip = new JSZip();
    zip.file(BACKUP_MANIFEST_ENTRY, JSON.stringify(manifest, null, 2));
    zip.file(BACKUP_DB_ENTRY, dbBuffer);
    if (logo) {
      zip.file(BACKUP_LOGO_ENTRY, logo);
    }

    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return { buffer, manifest, fileName: backupFileName(now) };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

export function inspectBackupDatabase(filePath: string): BackupCounts {
  let sqlite: Database.Database;
  try {
    sqlite = new Database(filePath, { readonly: true, fileMustExist: true });
  } catch {
    throw new Error("قاعدة البيانات المرفوعة تالفة");
  }

  try {
    let integrityOk = false;
    try {
      const rows = sqlite.pragma("integrity_check") as Array<{
        integrity_check: string;
      }>;
      integrityOk = rows.length === 1 && rows[0]?.integrity_check === "ok";
    } catch {
      integrityOk = false;
    }
    if (!integrityOk) {
      throw new Error("قاعدة البيانات المرفوعة تالفة");
    }

    let tables: Set<string>;
    try {
      const rows = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>;
      tables = new Set(rows.map((row) => row.name));
    } catch {
      throw new Error("قاعدة البيانات المرفوعة تالفة");
    }

    if (!REQUIRED_TABLES.every((table) => tables.has(table))) {
      throw new Error("قاعدة البيانات المرفوعة لا تحتوي على بيانات Fast POS");
    }

    return readCounts(sqlite);
  } finally {
    sqlite.close();
  }
}

/**
 * The swap is intentionally synchronous: the caller closes the SQLite
 * connection first, and the event loop must not run any request against a
 * half-replaced database between the file move and the reopen.
 */
export function replaceDatabaseFile({
  targetPath,
  replacementPath,
  reopen,
}: {
  targetPath: string;
  replacementPath: string;
  reopen: () => void;
}): { rolledBack: boolean } {
  const walPath = `${targetPath}-wal`;
  const shmPath = `${targetPath}-shm`;
  const displacedPath = `${targetPath}.restore-old-${randomUUID()}`;

  try {
    fsSync.renameSync(targetPath, displacedPath);
  } catch {
    throw new Error(
      "تعذر استبدال قاعدة البيانات — أوقف العمليات الجارية وحاول مرة أخرى",
    );
  }

  fsSync.rmSync(walPath, { force: true });
  fsSync.rmSync(shmPath, { force: true });

  try {
    fsSync.copyFileSync(replacementPath, targetPath);
  } catch (error) {
    fsSync.rmSync(targetPath, { force: true });
    fsSync.renameSync(displacedPath, targetPath);
    throw error;
  }

  try {
    reopen();
  } catch {
    fsSync.rmSync(targetPath, { force: true });
    fsSync.rmSync(walPath, { force: true });
    fsSync.rmSync(shmPath, { force: true });
    fsSync.renameSync(displacedPath, targetPath);
    reopen();
    return { rolledBack: true };
  }

  try {
    fsSync.rmSync(displacedPath, { force: true });
  } catch {
    // Best-effort cleanup; the restored database is already live.
  }
  return { rolledBack: false };
}
