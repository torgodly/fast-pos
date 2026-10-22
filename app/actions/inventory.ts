"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { recordSessionAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  ingredientMovements,
  ingredients,
  itemIngredients,
  purchaseInvoiceLines,
  purchaseInvoices,
  suppliers,
} from "@/lib/db/schema";
import { gramsFromQuantity, type QuantityBasis } from "@/lib/inventory/rules";
import {
  adjustStock,
  receivePurchaseInvoice,
} from "@/lib/inventory/service";

type ActionResult = { ok: true } | { error: string };

type CreatePurchaseResult =
  | { ok: true; invoiceId: number; totalCost: number }
  | { error: string };

export type PurchaseInvoicePayload = {
  supplierId?: number | null;
  invoiceNumber?: string | null;
  note?: string | null;
  lines: Array<{
    ingredientId: number;
    qty: number;
    unitBasis: QuantityBasis;
    unitPrice: number;
  }>;
};

async function assertAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("غير مصرح");
  }
  return session;
}

function inventoryUser(session: { userId: number; name: string }) {
  return { userId: session.userId, name: session.name };
}

function revalidateInventory() {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/items");
  revalidatePath("/admin/purchases");
}

function revalidatePurchases(invoiceId?: number) {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/purchases");
  if (invoiceId) revalidatePath(`/admin/purchases/${invoiceId}`);
}

function ingredientNameTaken(name: string, excludeId?: number) {
  return db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(
      excludeId
        ? and(
            sql`lower(${ingredients.name}) = lower(${name})`,
            ne(ingredients.id, excludeId),
          )
        : sql`lower(${ingredients.name}) = lower(${name})`,
    )
    .get();
}

export async function upsertIngredient(
  formData: FormData,
): Promise<ActionResult> {
  await assertAdmin();
  const rawId = Number(formData.get("id"));
  const id = Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "اسم المكوّن مطلوب" };
  if (name.length > 80) return { error: "اسم المكوّن طويل جداً" };

  const lowStockValue = Number(formData.get("lowStockValue") ?? 0);
  const lowStockBasis: QuantityBasis =
    String(formData.get("lowStockBasis") ?? "g") === "kg" ? "kg" : "g";
  if (!Number.isFinite(lowStockValue) || lowStockValue < 0) {
    return { error: "حد التنبيه غير صالح" };
  }
  const lowStockGrams = gramsFromQuantity(lowStockValue, lowStockBasis);

  if (ingredientNameTaken(name, id ?? undefined)) {
    return { error: "يوجد مكوّن بهذا الاسم بالفعل" };
  }

  if (id) {
    const existing = db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(eq(ingredients.id, id))
      .get();
    if (!existing) return { error: "المكوّن غير موجود" };
    db.update(ingredients)
      .set({ name, lowStockGrams })
      .where(eq(ingredients.id, id))
      .run();
  } else {
    db.insert(ingredients)
      .values({ name, lowStockGrams, stockGrams: 0, active: true })
      .run();
  }

  revalidateInventory();
  return { ok: true };
}

export async function setIngredientActive(
  id: number,
  active: boolean,
): Promise<ActionResult> {
  await assertAdmin();
  const ingredient = db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(eq(ingredients.id, id))
    .get();
  if (!ingredient) return { error: "المكوّن غير موجود" };
  db.update(ingredients).set({ active }).where(eq(ingredients.id, id)).run();
  revalidateInventory();
  return { ok: true };
}

export async function deleteIngredient(id: number): Promise<ActionResult> {
  await assertAdmin();
  const ingredient = db
    .select({ id: ingredients.id, name: ingredients.name })
    .from(ingredients)
    .where(eq(ingredients.id, id))
    .get();
  if (!ingredient) return { error: "المكوّن غير موجود" };

  const usedInBom = db
    .select({ id: itemIngredients.id })
    .from(itemIngredients)
    .where(eq(itemIngredients.ingredientId, id))
    .get();
  if (usedInBom) {
    return { error: "لا يمكن حذف المكوّن — مرتبط بمكونات أصناف" };
  }

  const hasMovements = db
    .select({ id: ingredientMovements.id })
    .from(ingredientMovements)
    .where(eq(ingredientMovements.ingredientId, id))
    .get();
  if (hasMovements) {
    return { error: "لا يمكن حذف المكوّن — له حركات مخزون مسجّلة" };
  }

  const usedInPurchases = db
    .select({ id: purchaseInvoiceLines.id })
    .from(purchaseInvoiceLines)
    .where(eq(purchaseInvoiceLines.ingredientId, id))
    .get();
  if (usedInPurchases) {
    return { error: "لا يمكن حذف المكوّن — مستخدم في فواتير مشتريات" };
  }

  db.delete(ingredients).where(eq(ingredients.id, id)).run();
  revalidateInventory();
  return { ok: true };
}

export async function adjustIngredientStock(
  id: number,
  deltaGrams: number,
  note?: string | null,
): Promise<ActionResult & { stockGrams?: number }> {
  const session = await assertAdmin();
  try {
    const result = adjustStock({
      ingredientId: id,
      deltaGrams,
      note: note ?? null,
      user: inventoryUser(session),
    });
    recordSessionAudit(session, {
      kind: "inventory",
      success: true,
      detail: `تعديل يدوي #${id}: ${deltaGrams > 0 ? "+" : ""}${deltaGrams} غرام`,
    });
    revalidateInventory();
    return { ok: true, stockGrams: result.stockGrams };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "تعذر تعديل المخزون";
    return { error: detail };
  }
}

export async function upsertSupplier(
  formData: FormData,
): Promise<ActionResult> {
  await assertAdmin();
  const rawId = Number(formData.get("id"));
  const id = Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!name) return { error: "اسم المورد مطلوب" };
  if (name.length > 80) return { error: "اسم المورد طويل جداً" };

  const duplicate = db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(
      id
        ? and(
            sql`lower(${suppliers.name}) = lower(${name})`,
            ne(suppliers.id, id),
          )
        : sql`lower(${suppliers.name}) = lower(${name})`,
    )
    .get();
  if (duplicate) return { error: "يوجد مورد بهذا الاسم بالفعل" };

  if (id) {
    const existing = db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, id))
      .get();
    if (!existing) return { error: "المورد غير موجود" };
    db.update(suppliers)
      .set({ name, phone, notes })
      .where(eq(suppliers.id, id))
      .run();
  } else {
    db.insert(suppliers)
      .values({ name, phone, notes, active: true })
      .run();
  }

  revalidatePurchases();
  return { ok: true };
}

export async function setSupplierActive(
  id: number,
  active: boolean,
): Promise<ActionResult> {
  await assertAdmin();
  const supplier = db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.id, id))
    .get();
  if (!supplier) return { error: "المورد غير موجود" };
  db.update(suppliers).set({ active }).where(eq(suppliers.id, id)).run();
  revalidatePurchases();
  return { ok: true };
}

export async function deleteSupplier(id: number): Promise<ActionResult> {
  await assertAdmin();
  const supplier = db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.id, id))
    .get();
  if (!supplier) return { error: "المورد غير موجود" };

  const invoice = db
    .select({ id: purchaseInvoices.id })
    .from(purchaseInvoices)
    .where(eq(purchaseInvoices.supplierId, id))
    .get();
  if (invoice) {
    return { error: "لا يمكن حذف المورد — مرتبط بفواتير مشتريات" };
  }

  db.delete(suppliers).where(eq(suppliers.id, id)).run();
  revalidatePurchases();
  return { ok: true };
}

export async function createPurchaseInvoice(
  payload: PurchaseInvoicePayload,
): Promise<CreatePurchaseResult> {
  const session = await assertAdmin();

  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  if (lines.length === 0) return { error: "أضف بنداً واحداً على الأقل" };
  if (lines.length > 200) return { error: "عدد البنود كبير جداً" };

  const supplierId =
    typeof payload.supplierId === "number" && payload.supplierId > 0
      ? payload.supplierId
      : null;
  if (supplierId) {
    const supplier = db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .get();
    if (!supplier) return { error: "المورد غير موجود" };
  }

  try {
    const result = receivePurchaseInvoice({
      supplierId,
      invoiceNumber: payload.invoiceNumber ?? null,
      note: payload.note ?? null,
      lines,
      user: inventoryUser(session),
    });
    recordSessionAudit(session, {
      kind: "purchase",
      success: true,
      detail: `فاتورة مشتريات #${result.invoiceId} — ${result.totalCost.toFixed(2)}`,
    });
    revalidatePurchases(result.invoiceId);
    return {
      ok: true,
      invoiceId: result.invoiceId,
      totalCost: result.totalCost,
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "تعذر حفظ فاتورة المشتريات";
    try {
      recordSessionAudit(session, {
        kind: "purchase",
        success: false,
        detail,
      });
    } catch {
      /* audit is best-effort */
    }
    return { error: detail };
  }
}
