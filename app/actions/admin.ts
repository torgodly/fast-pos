"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  categories,
  items,
  tables,
  users,
} from "@/lib/db/schema";
import { isVenueId } from "@/lib/venues";

async function assertAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("غير مصرح");
  }
  return session;
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

  if (!isVenueId(venueId) || !name || !categoryId || Number.isNaN(price)) {
    return;
  }

  if (id) {
    db.update(items)
      .set({ venueId, categoryId, name, price })
      .where(eq(items.id, id))
      .run();
  } else {
    db.insert(items)
      .values({ venueId, categoryId, name, price, active: true })
      .run();
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
