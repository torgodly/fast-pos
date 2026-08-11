"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/");
  return session;
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/admin/login");
  return session;
}

export async function requireWaiter(venueId: string) {
  const session = await getSession();
  if (
    !session ||
    session.role !== "waiter" ||
    session.venueId !== venueId
  ) {
    redirect(`/pin/${venueId}`);
  }
  return session;
}

export async function requireCashier(venueId: string) {
  const session = await getSession();
  if (
    !session ||
    session.role !== "cashier" ||
    session.venueId !== venueId
  ) {
    redirect(`/pin/${venueId}`);
  }
  return session;
}

export async function requireMainCashier(venueId: string) {
  const session = await requireCashier(venueId);
  const me = db.select().from(users).where(eq(users.id, session.userId)).get();
  if (!me?.isMainCashier) {
    redirect(`/cashier/${venueId}`);
  }
  return session;
}
