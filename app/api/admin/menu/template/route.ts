import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isCounterMode } from "@/lib/deployment";
import { buildMenuTemplateWorkbook } from "@/lib/menu/excel-template";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const workbook = buildMenuTemplateWorkbook({
    counterMode: isCounterMode(),
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="menu-template.xlsx"',
    },
  });
}
