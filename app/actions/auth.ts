"use server";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  clearSession,
  createSession,
  getSession,
} from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isVenueId } from "@/lib/venues";

export async function loginWithPin(venueId: string, pin: string) {
  if (!isVenueId(venueId)) {
    return { error: "فرع غير صالح" };
  }
  if (!/^\d{4,6}$/.test(pin)) {
    return { error: "الرمز يجب أن يكون من 4 إلى 6 أرقام" };
  }

  // Employees are shared across venues — PIN works on مطعم or كافيه
  const staff = db
    .select()
    .from(users)
    .where(eq(users.active, true))
    .all()
    .filter((u) => u.role === "waiter" || u.role === "cashier");

  const match = staff.find(
    (u) => u.pinHash && bcrypt.compareSync(pin, u.pinHash),
  );

  if (!match) {
    return { error: "رمز الدخول غير صحيح" };
  }

  await createSession({
    userId: match.id,
    name: match.name,
    role: match.role,
    venueId,
  });

  return {
    ok: true as const,
    redirectTo:
      match.role === "waiter"
        ? `/waiter/${venueId}`
        : `/cashier/${venueId}`,
  };
}

export async function loginAdmin(username: string, password: string) {
  const user = db
    .select()
    .from(users)
    .where(
      and(
        eq(users.username, username.trim()),
        eq(users.role, "admin"),
        eq(users.active, true),
      ),
    )
    .get();

  if (!user?.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
    return { error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
  }

  await createSession({
    userId: user.id,
    name: user.name,
    role: "admin",
    venueId: null,
  });

  return { ok: true as const, redirectTo: "/admin" };
}

export async function logout() {
  await clearSession();
  return { ok: true as const };
}

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

// Staff are shared across venues, so only the role is enforced here.
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
