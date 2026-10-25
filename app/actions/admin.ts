"use server";

import bcrypt from "bcryptjs";
import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import {
  hashStaffPin,
  isPinTakenByOther,
  isValidPinFormat,
  normalizePinDigits,
} from "@/lib/auth/pin";
import { db } from "@/lib/db";
import { isCounterMode } from "@/lib/deployment";
import { applyPartialReset, type ResetOptions } from "@/lib/db/reset";

export type FactoryResetOptions = ResetOptions;
import {
  cashierStations,
  categories,
  ingredients,
  itemIngredients,
  itemMovements,
  items,
  orderItems,
  orders,
  printers,
  purchaseInvoiceLines,
  tables,
  units,
  users,
} from "@/lib/db/schema";
import { quantityToBase, type UnitKind } from "@/lib/inventory/rules";
import { buildTestPrintBytes } from "@/lib/print/test-bytes";
import {
  clearBrandDetails,
  clearReceiptFooterMessage,
  resetZWindow,
  setBrandDetails,
  setReceiptFooterMessage,
  setZWindow,
} from "@/lib/settings";
import { validateBrandDetails } from "@/lib/brand";
import { printToPrinter } from "@/lib/print/network";
import {
  resolvePrinterAutoPrint,
  validateAutoPrintHost,
} from "@/lib/print/checkout-print-mode";
import { parseSystemPrinterRef } from "@/lib/print/system-printer-ref";
import { listSystemPrinters } from "@/lib/print/system";
import { recordSessionAudit } from "@/lib/audit";
import type {
  PrinterConnectionType,
  SystemPrinter,
  VenueId,
} from "@/lib/types";
import { isVenueId } from "@/lib/venues";
import {
  parseMenuVenueScope,
  scopeToVenueId,
} from "@/lib/menu/scope";
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

async function assertAdminOrMainCashier() {
  const session = await getSession();
  if (!session) throw new Error("غير مصرح");
  if (session.role === "admin") return session;
  if (session.role === "cashier") {
    const me = db.select().from(users).where(eq(users.id, session.userId)).get();
    if (me?.isMainCashier) return session;
  }
  throw new Error("غير مصرح");
}

function revalidateFloorMenu(venueId?: string | null) {
  revalidatePath("/admin/items");
  revalidatePath("/admin/tables");
  const venues = venueId
    ? [venueId]
    : (["restaurant", "cafe"] as const);
  for (const id of venues) {
    revalidatePath(`/cashier/${id}`);
    revalidatePath(`/cashier/${id}/items`);
    revalidatePath(`/cashier/${id}/tables`);
    revalidatePath(`/cashier/${id}/quick`);
    revalidatePath(`/waiter/${id}`);
  }
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
  // Printer moved venues: drop old station links.
  db.delete(cashierStations)
    .where(
      and(
        eq(cashierStations.printerId, printerId),
        ne(cashierStations.venueId, venueId),
      ),
    )
    .run();

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

  // One active cashier printer per venue.
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

function mergeSameNamedCategoriesInto(keepId: number, name: string) {
  const keepItems = db
    .select()
    .from(items)
    .where(eq(items.categoryId, keepId))
    .all();
  const byName = new Map(keepItems.map((item) => [item.name, item.id]));

  const dups = db
    .select()
    .from(categories)
    .where(and(eq(categories.name, name), ne(categories.id, keepId)))
    .all();

  for (const dup of dups) {
    const moving = db
      .select()
      .from(items)
      .where(eq(items.categoryId, dup.id))
      .all();
    for (const item of moving) {
      const existingId = byName.get(item.name);
      if (existingId) {
        db.update(orderItems)
          .set({ itemId: existingId })
          .where(eq(orderItems.itemId, item.id))
          .run();
        db.delete(items).where(eq(items.id, item.id)).run();
      } else {
        db.update(items)
          .set({ categoryId: keepId, venueId: null })
          .where(eq(items.id, item.id))
          .run();
        byName.set(item.name, item.id);
      }
    }
    db.delete(categories).where(eq(categories.id, dup.id)).run();
  }
}

function parseOptionalPrinterId(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function kitchenPrinterById(printerId: number, allowInactive: boolean) {
  const printer = db
    .select()
    .from(printers)
    .where(
      and(
        eq(printers.id, printerId),
        kitchenPrinterRolesFilter,
      ),
    )
    .get();
  if (!printer || (!allowInactive && !printer.active)) {
    return null;
  }
  return printer;
}

/**
 * Category printer fields accept a saved printer id or a `sys:` ref to a
 * Windows network printer. The ref is reused by host:port or created as a
 * shared network kitchen printer so the category can print immediately.
 */
function resolveCategoryPrinterRef(
  raw: FormDataEntryValue | null,
  label: string,
  allowInactive: boolean,
): { id: number | null; createdPrinter: boolean } | { error: string } {
  const value = String(raw ?? "").trim();
  if (!value) return { id: null, createdPrinter: false };

  const systemRef = parseSystemPrinterRef(value);
  if (systemRef) {
    const existing = db
      .select()
      .from(printers)
      .where(
        and(
          eq(printers.host, systemRef.host),
          eq(printers.port, systemRef.port),
        ),
      )
      .get();

    if (existing) {
      if (!supportsKitchen(existing.role)) {
        return {
          error: `${label}: الطابعة «${existing.name}» مضافة كفاتورة كاشير فقط — اجعل نوعها «مطبخ + فاتورة» من صفحة الطابعات`,
        };
      }
      if (!existing.active && !allowInactive) {
        return {
          error: `${label}: الطابعة «${existing.name}» معطّلة — فعّلها من صفحة الطابعات`,
        };
      }
      return { id: existing.id, createdPrinter: false };
    }

    const created = db
      .insert(printers)
      .values({
        venueId: null,
        name: systemRef.name,
        role: "kitchen",
        host: systemRef.host,
        port: systemRef.port,
        connectionType: "network",
        active: true,
      })
      .returning({ id: printers.id })
      .get();

    if (!created) {
      return { error: `${label}: تعذر إضافة طابعة النظام` };
    }
    return { id: created.id, createdPrinter: true };
  }

  const printerId = parseOptionalPrinterId(value);
  if (!printerId || !kitchenPrinterById(printerId, allowInactive)) {
    return { error: `${label} غير صالحة` };
  }
  return { id: printerId, createdPrinter: false };
}

export async function upsertCategory(formData: FormData): Promise<ActionResult> {
  await assertAdmin();
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const scope = parseMenuVenueScope(String(formData.get("venueScope") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const sortOrder = Number(formData.get("sortOrder") ?? 0);

  if (!scope || !name) {
    return { error: "بيانات التصنيف غير مكتملة" };
  }

  const venueId = scopeToVenueId(scope);
  const allowInactive = Boolean(id);

  let kitchenPrinterId: number | null = null;
  let restaurantKitchenPrinterId: number | null = null;
  let cafeKitchenPrinterId: number | null = null;
  let createdPrinter = false;

  if (scope === "shared") {
    const restaurant = resolveCategoryPrinterRef(
      formData.get("restaurantKitchenPrinterId"),
      "طابعة مطبخ المطعم",
      allowInactive,
    );
    if ("error" in restaurant) return restaurant;
    const cafe = resolveCategoryPrinterRef(
      formData.get("cafeKitchenPrinterId"),
      "طابعة مطبخ الكافيه",
      allowInactive,
    );
    if ("error" in cafe) return cafe;
    restaurantKitchenPrinterId = restaurant.id;
    cafeKitchenPrinterId = cafe.id;
    createdPrinter = restaurant.createdPrinter || cafe.createdPrinter;
  } else {
    const resolved = resolveCategoryPrinterRef(
      formData.get("kitchenPrinterId"),
      "طابعة المطبخ",
      allowInactive,
    );
    if ("error" in resolved) return resolved;
    kitchenPrinterId = resolved.id;
    createdPrinter = resolved.createdPrinter;
  }

  const values = {
    name,
    sortOrder,
    venueId,
    kitchenPrinterId: scope === "shared" ? null : kitchenPrinterId,
    restaurantKitchenPrinterId:
      scope === "shared"
        ? restaurantKitchenPrinterId
        : venueId === "restaurant"
          ? kitchenPrinterId
          : null,
    cafeKitchenPrinterId:
      scope === "shared"
        ? cafeKitchenPrinterId
        : venueId === "cafe"
          ? kitchenPrinterId
          : null,
  };

  if (id) {
    const existing = db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .get();
    if (!existing) return { error: "التصنيف غير موجود" };

    db.update(categories).set(values).where(eq(categories.id, id)).run();
    // Keep items in sync with the category scope (shared / cafe / restaurant).
    db.update(items)
      .set({ venueId })
      .where(eq(items.categoryId, id))
      .run();

    if (venueId == null) {
      mergeSameNamedCategoriesInto(id, name);
    }
  } else {
    const created = db
      .insert(categories)
      .values({ ...values, active: true })
      .returning()
      .get();
    if (venueId == null && created) {
      mergeSameNamedCategoriesInto(created.id, name);
    }
  }

  revalidatePath("/admin/items");
  if (createdPrinter) revalidatePath("/admin/printers");
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
  const categoryId = Number(formData.get("categoryId"));
  const name = String(formData.get("name") ?? "").trim();
  const price = Number(formData.get("price"));

  if (!name || !categoryId || Number.isNaN(price) || price < 0) {
    return { error: "بيانات الصنف غير مكتملة" };
  }

  const category = db
    .select()
    .from(categories)
    .where(eq(categories.id, categoryId))
    .get();
  if (!category) return { error: "التصنيف غير موجود" };

  const trackStock = formData.get("trackStock") === "on";
  let unitId: number | null = null;
  let lowStockBase = 0;
  let unit: typeof units.$inferSelect | null = null;

  if (trackStock) {
    unitId = Number(formData.get("unitId"));
    if (!Number.isInteger(unitId) || unitId <= 0) {
      return { error: "اختر وحدة بيع الصنف" };
    }
    unit =
      db.select().from(units).where(eq(units.id, unitId)).get() ?? null;
    if (!unit) return { error: "الوحدة غير موجودة" };

    const lowStockValue = Number(formData.get("lowStockValue") ?? 0);
    if (!Number.isFinite(lowStockValue) || lowStockValue < 0) {
      return { error: "حد التنبيه غير صالح" };
    }
    lowStockBase = quantityToBase(lowStockValue, unit.factorToBase);
  }

  const bom = parseBomJson(formData.get("ingredientsJson"));
  if (bom && "error" in bom) return { error: bom.error };

  if (trackStock && bom && bom.rows.length > 0) {
    return {
      error: "صنف متتبع المخزون لا يمكن أن يملك مكونات — اختر طريقة واحدة",
    };
  }

  let resolvedBom: Array<{ ingredientId: number; qtyBase: number }> = [];
  if (bom && bom.rows.length > 0) {
    const ingredientIds = bom.rows.map((row) => row.ingredientId);
    const ingredientRows = db
      .select({
        id: ingredients.id,
        preferredUnitId: ingredients.preferredUnitId,
        unitKind: units.kind,
        factorToBase: units.factorToBase,
      })
      .from(ingredients)
      .leftJoin(units, eq(ingredients.preferredUnitId, units.id))
      .where(inArray(ingredients.id, ingredientIds))
      .all();
    if (ingredientRows.length !== new Set(ingredientIds).size) {
      return { error: "أحد المكونات غير موجود" };
    }
    const byId = new Map(ingredientRows.map((row) => [row.id, row]));

    const bomUnitIds = [...new Set(bom.rows.map((row) => row.unitId))];
    const bomUnits = db
      .select()
      .from(units)
      .where(inArray(units.id, bomUnitIds))
      .all();
    const unitsById = new Map(bomUnits.map((row) => [row.id, row]));

    const resolved: Array<{ ingredientId: number; qtyBase: number }> = [];
    for (const row of bom.rows) {
      const ingredient = byId.get(row.ingredientId);
      const bomUnit = unitsById.get(row.unitId);
      if (!ingredient || !bomUnit) {
        return { error: "وحدة أحد المكونات غير صالحة" };
      }
      const ingredientKind: UnitKind =
        ingredient.unitKind === "count" ? "count" : "weight";
      if (bomUnit.kind !== ingredientKind) {
        return { error: "وحدة المكوّن غير متوافقة مع وحدته الأساسية" };
      }
      const qtyBase = quantityToBase(row.qty, bomUnit.factorToBase);
      if (qtyBase <= 0 || qtyBase > 1_000_000) {
        return { error: "كمية المكوّن يجب أن تكون أكبر من صفر" };
      }
      resolved.push({ ingredientId: row.ingredientId, qtyBase });
    }
    resolvedBom = resolved;
  }

  const existingItem = id
    ? db.select().from(items).where(eq(items.id, id)).get()
    : null;
  if (id && !existingItem) return { error: "الصنف غير موجود" };

  if (existingItem?.trackStock) {
    const hasHistory =
      existingItem.stockBase !== 0 ||
      !!db
        .select({ id: itemMovements.id })
        .from(itemMovements)
        .where(eq(itemMovements.itemId, existingItem.id))
        .get();
    if (hasHistory && trackStock && existingItem.unitId !== unitId) {
      return {
        error: "لا يمكن تغيير وحدة صنف له رصيد أو حركات مخزون — صفّر الرصيد أولاً",
      };
    }
    if (hasHistory && !trackStock) {
      return {
        error: "لا يمكن إيقاف تتبع المخزون لصنف له رصيد أو حركات — صفّر الرصيد أولاً",
      };
    }
  }

  const values = {
    venueId: category.venueId,
    categoryId,
    name,
    price,
    kitchenPrinterId: null as number | null,
    trackStock,
    unitId: trackStock ? unitId : null,
    lowStockBase: trackStock ? lowStockBase : 0,
  };

  db.transaction(() => {
    let itemId = id;
    if (id) {
      db.update(items).set(values).where(eq(items.id, id)).run();
    } else {
      const created = db
        .insert(items)
        .values({ ...values, stockBase: 0, active: true })
        .returning()
        .get();
      itemId = created.id;
    }

    if (itemId) {
      db.delete(itemIngredients)
        .where(eq(itemIngredients.itemId, itemId))
        .run();
      if (resolvedBom.length > 0) {
        db.insert(itemIngredients)
          .values(
            resolvedBom.map((row) => ({
              itemId: itemId!,
              ingredientId: row.ingredientId,
              qtyBase: row.qtyBase,
            })),
          )
          .run();
      }
    }
  });

  revalidatePath("/admin/items");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/units");
  return { ok: true };
}

type BomRowInput = { ingredientId: number; qty: number; unitId: number };

function parseBomJson(
  raw: FormDataEntryValue | null,
): { rows: BomRowInput[] } | { error: string } | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return { rows: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "بيانات مكونات الصنف غير صالحة" };
  }
  if (!Array.isArray(parsed)) {
    return { error: "بيانات مكونات الصنف غير صالحة" };
  }

  const rows: BomRowInput[] = [];
  const seen = new Set<number>();
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") {
      return { error: "بيانات مكونات الصنف غير صالحة" };
    }
    const value = entry as Record<string, unknown>;
    const ingredientId = Number(value.ingredientId);
    const qty = Number(value.qty);
    const unitId = Number(value.unitId);
    if (!Number.isInteger(ingredientId) || ingredientId <= 0) {
      return { error: "مكوّن غير صالح في قائمة المكونات" };
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return { error: "كمية المكوّن يجب أن تكون أكبر من صفر" };
    }
    if (!Number.isInteger(unitId) || unitId <= 0) {
      return { error: "وحدة المكوّن غير صالحة" };
    }
    if (seen.has(ingredientId)) continue;
    seen.add(ingredientId);
    rows.push({ ingredientId, qty, unitId });
  }
  return { rows };
}

export async function setItemActive(id: number, active: boolean) {
  const session = await assertAdminOrMainCashier();
  const item = db.select().from(items).where(eq(items.id, id)).get();
  if (!item) return;
  db.update(items).set({ active }).where(eq(items.id, id)).run();
  revalidateFloorMenu(item.venueId ?? session.venueId);
}

export async function deleteItem(id: number): Promise<ActionResult> {
  await assertAdmin();
  db.transaction(() => {
    db.delete(itemIngredients)
      .where(eq(itemIngredients.itemId, id))
      .run();
    db.update(orderItems)
      .set({ itemId: null })
      .where(eq(orderItems.itemId, id))
      .run();
    db.update(itemMovements)
      .set({ itemId: null })
      .where(eq(itemMovements.itemId, id))
      .run();
    db.update(purchaseInvoiceLines)
      .set({ itemId: null })
      .where(eq(purchaseInvoiceLines.itemId, id))
      .run();
    db.delete(items).where(eq(items.id, id)).run();
  });
  revalidatePath("/admin/items");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/units");
  return { ok: true };
}

export async function setItemsActive(
  ids: number[],
  active: boolean,
): Promise<ActionResult> {
  await assertAdminOrMainCashier();
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) return { error: "لم يُحدَّد أي صنف" };

  db.update(items).set({ active }).where(inArray(items.id, unique)).run();
  revalidateFloorMenu();
  return { ok: true };
}

export async function deleteItems(ids: number[]): Promise<ActionResult> {
  await assertAdmin();
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) return { error: "لم يُحدَّد أي صنف" };

  db.transaction(() => {
    db.delete(itemIngredients)
      .where(inArray(itemIngredients.itemId, unique))
      .run();
    db.update(orderItems)
      .set({ itemId: null })
      .where(inArray(orderItems.itemId, unique))
      .run();
    db.update(itemMovements)
      .set({ itemId: null })
      .where(inArray(itemMovements.itemId, unique))
      .run();
    db.update(purchaseInvoiceLines)
      .set({ itemId: null })
      .where(inArray(purchaseInvoiceLines.itemId, unique))
      .run();
    db.delete(items).where(inArray(items.id, unique)).run();
  });
  revalidateFloorMenu();
  revalidatePath("/admin/items");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/units");
  return { ok: true };
}

export async function moveItemsToCategory(
  ids: number[],
  categoryId: number,
): Promise<ActionResult> {
  await assertAdmin();
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) return { error: "لم يُحدَّد أي صنف" };

  const category = db
    .select()
    .from(categories)
    .where(eq(categories.id, categoryId))
    .get();
  if (!category) return { error: "التصنيف غير موجود" };

  db.update(items)
    .set({ categoryId: category.id, venueId: category.venueId })
    .where(inArray(items.id, unique))
    .run();
  revalidateFloorMenu();
  revalidatePath("/admin/items");
  return { ok: true };
}

export async function upsertTable(formData: FormData): Promise<ActionResult> {
  await assertAdminOrMainCashier();
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

  revalidateFloorMenu(venueId);
  return { ok: true };
}

export async function setTableActive(id: number, active: boolean) {
  await assertAdminOrMainCashier();
  const table = db.select().from(tables).where(eq(tables.id, id)).get();
  if (!table) return;
  db.update(tables).set({ active }).where(eq(tables.id, id)).run();
  revalidateFloorMenu(table.venueId);
}

export async function deleteTable(id: number): Promise<ActionResult> {
  await assertAdminOrMainCashier();
  const table = db.select().from(tables).where(eq(tables.id, id)).get();
  if (!table) return { error: "الطاولة غير موجودة" };
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
  revalidateFloorMenu(table.venueId);
  return { ok: true };
}

export async function upsertStaff(formData: FormData): Promise<ActionResult> {
  await assertAdmin();
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const pin = normalizePinDigits(String(formData.get("pin") ?? ""));
  const pinConfirm = normalizePinDigits(
    String(formData.get("pinConfirm") ?? ""),
  );
  const isMainCashier =
    role === "cashier" && formData.get("isMainCashier") === "on";

  if (!name || (role !== "waiter" && role !== "cashier")) {
    return { error: "بيانات الموظف غير مكتملة" };
  }
  if (isCounterMode() && role === "waiter") {
    return { error: "وضع الكاونتر لا يدعم دور السفرادجي" };
  }

  if (!id && !isValidPinFormat(pin)) {
    return { error: "رمز PIN يجب أن يكون من 4 إلى 6 أرقام" };
  }
  if (pin && !isValidPinFormat(pin)) {
    return { error: "رمز PIN يجب أن يكون من 4 إلى 6 أرقام" };
  }
  if (pin && pin !== pinConfirm) {
    return { error: "تأكيد الرمز غير مطابق — أعد إدخال نفس الأرقام" };
  }
  if (!pin && pinConfirm) {
    return { error: "أدخل الرمز الجديد ثم أكّده" };
  }

  const staff = db.select().from(users).all();

  if (pin && isPinTakenByOther(staff, pin, id)) {
    return { error: "رمز الدخول مستخدم من موظف آخر — اختر رمزاً مختلفاً" };
  }

  if (id) {
    const updates: {
      name: string;
      role: "waiter" | "cashier";
      venueId: null;
      pinHash?: string;
      isMainCashier: boolean;
      mustChangePin: boolean;
    } = {
      name,
      role: role as "waiter" | "cashier",
      venueId: null,
      isMainCashier: role === "cashier" ? isMainCashier : false,
      mustChangePin: false,
    };
    if (pin) {
      updates.pinHash = hashStaffPin(pin);
    }
    db.update(users).set(updates).where(eq(users.id, id)).run();

    // Verify the PIN we just stored actually matches (guards hash/save bugs).
    if (pin) {
      const saved = db.select().from(users).where(eq(users.id, id)).get();
      if (!saved?.pinHash || !bcrypt.compareSync(pin, saved.pinHash)) {
        return { error: "فشل حفظ الرمز — أعد المحاولة" };
      }
    }
  } else {
    const inserted = db
      .insert(users)
      .values({
        name,
        role: role as "waiter" | "cashier",
        venueId: null,
        pinHash: hashStaffPin(pin),
        isMainCashier: role === "cashier" ? isMainCashier : false,
        mustChangePin: false,
        active: true,
      })
      .returning({ id: users.id, pinHash: users.pinHash })
      .get();

    if (!inserted?.pinHash || !bcrypt.compareSync(pin, inserted.pinHash)) {
      return { error: "فشل حفظ الرمز — أعد المحاولة" };
    }
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

export async function getSystemPrinters(): Promise<
  { printers: SystemPrinter[] } | { error: string }
> {
  try {
    await assertAdmin();
    return { printers: await listSystemPrinters() };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "تعذر قراءة طابعات النظام",
    };
  }
}

export async function upsertPrinter(formData: FormData): Promise<ActionResult> {
  try {
    await assertAdmin();
    const id = formData.get("id") ? Number(formData.get("id")) : null;
    const venueRaw = String(formData.get("venueId") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const role = String(formData.get("role") ?? "");
    const connectionType = String(
      formData.get("connectionType") ?? "network",
    ) as PrinterConnectionType;
    const host = String(formData.get("host") ?? "").trim();
    const port = Number(formData.get("port") ?? 9100);
    const requestedAutoPrint =
      formData.get("autoPrint") === "on" ||
      formData.get("autoPrint") === "true";

    if (!isPrinterRole(role)) {
      return { error: "نوع الطابعة غير صالح" };
    }

    if (connectionType !== "network" && connectionType !== "local") {
      return { error: "طريقة اتصال الطابعة غير صالحة" };
    }

    if (supportsKitchen(role) && connectionType === "local") {
      return {
        error: "طابعة المطبخ تتطلب اتصال شبكة — استخدم IP أو طابعة شبكة من النظام",
      };
    }

    const resolvedConnection: PrinterConnectionType = connectionType;

    if (!name) {
      return { error: "بيانات الطابعة غير مكتملة" };
    }

    // Kitchen-only: no cashier department. Checkout / both: department is for cashier.
    let venueId: VenueId | null = null;
    if (role === "kitchen") {
      venueId = null;
    } else if (isVenueId(venueRaw)) {
      venueId = venueRaw;
    } else {
      return { error: "اختر قسم فاتورة الكاشير (مطعم أو كافيه)" };
    }

    if (resolvedConnection === "network" && !host) {
      return { error: "عنوان IP مطلوب لطابعة الشبكة" };
    }

    const resolvedHost =
      resolvedConnection === "local" ? host.trim() || "default" : host;

    const autoPrint = resolvePrinterAutoPrint(
      role,
      resolvedConnection,
      requestedAutoPrint,
    );
    const autoPrintError = validateAutoPrintHost(
      resolvedConnection,
      autoPrint,
      resolvedHost,
    );
    if (autoPrintError) {
      return { error: autoPrintError };
    }

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
      autoPrint,
    };

    let printerId = id && Number.isFinite(id) ? id : null;

    if (printerId) {
      db.update(printers).set(values).where(eq(printers.id, printerId)).run();
    } else {
      // Same IP already exists → update that row (avoids "it won't add" ghosts).
      const existingByHost =
        resolvedConnection === "network"
          ? db
              .select()
              .from(printers)
              .where(
                and(eq(printers.host, resolvedHost), eq(printers.port, values.port)),
              )
              .get()
          : null;

      if (existingByHost) {
        printerId = existingByHost.id;
        db.update(printers)
          .set({ ...values, active: true })
          .where(eq(printers.id, printerId))
          .run();
      } else {
        const inserted = db
          .insert(printers)
          .values({ ...values, active: true })
          .returning({ id: printers.id })
          .get();
        printerId = inserted?.id ?? null;
        if (!printerId) {
          return { error: "فشل حفظ الطابعة" };
        }
      }
    }

    if (supportsCheckout(role) && printerId && venueId) {
      syncCheckoutStation(venueId, printerId, name);
    } else if (printerId) {
      db.delete(cashierStations)
        .where(eq(cashierStations.printerId, printerId))
        .run();
    }

    revalidatePrinters();
    return { ok: true };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "فشل حفظ الطابعة";
    return { error: detail };
  }
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
  db.update(categories)
    .set({ restaurantKitchenPrinterId: null })
    .where(eq(categories.restaurantKitchenPrinterId, id))
    .run();
  db.update(categories)
    .set({ cafeKitchenPrinterId: null })
    .where(eq(categories.cafeKitchenPrinterId, id))
    .run();
  db.delete(printers).where(eq(printers.id, id)).run();
  revalidatePrinters();
  return { ok: true };
}

export async function testPrinter(
  printerId: number,
): Promise<{ error: string } | { ok: true; message: string }> {
  const session = await assertAdmin();
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
      error: printer.autoPrint
        ? "الطباعة التلقائية — تُختبر عند إتمام عملية الدفع"
        : "طابعة Chrome — تُطبع من جهاز الكاشير عند الدفع (نافذة طباعة المتصفح)",
    };
  }

  try {
    const data = await buildTestPrintBytes(printer.name);
    await printToPrinter({
      host: printer.host,
      port: printer.port,
      data,
    });
    recordSessionAudit(session, {
      venueId: printer.venueId,
      kind: "test",
      printerName: printer.name,
      success: true,
      detail: `اختبار ${printer.name} (${printer.host})`,
    });
    return {
      ok: true,
      message: `تم إرسال صفحة الاختبار إلى ${printer.name} (${printer.host})`,
    };
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : `تعذر الاتصال بالطابعة ${printer.name}`;
    recordSessionAudit(session, {
      venueId: printer.venueId,
      kind: "test",
      printerName: printer.name,
      success: false,
      detail,
    });
    return { error: detail };
  }
}

function revalidateAfterSystemReset() {
  revalidatePath("/admin");
  revalidatePath("/admin/staff");
  revalidatePath("/admin/printers");
  revalidatePath("/admin/items");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/invoices");
  revalidatePath("/admin/audit");
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

export async function saveReceiptSettings(input: {
  message: string;
  brandName: string;
  brandPhone: string;
  brandAddress: string;
}): Promise<ActionResult> {
  await assertAdmin();
  const brand = {
    name: input.brandName,
    phone: input.brandPhone,
    address: input.brandAddress,
  };
  const brandError = validateBrandDetails(brand);
  if (brandError) return { error: brandError };

  setReceiptFooterMessage(input.message);
  setBrandDetails(brand);
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function resetReceiptSettings(): Promise<ActionResult> {
  await assertAdmin();
  clearReceiptFooterMessage();
  clearBrandDetails();
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function saveZWindowSettings(
  start: string,
  end: string,
  venueId: string,
): Promise<ActionResult> {
  await assertAdmin();
  if (!isVenueId(venueId)) {
    return { error: "فرع غير صالح" };
  }
  const startOk = /^\d{1,2}:\d{2}$/.test(start.trim());
  const endOk = /^\d{1,2}:\d{2}$/.test(end.trim());
  if (!startOk || !endOk) {
    return { error: "صيغة الوقت غير صحيحة (HH:MM)" };
  }
  setZWindow(start, end, venueId);
  revalidatePath("/admin/settings");
  revalidatePath(`/cashier/${venueId}/shift`);
  return { ok: true };
}

export async function resetZWindowSettings(
  venueId: string,
): Promise<ActionResult> {
  await assertAdmin();
  if (!isVenueId(venueId)) {
    return { error: "فرع غير صالح" };
  }
  resetZWindow(venueId);
  revalidatePath("/admin/settings");
  revalidatePath(`/cashier/${venueId}/shift`);
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
