"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { customers, orders } from "@/lib/db/schema";

type ActionResult = { ok: true } | { error: string };

export type CustomerOption = {
  id: number;
  name: string;
  phone: string | null;
};

export type QuickCustomerInput = {
  name: string;
  phone?: string | null;
  notes?: string | null;
};

type QuickCreateResult =
  | { ok: true; customer: CustomerOption }
  | { error: string };

async function assertAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("غير مصرح");
  }
  return session;
}

function customerNameTaken(name: string, excludeId?: number) {
  return db
    .select({ id: customers.id })
    .from(customers)
    .where(
      excludeId
        ? and(
            sql`lower(${customers.name}) = lower(${name})`,
            ne(customers.id, excludeId),
          )
        : sql`lower(${customers.name}) = lower(${name})`,
    )
    .get();
}

function revalidateCustomers() {
  revalidatePath("/admin/customers");
}

export async function upsertCustomer(
  formData: FormData,
): Promise<ActionResult> {
  await assertAdmin();
  const rawId = Number(formData.get("id"));
  const id = Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!name) return { error: "اسم العميل مطلوب" };
  if (name.length > 80) return { error: "اسم العميل طويل جداً" };

  if (customerNameTaken(name, id ?? undefined)) {
    return { error: "يوجد عميل بهذا الاسم بالفعل" };
  }

  if (id) {
    const existing = db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, id))
      .get();
    if (!existing) return { error: "العميل غير موجود" };
    db.update(customers)
      .set({ name, phone, notes })
      .where(eq(customers.id, id))
      .run();
  } else {
    db.insert(customers)
      .values({ name, phone, notes, active: true })
      .run();
  }

  revalidateCustomers();
  return { ok: true };
}

export async function setCustomerActive(
  id: number,
  active: boolean,
): Promise<ActionResult> {
  await assertAdmin();
  const customer = db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, id))
    .get();
  if (!customer) return { error: "العميل غير موجود" };
  db.update(customers).set({ active }).where(eq(customers.id, id)).run();
  revalidateCustomers();
  return { ok: true };
}

export async function deleteCustomer(id: number): Promise<ActionResult> {
  await assertAdmin();
  const customer = db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, id))
    .get();
  if (!customer) return { error: "العميل غير موجود" };

  const order = db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.customerId, id))
    .get();
  if (order) {
    return { error: "لا يمكن حذف العميل — مرتبط بفواتير" };
  }

  db.delete(customers).where(eq(customers.id, id)).run();
  revalidateCustomers();
  return { ok: true };
}

export async function quickCreateCustomer(
  input: QuickCustomerInput,
): Promise<QuickCreateResult> {
  const session = await getSession();
  if (!session || (session.role !== "cashier" && session.role !== "admin")) {
    return { error: "غير مصرح" };
  }

  const name = String(input.name ?? "").trim();
  const phone = String(input.phone ?? "").trim() || null;
  const notes = String(input.notes ?? "").trim() || null;
  if (!name) return { error: "اسم العميل مطلوب" };
  if (name.length > 80) return { error: "اسم العميل طويل جداً" };
  if (customerNameTaken(name)) {
    return { error: "يوجد عميل بهذا الاسم بالفعل" };
  }

  const created = db
    .insert(customers)
    .values({ name, phone, notes, active: true })
    .returning({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
    })
    .get();

  revalidateCustomers();
  return { ok: true, customer: created };
}
