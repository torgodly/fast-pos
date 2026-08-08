"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { applyPartialReset, type ResetOptions } from "@/lib/db/reset";

export type FactoryResetOptions = ResetOptions;
import {
  cashierStations,
  categories,
  items,
  orderItems,
  orders,
  printers,
  tables,
  users,
} from "@/lib/db/schema";
import { buildTestPrintBytes } from "@/lib/print/test-bytes";
import { setReceiptFooterMessage, clearReceiptFooterMessage } from "@/lib/settings";
import { printToPrinter } from "@/lib/print/network";
import type {
  PrinterConnectionType,
  VenueId,
} from "@/lib/types";
import { isVenueId } from "@/lib/venues";
import {
  isPrinterRole,
  kitchenPrinterRolesFilter,
  supportsCheckout,
  supportsKitchen,
} from "@/lib/printers";

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
  for (const venueId of ["restaurant", "cafe"] as const) {
    revalidatePath(`/cashier/${venueId}`);
    revalidatePath(`/cashier/${venueId}/quick`);
  }
}

type ActionResult = { ok: true } | { error: string };

function syncCheckoutStation(
  venueId: VenueId,
  printerId: number,
  name: string,
) {
  const linked = db
    .select()
    .from(cashierStations)
    .where(
      and(
        eq(cashierStations.venueId, venueId),
        eq(cashierStations.printerId, printerId),
      ),
    )
    .get();

  if (linked) {
    db.update(cashierStations)
      .set({ name, active: true })
      .where(eq(cashierStations.id, linked.id))
      .run();
  } else {
    db.insert(cashierStations)
      .values({ venueId, name, printerId, active: true })
      .run();
  }

  db.update(cashierStations)
    .set({ active: false })
    .where(
      and(
        eq(cashierStations.venueId, venueId),
        ne(cashierStations.printerId, printerId),
      ),
    )
    .run();
}

export async function upsertCategory(formData: FormData): Promise<ActionResult> {
  await assertAdmin();
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const venueId = String(formData.get("venueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  const kitchenPrinterRaw = String(formData.get("kitchenPrinterId") ?? "");
  const kitchenPrinterId = kitchenPrinterRaw
    ? Number(kitchenPrinterRaw)
    : null;

  if (!isVenueId(venueId) || !name) {
    return { error: "بيانات التصنيف غير مكتملة" };
  }

  if (kitchenPrinterId) {
    const printer = db
      .select()
      .from(printers)
      .where(
        and(
          eq(printers.id, kitchenPrinterId),
          eq(printers.venueId, venueId),
          kitchenPrinterRolesFilter,
        ),
      )
      .get();
    if (!printer || (!id && !printer.active)) {
      return { error: "طابعة المطبخ غير صالحة" };
    }
  }

  const values = {
    name,
    sortOrder,
    venueId,
    kitchenPrinterId: kitchenPrinterId || null,
  };

  if (id) {
    db.update(categories)
      .set(values)
      .where(eq(categories.id, id))
      .run();
  } else {
    db.insert(categories)
      .values({ ...values, active: true })
      .run();
  }

  revalidatePath("/admin/items");
  return { ok: true };
}

export async function setCategoryActive(id: number, active: boolean) {
  await assertAdmin();
  db.update(categories).set({ active }).where(eq(categories.id, id)).run();
  revalidatePath("/admin/items");
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  await assertAdmin();
  const linked = db
    .select({ id: items.id })
    .from(items)
    .where(eq(items.categoryId, id))
    .get();
  if (linked) {
    return { error: "احذف الأصناف في هذا التصنيف أولاً" };
  }
  db.delete(categories).where(eq(categories.id, id)).run();
  revalidatePath("/admin/items");
  return { ok: true };
}

export async function upsertItem(formData: FormData): Promise<ActionResult> {
  await assertAdmin();
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const venueId = String(formData.get("venueId") ?? "");
  const categoryId = Number(formData.get("categoryId"));
  const name = String(formData.get("name") ?? "").trim();
  const price = Number(formData.get("price"));

  if (!isVenueId(venueId) || !name || !categoryId || Number.isNaN(price)) {
    return { error: "بيانات الصنف غير مكتملة" };
  }

  const values = {
    venueId,
    categoryId,
    name,
    price,
    kitchenPrinterId: null as number | null,
  };

  if (id) {
    db.update(items).set(values).where(eq(items.id, id)).run();
  } else {
    db.insert(items).values({ ...values, active: true }).run();
  }

  revalidatePath("/admin/items");
  return { ok: true };
}

export async function setItemActive(id: number, active: boolean) {
  await assertAdmin();
  db.update(items).set({ active }).where(eq(items.id, id)).run();
  revalidatePath("/admin/items");
}

export async function deleteItem(id: number): Promise<ActionResult> {
  await assertAdmin();
  db.update(orderItems)
    .set({ itemId: null })
    .where(eq(orderItems.itemId, id))
    .run();
  db.delete(items).where(eq(items.id, id)).run();
  revalidatePath("/admin/items");
  return { ok: true };
}

export async function upsertTable(formData: FormData): Promise<ActionResult> {
  await assertAdmin();
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const venueId = String(formData.get("venueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!isVenueId(venueId) || !name) {
    return { error: "اسم الطاولة مطلوب" };
  }

  if (id) {
    db.update(tables).set({ venueId, name }).where(eq(tables.id, id)).run();
  } else {
    db.insert(tables).values({ venueId, name, active: true }).run();
  }

  revalidatePath("/admin/tables");
  return { ok: true };
}

export async function setTableActive(id: number, active: boolean) {
  await assertAdmin();
  db.update(tables).set({ active }).where(eq(tables.id, id)).run();
  revalidatePath("/admin/tables");
}

export async function deleteTable(id: number): Promise<ActionResult> {
  await assertAdmin();
  const openOrder = db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tableId, id), eq(orders.status, "open")))
    .get();
  if (openOrder) {
    return { error: "لا يمكن الحذف — يوجد طلب مفتوح على هذه الطاولة" };
  }
  db.update(orders).set({ tableId: null }).where(eq(orders.tableId, id)).run();
  db.delete(tables).where(eq(tables.id, id)).run();
  revalidatePath("/admin/tables");
  return { ok: true };
}

export async function upsertStaff(formData: FormData): Promise<ActionResult> {
  await assertAdmin();
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const pin = String(formData.get("pin") ?? "").trim();

  if (!name || (role !== "waiter" && role !== "cashier")) {
    return { error: "بيانات الموظف غير مكتملة" };
  }

  if (!id && !/^\d{4,6}$/.test(pin)) {
    return { error: "رمز PIN يجب أن يكون من 4 إلى 6 أرقام" };
  }
  if (pin && !/^\d{4,6}$/.test(pin)) {
    return { error: "رمز PIN يجب أن يكون من 4 إلى 6 أرقام" };
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
    if (conflict) {
      return { error: "رمز الدخول مستخدم من موظف آخر" };
    }
  }

  if (id) {
    const updates: {
      name: string;
      role: "waiter" | "cashier";
      venueId: null;
      pinHash?: string;
    } = {
      name,
      role: role as "waiter" | "cashier",
      venueId: null,
    };
    if (pin) updates.pinHash = bcrypt.hashSync(pin, 10);
    db.update(users).set(updates).where(eq(users.id, id)).run();
  } else {
    db.insert(users)
      .values({
        name,
        role: role as "waiter" | "cashier",
        venueId: null,
        pinHash: bcrypt.hashSync(pin, 10),
        active: true,
      })
      .run();
  }

  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function setStaffActive(id: number, active: boolean) {
  await assertAdmin();
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user || user.role === "admin") return;
  db.update(users).set({ active }).where(eq(users.id, id)).run();
  revalidatePath("/admin/staff");
}

export async function deleteStaff(id: number): Promise<ActionResult> {
  await assertAdmin();
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user || user.role === "admin") {
    return { error: "لا يمكن حذف هذا المستخدم" };
  }
  db.update(orders).set({ waiterId: null }).where(eq(orders.waiterId, id)).run();
  db.update(orders)
    .set({ cashierId: null })
    .where(eq(orders.cashierId, id))
    .run();
  db.delete(users).where(eq(users.id, id)).run();
  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function upsertPrinter(formData: FormData): Promise<ActionResult> {
  await assertAdmin();
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const venueId = String(formData.get("venueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const connectionType = String(
    formData.get("connectionType") ?? "network",
  ) as PrinterConnectionType;
  const host = String(formData.get("host") ?? "").trim();
  const port = Number(formData.get("port") ?? 9100);

  if (!isPrinterRole(role)) {
    return { error: "نوع الطابعة غير صالح" };
  }

  if (role === "both" && connectionType === "local") {
    return {
      error: "الطابعة المشتركة (مطبخ + فاتورة) تتطلب اتصال شبكة",
    };
  }

  const resolvedConnection: PrinterConnectionType = supportsKitchen(role)
    ? "network"
    : connectionType;

  if (!isVenueId(venueId) || !name) {
    return { error: "بيانات الطابعة غير مكتملة" };
  }

  if (resolvedConnection === "network" && !host) {
    return { error: "عنوان IP مطلوب لطابعة الشبكة" };
  }

  const resolvedHost =
    resolvedConnection === "local" ? host.trim() || "default" : host;

  if (resolvedConnection === "network") {
    if (!Number.isFinite(port) || port < 1) {
      return { error: "منفذ الطابعة غير صالح" };
    }
  }

  const values = {
    venueId,
    name,
    role,
    host: resolvedHost,
    port: resolvedConnection === "local" ? 0 : port,
    connectionType: resolvedConnection,
  };

  let printerId = id;

  if (id) {
    db.update(printers).set(values).where(eq(printers.id, id)).run();
  } else {
    const inserted = db
      .insert(printers)
      .values({ ...values, active: true })
      .returning()
      .get();
    printerId = inserted.id;
  }

  if (supportsCheckout(role) && printerId) {
    syncCheckoutStation(venueId as VenueId, printerId, name);
  } else if (printerId) {
    db.delete(cashierStations)
      .where(eq(cashierStations.printerId, printerId))
      .run();
  }

  revalidatePrinters();
  return { ok: true };
}

export async function setPrinterActive(id: number, active: boolean) {
  await assertAdmin();
  db.update(printers).set({ active }).where(eq(printers.id, id)).run();
  revalidatePrinters();
}

export async function deletePrinter(id: number): Promise<ActionResult> {
  await assertAdmin();
  db.delete(cashierStations)
    .where(eq(cashierStations.printerId, id))
    .run();
  db.update(items)
    .set({ kitchenPrinterId: null })
    .where(eq(items.kitchenPrinterId, id))
    .run();
  db.update(categories)
    .set({ kitchenPrinterId: null })
    .where(eq(categories.kitchenPrinterId, id))
    .run();
  db.delete(printers).where(eq(printers.id, id)).run();
  revalidatePrinters();
  return { ok: true };
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

  if (printer.connectionType === "local") {
    return {
      error:
        "طابعة Chrome — تُطبع من جهاز الكاشير عند الدفع (نافذة طباعة المتصفح)",
    };
  }

  try {
    const data = await buildTestPrintBytes(printer.name);
    await printToPrinter({
      host: printer.host,
      port: printer.port,
      data,
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

function revalidateAfterSystemReset() {
  revalidatePath("/admin");
  revalidatePath("/admin/staff");
  revalidatePath("/admin/printers");
  revalidatePath("/admin/items");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/tables");
  revalidatePath("/cashier", "layout");
  revalidatePath("/waiter", "layout");
}

export async function factoryResetDatabase(
  password: string,
  options: FactoryResetOptions,
): Promise<{ error: string } | { ok: true }> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { error: "غير مصرح" };
  }

  if (!Object.values(options).some(Boolean)) {
    return { error: "اختر عنصراً واحداً على الأقل للتهيئة" };
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

  applyPartialReset(options);
  revalidateAfterSystemReset();
  if (options.receiptSettings) {
    revalidatePath("/admin/settings");
  }
  return { ok: true as const };
}

export async function saveReceiptSettings(
  message: string,
): Promise<ActionResult> {
  await assertAdmin();
  setReceiptFooterMessage(message);
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function resetReceiptSettings(): Promise<ActionResult> {
  await assertAdmin();
  clearReceiptFooterMessage();
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function changeAdminPassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { error: "غير مصرح" };
  }

  const currentPassword = input.currentPassword.trim();
  const newPassword = input.newPassword.trim();
  const confirmPassword = input.confirmPassword.trim();

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "أكمل جميع الحقول" };
  }
  if (newPassword.length < 6) {
    return { error: "كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف" };
  }
  if (newPassword !== confirmPassword) {
    return { error: "تأكيد كلمة المرور غير متطابق" };
  }
  if (newPassword === currentPassword) {
    return { error: "اختر كلمة مرور مختلفة عن الحالية" };
  }

  const user = db
    .select()
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.role, "admin")))
    .get();

  if (!user?.passwordHash || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return { error: "كلمة المرور الحالية غير صحيحة" };
  }

  db.update(users)
    .set({ passwordHash: bcrypt.hashSync(newPassword, 10) })
    .where(eq(users.id, user.id))
    .run();

  return { ok: true };
}
