import { NextResponse } from "next/server";
import path from "node:path";
import { getSession } from "@/lib/auth/session";
import { createBackupArchive } from "@/lib/backup/core";
import { getSqlite } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const { buffer, fileName } = await createBackupArchive({
      sqlite: getSqlite(),
      logoPath: path.join(process.cwd(), "data", "receipt-logo.png"),
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `تعذر إنشاء النسخة الاحتياطية: ${error.message}`
            : "تعذر إنشاء النسخة الاحتياطية",
      },
      { status: 500 },
    );
  }
}
