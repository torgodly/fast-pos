"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { recordSessionAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { orders, paymentMethods } from "@/lib/db/schema";
import {
  generatePaymentMethodCode,
  validatePaymentMethodFlags,
  validatePaymentMethodName,
} from "@/lib/payments/core";

type ActionResult = { ok: true } | { error: string };

async function assertAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("غير مصرح");
  }
  return session;
}

function revalidatePaymentMethods() {
  revalidatePath("/admin/payment-methods");
  revalidatePath("/admin/reports");
  revalidatePath("/cashier/restaurant");
  revalidatePath("/cashier/cafe");
}

function submittedFlag(formData: FormData, name: string) {
  const value = formData.get(name);
  return value === "on" || value === "true" || value === "1";
}

function methodUsage(code: string) {
  const row = db
    .select({ total: sql<number>`count(*)` })
    .from(orders)
    .where(eq(orders.paymentMethod, code))
    .get();
  return Number(row?.total ?? 0);
}

export async function upsertPaymentMethod(
  formData: FormData,
): Promise<ActionResult> {
  const session = await assertAdmin();
  const rawId = Number(formData.get("id"));
  const id = Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  const name = String(formData.get("name") ?? "").trim();
  let deferred = submittedFlag(formData, "deferred");
  let cashDrawer = submittedFlag(formData, "cashDrawer");

  const nameError = validatePaymentMethodName(name);
  if (nameError) return { error: nameError };

  const duplicate = db
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(
      id
        ? and(
            sql`lower(${paymentMethods.name}) = lower(${name})`,
            ne(paymentMethods.id, id),
          )
        : sql`lower(${paymentMethods.name}) = lower(${name})`,
    )
    .get();
  if (duplicate) return { error: "توجد طريقة دفع بهذا الاسم بالفعل" };

  if (id) {
    const existing = db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.id, id))
      .get();
    if (!existing) return { error: "طريقة الدفع غير موجودة" };

    if (existing.builtIn) {
      deferred = existing.deferred;
      cashDrawer = existing.cashDrawer;
    } else {
      const flagError = validatePaymentMethodFlags({ deferred, cashDrawer });
      if (flagError) return { error: flagError };
    }

    db.update(paymentMethods)
      .set({ name, deferred, cashDrawer })
      .where(eq(paymentMethods.id, id))
      .run();
    recordSessionAudit(session, {
      kind: "settings",
      success: true,
      detail: `تعديل طريقة دفع «${name}»${deferred ? " — آجل" : ""}`,
    });
  } else {
    const flagError = validatePaymentMethodFlags({ deferred, cashDrawer });
    if (flagError) return { error: flagError };

    const last = db
      .select({ sortOrder: paymentMethods.sortOrder })
      .from(paymentMethods)
      .orderBy(sql`${paymentMethods.sortOrder} DESC`)
      .get();

    db.insert(paymentMethods)
      .values({
        code: generatePaymentMethodCode(),
        name,
        deferred,
        cashDrawer,
        builtIn: false,
        active: true,
        sortOrder: (last?.sortOrder ?? 0) + 10,
      })
      .run();
    recordSessionAudit(session, {
      kind: "settings",
      success: true,
      detail: `إضافة طريقة دفع «${name}»${deferred ? " — آجل" : ""}`,
    });
  }

  revalidatePaymentMethods();
  return { ok: true };
}

export async function setPaymentMethodActive(
  id: number,
  active: boolean,
): Promise<ActionResult> {
  await assertAdmin();
  const method = db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.id, id))
    .get();
  if (!method) return { error: "طريقة الدفع غير موجودة" };

  if (!active) {
    const activeCount = db
      .select({ total: sql<number>`count(*)` })
      .from(paymentMethods)
      .where(eq(paymentMethods.active, true))
      .get();
    if (Number(activeCount?.total ?? 0) <= 1) {
      return { error: "يجب أن تبقى طريقة دفع واحدة نشطة على الأقل" };
    }
  }

  db.update(paymentMethods)
    .set({ active })
    .where(eq(paymentMethods.id, id))
    .run();
  revalidatePaymentMethods();
  return { ok: true };
}

export async function deletePaymentMethod(id: number): Promise<ActionResult> {
  const session = await assertAdmin();
  const method = db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.id, id))
    .get();
  if (!method) return { error: "طريقة الدفع غير موجودة" };
  if (method.builtIn) {
    return { error: "طرق الدفع الأساسية لا يمكن حذفها — يمكن تعطيلها" };
  }

  const usage = methodUsage(method.code);
  if (usage > 0) {
    return {
      error: `لا يمكن حذف طريقة الدفع — مستخدمة في ${usage} فاتورة. عطّلها بدلاً من حذفها`,
    };
  }

  db.delete(paymentMethods).where(eq(paymentMethods.id, id)).run();
  recordSessionAudit(session, {
    kind: "settings",
    success: true,
    detail: `حذف طريقة دفع «${method.name}»`,
  });
  revalidatePaymentMethods();
  return { ok: true };
}
