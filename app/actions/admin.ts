"use server";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { clearSession, getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { resetDatabaseToFactory } from "@/lib/db/reset";
import {
  cashierStations,
  categories,
  items,
  printers,
  tables,
  users,
} from "@/lib/db/schema";
import { buildTestEscPos } from "@/lib/print/escpos";
import { printToPrinter } from "@/lib/print/network";
import type { PrinterRole } from "@/lib/types";
import { isVenueId } from "@/lib/venues";

async function assertAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("غير مصرح");
  }
  return session;
}

function revalidatePrinters() {
  revalidatePath("/admin/printers");
  revalidatePath("/admin/items");
  revalidatePath("/cashier");
}

export async function upsertCategory(formData: FormData) {
  await assertAdmin();
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const venueId = String(formData.get("venueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const sortOrder = Number(formData.get("sortOrder") ?? 0);

  if (!isVenueId(venueId) || !name) return;

  if (id) {
    db.update(categories)
      .set({ name, sortOrder, venueId })
      .where(eq(categories.id, id))
      .run();
  } else {
    db.insert(categories)
      .values({ venueId, name, sortOrder, active: true })
      .run();
  }

  revalidatePath("/admin/items");
}

export async function setCategoryActive(id: number, active: boolean) {
  await assertAdmin();
  db.update(categories).set({ active }).where(eq(categories.id, id)).run();
  revalidatePath("/admin/items");
}

export async function upsertItem(formData: FormData) {
  await assertAdmin();
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const venueId = String(formData.get("venueId") ?? "");
  const categoryId = Number(formData.get("categoryId"));
  const name = String(formData.get("name") ?? "").trim();
  const price = Number(formData.get("price"));
  const kitchenPrinterRaw = String(formData.get("kitchenPrinterId") ?? "");
  const kitchenPrinterId = kitchenPrinterRaw
    ? Number(kitchenPrinterRaw)
    : null;

  if (!isVenueId(venueId) || !name || !categoryId || Number.isNaN(price)) {
    return;
  }

  if (kitchenPrinterId) {
    const printer = db
      .select()
      .from(printers)
      .where(
        and(
          eq(printers.id, kitchenPrinterId),
          eq(printers.venueId, venueId),
          eq(printers.role, "kitchen"),
          eq(printers.active, true),
        ),
      )
      .get();
    if (!printer) return;
  }

  const values = {
    venueId,
    categoryId,
    name,
    price,
    kitchenPrinterId: kitchenPrinterId || null,
  };

  if (id) {
    db.update(items).set(values).where(eq(items.id, id)).run();
  } else {
    db.insert(items).values({ ...values, active: true }).run();
  }

  revalidatePath("/admin/items");
}

export async function setItemActive(id: number, active: boolean) {
  await assertAdmin();
  db.update(items).set({ active }).where(eq(items.id, id)).run();
  revalidatePath("/admin/items");
}

export async function upsertTable(formData: FormData) {
  await assertAdmin();
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const venueId = String(formData.get("venueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!isVenueId(venueId) || !name) return;

  if (id) {
    db.update(tables).set({ venueId, name }).where(eq(tables.id, id)).run();
  } else {
    db.insert(tables).values({ venueId, name, active: true }).run();
  }

  revalidatePath("/admin/tables");
}

export async function setTableActive(id: number, active: boolean) {
  await assertAdmin();
  db.update(tables).set({ active }).where(eq(tables.id, id)).run();
  revalidatePath("/admin/tables");
}

export async function upsertStaff(formData: FormData) {
  await assertAdmin();
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const pin = String(formData.get("pin") ?? "").trim();

  if (!name || (role !== "waiter" && role !== "cashier")) {
    return;
  }

  if (!id && !/^\d{4,6}$/.test(pin)) {
    return;
  }
  if (pin && !/^\d{4,6}$/.test(pin)) {
    return;
  }

  if (pin) {
    const others = db
      .select()
      .from(users)
      .where(eq(users.active, true))
      .all()
      .filter((u) => u.id !== id && (u.role === "waiter" || u.role === "cashier"));

    const conflict = others.some(
      (u) => u.pinHash && bcrypt.compareSync(pin, u.pinHash),
    );
    if (conflict) return;
  }

  if (id) {
    const updates: {
      name: string;
      role: "waiter" | "cashier";
      venueId: null;
      pinHash?: string;
    } = {
      name,
      role,
      venueId: null,
    };
    if (pin) updates.pinHash = bcrypt.hashSync(pin, 10);
    db.update(users).set(updates).where(eq(users.id, id)).run();
  } else {
    db.insert(users)
      .values({
        name,
        role,
        venueId: null,
        pinHash: bcrypt.hashSync(pin, 10),
        active: true,
      })
      .run();
  }

  revalidatePath("/admin/staff");
}

export async function setStaffActive(id: number, active: boolean) {
  await assertAdmin();
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user || user.role === "admin") return;
  db.update(users).set({ active }).where(eq(users.id, id)).run();
  revalidatePath("/admin/staff");
}

export async function upsertPrinter(formData: FormData) {
  await assertAdmin();
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const venueId = String(formData.get("venueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as PrinterRole;
  const host = String(formData.get("host") ?? "").trim();
  const port = Number(formData.get("port") ?? 9100);

  if (
    !isVenueId(venueId) ||
    !name ||
    !host ||
    (role !== "kitchen" && role !== "checkout") ||
    !Number.isFinite(port) ||
    port < 1
  ) {
    return;
  }

  if (id) {
    db.update(printers)
      .set({ venueId, name, role, host, port })
      .where(eq(printers.id, id))
      .run();
  } else {
    db.insert(printers)
      .values({ venueId, name, role, host, port, active: true })
      .run();
  }

  revalidatePrinters();
}

export async function setPrinterActive(id: number, active: boolean) {
  await assertAdmin();
  db.update(printers).set({ active }).where(eq(printers.id, id)).run();
  revalidatePrinters();
}

export async function testPrinter(
  printerId: number,
): Promise<{ error: string } | { ok: true; message: string }> {
  await assertAdmin();
  const printer = db
    .select()
    .from(printers)
    .where(eq(printers.id, printerId))
    .get();
  if (!printer || !printer.active) {
    return { error: "الطابعة غير موجودة أو معطّلة" };
  }

  try {
    await printToPrinter({
      host: printer.host,
      port: printer.port,
      data: buildTestEscPos(printer.name),
    });
    return {
      ok: true,
      message: `تم إرسال صفحة الاختبار إلى ${printer.name} (${printer.host})`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : `تعذر الاتصال بالطابعة ${printer.name}`,
    };
  }
}

export async function upsertCashierStation(formData: FormData) {
  await assertAdmin();
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const venueId = String(formData.get("venueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const printerId = Number(formData.get("printerId"));

  if (!isVenueId(venueId) || !name || !printerId) return;

  const printer = db
    .select()
    .from(printers)
    .where(
      and(
        eq(printers.id, printerId),
        eq(printers.venueId, venueId),
        eq(printers.role, "checkout"),
        eq(printers.active, true),
      ),
    )
    .get();
  if (!printer) return;

  if (id) {
    db.update(cashierStations)
      .set({ venueId, name, printerId })
      .where(eq(cashierStations.id, id))
      .run();
  } else {
    db.insert(cashierStations)
      .values({ venueId, name, printerId, active: true })
      .run();
  }

  revalidatePrinters();
}

export async function setCashierStationActive(id: number, active: boolean) {
  await assertAdmin();
  db.update(cashierStations)
    .set({ active })
    .where(eq(cashierStations.id, id))
    .run();
  revalidatePrinters();
}

export async function factoryResetDatabase(
  password: string,
): Promise<{ error: string } | { ok: true }> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { error: "غير مصرح" };
  }

  const trimmed = password.trim();
  if (!trimmed) {
    return { error: "أدخل كلمة المرور للتأكيد" };
  }

  const user = db
    .select()
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.role, "admin")))
    .get();

  if (!user?.passwordHash || !bcrypt.compareSync(trimmed, user.passwordHash)) {
    return { error: "كلمة المرور غير صحيحة" };
  }

  resetDatabaseToFactory();
  await clearSession();
  return { ok: true as const };
}
