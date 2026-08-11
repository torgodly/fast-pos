import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { importMenuWorkbook } from "@/lib/menu/excel";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "اختر ملف Excel" }, { status: 400 });
  }

  const summary = await importMenuWorkbook(await file.arrayBuffer());
  revalidatePath("/admin/items");
  revalidatePath("/cashier", "layout");
  revalidatePath("/waiter", "layout");
  return NextResponse.json({ ok: true, summary });
}
