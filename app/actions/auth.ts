"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

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
  if (!session || session.role !== "waiter") {
    redirect(`/pin/${venueId}`);
  }
  return session;
}

export async function requireCashier(venueId: string) {
  const session = await getSession();
  if (!session || session.role !== "cashier") {
    redirect(`/pin/${venueId}`);
  }
  return session;
}
