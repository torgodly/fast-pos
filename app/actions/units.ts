"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { recordSessionAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  ingredients,
  items,
  purchaseInvoiceLines,
  units,
} from "@/lib/db/schema";

type ActionResult = { ok: true } | { error: string };

const UNIT_KINDS = new Set(["weight", "count"]);

async function assertAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("غير مصرح");
  }
  return session;
}

function revalidateUnits() {
  revalidatePath("/admin/units");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/items");
  revalidatePath("/admin/purchases");
}

function unitUsage(unitId: number) {
  const ingredientRow = db
    .select({ total: sql<number>`count(*)` })
    .from(ingredients)
    .where(eq(ingredients.preferredUnitId, unitId))
    .get();
  const itemRow = db
    .select({ total: sql<number>`count(*)` })
    .from(items)
    .where(eq(items.unitId, unitId))
    .get();
  const purchaseRow = db
    .select({ total: sql<number>`count(*)` })
    .from(purchaseInvoiceLines)
    .where(eq(purchaseInvoiceLines.unitId, unitId))
    .get();

  return {
    ingredients: Number(ingredientRow?.total ?? 0),
    items: Number(itemRow?.total ?? 0),
    purchaseLines: Number(purchaseRow?.total ?? 0),
  };
}

function usageParts(usage: ReturnType<typeof unitUsage>): string[] {
  const parts: string[] = [];
  if (usage.ingredients > 0) parts.push(`${usage.ingredients} مكوّن`);
  if (usage.items > 0) parts.push(`${usage.items} صنف`);
  if (usage.purchaseLines > 0)
    parts.push(`${usage.purchaseLines} بند مشتريات`);
  return parts;
}

export async function upsertUnit(formData: FormData): Promise<ActionResult> {
  const session = await assertAdmin();
  const rawId = Number(formData.get("id"));
  const id = Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const factorToBase = Number(formData.get("factorToBase"));

  if (!name) return { error: "اسم الوحدة مطلوب" };
  if (name.length > 40) return { error: "اسم الوحدة طويل جداً" };
  if (!UNIT_KINDS.has(kind)) return { error: "نوع الوحدة غير صالح" };
  if (
    !Number.isInteger(factorToBase) ||
    factorToBase <= 0 ||
    factorToBase > 1_000_000
  ) {
    return { error: "معامل التحويل يجب أن يكون رقماً صحيحاً أكبر من صفر" };
  }

  const duplicate = db
    .select({ id: units.id })
    .from(units)
    .where(
      id
        ? and(
            sql`lower(${units.name}) = lower(${name})`,
            ne(units.id, id),
          )
        : sql`lower(${units.name}) = lower(${name})`,
    )
    .get();
  if (duplicate) return { error: "يوجد وحدة بهذا الاسم بالفعل" };

  if (id) {
    const existing = db
      .select()
      .from(units)
      .where(eq(units.id, id))
      .get();
    if (!existing) return { error: "الوحدة غير موجودة" };
    if (existing.builtIn) {
      return { error: "الوحدات الأساسية لا يمكن تعديلها" };
    }

    const usage = unitUsage(id);
    const changesConversion =
      existing.kind !== kind || existing.factorToBase !== factorToBase;
    if (changesConversion && (usage.ingredients > 0 || usage.items > 0)) {
      return {
        error:
          "لا يمكن تغيير نوع أو معامل وحدة مستخدمة في مكونات أو أصناف — أنشئ وحدة جديدة بدلاً منها",
      };
    }

    db.update(units)
      .set({ name, kind: kind as "weight" | "count", factorToBase })
      .where(eq(units.id, id))
      .run();
    recordSessionAudit(session, {
      kind: "inventory",
      success: true,
      detail: `تعديل وحدة «${name}»`,
    });
  } else {
    db.insert(units)
      .values({
        name,
        kind: kind as "weight" | "count",
        factorToBase,
        builtIn: false,
        active: true,
      })
      .run();
    recordSessionAudit(session, {
      kind: "inventory",
      success: true,
      detail: `إضافة وحدة «${name}»`,
    });
  }

  revalidateUnits();
  return { ok: true };
}

export async function setUnitActive(
  id: number,
  active: boolean,
): Promise<ActionResult> {
  const session = await assertAdmin();
  const unit = db.select().from(units).where(eq(units.id, id)).get();
  if (!unit) return { error: "الوحدة غير موجودة" };
  if (unit.builtIn) {
    return { error: "الوحدات الأساسية لا يمكن تعطيلها" };
  }
  db.update(units).set({ active }).where(eq(units.id, id)).run();
  revalidateUnits();
  return { ok: true };
}

export async function deleteUnit(id: number): Promise<ActionResult> {
  const session = await assertAdmin();
  const unit = db.select().from(units).where(eq(units.id, id)).get();
  if (!unit) return { error: "الوحدة غير موجودة" };
  if (unit.builtIn) {
    return { error: "الوحدات الأساسية لا يمكن حذفها" };
  }

  const usage = unitUsage(id);
  const parts = usageParts(usage);
  if (parts.length > 0) {
    return {
      error: `لا يمكن حذف الوحدة — مستخدمة في ${parts.join("، ")}. عطّلها بدلاً من حذفها`,
    };
  }

  db.delete(units).where(eq(units.id, id)).run();
  recordSessionAudit(session, {
    kind: "inventory",
    success: true,
    detail: `حذف وحدة «${unit.name}»`,
  });
  revalidateUnits();
  return { ok: true };
}
