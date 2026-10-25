import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import {
  applyBackupLogo,
  createSafetySnapshot,
  inspectBackupDatabase,
  pruneBackups,
  readBackupFile,
  replaceDatabaseFile,
} from "@/lib/backup/core";
import { closeDatabase, getSqlite } from "@/lib/db";
import { clearReceiptLogoCache } from "@/lib/print/logo";

export const runtime = "nodejs";

const MAX_RESTORE_BYTES = 250 * 1024 * 1024;
const MAX_DB_BYTES = 512 * 1024 * 1024;
const MAX_SAFETY_SNAPSHOTS = 5;

const restoreLock = globalThis as unknown as {
  __fastposRestoreRunning?: boolean;
};

function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function verifyAdminPassword(userId: number, password: string): boolean {
  const row = getSqlite()
    .prepare(
      "SELECT password_hash FROM users WHERE id = ? AND role = 'admin' AND active = 1",
    )
    .get(userId) as { password_hash: string | null } | undefined;
  return Boolean(
    row?.password_hash && bcrypt.compareSync(password, row.password_hash),
  );
}

function countOpenShifts(): number {
  const row = getSqlite()
    .prepare("SELECT COUNT(*) AS total FROM shifts WHERE status = 'open'")
    .get() as { total: number };
  return Number(row.total);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return errorResponse("غير مصرح", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("غير مصرح", 403);
  }
  if (!hasSameOrigin(request)) {
    return errorResponse("الطلب غير صالح", 403);
  }
  if (restoreLock.__fastposRestoreRunning) {
    return errorResponse("توجد عملية استعادة جارية — انتظر حتى تنتهي", 409);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESTORE_BYTES + 1024 * 1024) {
    return errorResponse("حجم الملف كبير جداً", 413);
  }

  restoreLock.__fastposRestoreRunning = true;
  let workDir: string | null = null;

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return errorResponse("صيغة الطلب غير صالحة", 400);
    }

    const file = formData.get("file");
    const password = String(formData.get("password") ?? "").trim();

    if (!(file instanceof File) || file.size === 0) {
      return errorResponse("اختر ملف النسخة الاحتياطية أولاً", 400);
    }
    if (file.size > MAX_RESTORE_BYTES) {
      return errorResponse("حجم الملف كبير جداً", 413);
    }
    if (!password) {
      return errorResponse("أدخل كلمة مرور المدير", 400);
    }
    if (!verifyAdminPassword(session.userId, password)) {
      return errorResponse("كلمة المرور غير صحيحة", 403);
    }

    const uploaded = Buffer.from(await file.arrayBuffer());
    let backup: Awaited<ReturnType<typeof readBackupFile>>;
    try {
      backup = await readBackupFile(uploaded);
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : "ملف النسخة الاحتياطية غير صالح",
        400,
      );
    }
    if (backup.db.length > MAX_DB_BYTES) {
      return errorResponse("قاعدة البيانات داخل النسخة كبيرة جداً", 413);
    }

    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "fastpos-restore-"));
    const replacementPath = path.join(workDir, "pos.db");
    await fs.writeFile(replacementPath, backup.db);

    let counts: ReturnType<typeof inspectBackupDatabase>;
    try {
      counts = inspectBackupDatabase(replacementPath);
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : "قاعدة البيانات المرفوعة غير صالحة",
        400,
      );
    }

    const dataDir = path.join(process.cwd(), "data");
    const dbPath = path.join(dataDir, "pos.db");
    const logoPath = path.join(dataDir, "receipt-logo.png");
    const backupsDir = path.join(dataDir, "backups");
    const replacedOpenShifts = countOpenShifts();

    const safetyBackup = await createSafetySnapshot({
      sqlite: getSqlite(),
      backupsDir,
    });
    await pruneBackups(backupsDir, MAX_SAFETY_SNAPSHOTS);

    closeDatabase();
    let swap: { rolledBack: boolean };
    try {
      swap = replaceDatabaseFile({
        targetPath: dbPath,
        replacementPath,
        reopen: () => {
          getSqlite();
        },
      });
    } catch (error) {
      try {
        getSqlite();
      } catch {
        // The next request will surface the fatal state if reopening also fails.
      }
      return errorResponse(
        `تعذر استبدال قاعدة البيانات: ${
          error instanceof Error ? error.message : "خطأ غير معروف"
        }`,
        500,
      );
    }

    if (swap.rolledBack) {
      return errorResponse(
        "تعذر تفعيل النسخة المستعادة — تم الرجوع تلقائياً إلى البيانات السابقة",
        500,
      );
    }

    let logo: "restored" | "removed" | "kept" = "kept";
    let warning: string | undefined;
    try {
      logo = applyBackupLogo({
        logoPath,
        logo: backup.logo,
        removeWhenMissing: backup.source === "archive",
      });
    } catch {
      warning = "تمت استعادة البيانات، لكن تعذر تحديث شعار الفاتورة";
    }
    clearReceiptLogoCache();

    revalidatePath("/admin", "layout");
    revalidatePath("/cashier", "layout");
    revalidatePath("/waiter", "layout");

    return NextResponse.json({
      ok: true,
      counts,
      replacedOpenShifts,
      safetyBackup: path.basename(safetyBackup),
      logo,
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? `تعذرت الاستعادة: ${error.message}`
        : "تعذرت الاستعادة",
      500,
    );
  } finally {
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
    restoreLock.__fastposRestoreRunning = false;
  }
}
