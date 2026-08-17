"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieValue } from "@/lib/auth/cookie";
import {
  hashStaffPin,
  isPinTakenByOther,
  isValidPinFormat,
  normalizePinDigits,
} from "@/lib/auth/pin";
import { getSession } from "@/lib/auth/session";
import { signSessionToken } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isVenueId } from "@/lib/venues";

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

function redirectIfMustChangePin(
  session: { mustChangePin: boolean },
  venueId: string,
) {
  if (session.mustChangePin) {
    redirect(`/pin/${venueId}/change-pin`);
  }
}

export async function requireWaiter(venueId: string) {
  const session = await getSession();
  if (!session || session.role !== "waiter") {
    redirect(`/pin/${venueId}`);
  }
  redirectIfMustChangePin(session, venueId);
  return session;
}

export async function requireCashier(venueId: string) {
  const session = await getSession();
  if (!session || session.role !== "cashier") {
    redirect(`/pin/${venueId}`);
  }
  redirectIfMustChangePin(session, venueId);
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

export async function changeStaffPin(formData: FormData): Promise<
  { ok: true; redirectTo: string } | { error: string }
> {
  const session = await getSession();
  if (
    !session ||
    (session.role !== "waiter" && session.role !== "cashier")
  ) {
    return { error: "غير مصرح" };
  }

  const venueId = String(formData.get("venueId") ?? "");
  const currentPin = normalizePinDigits(
    String(formData.get("currentPin") ?? ""),
  );
  const newPin = normalizePinDigits(String(formData.get("newPin") ?? ""));
  const confirmPin = normalizePinDigits(
    String(formData.get("confirmPin") ?? ""),
  );

  if (!isVenueId(venueId)) {
    return { error: "فرع غير صالح" };
  }
  if (
    !isValidPinFormat(currentPin) ||
    !isValidPinFormat(newPin) ||
    !isValidPinFormat(confirmPin)
  ) {
    return { error: "الرمز يجب أن يكون من 4 إلى 6 أرقام" };
  }
  if (newPin !== confirmPin) {
    return { error: "تأكيد الرمز غير مطابق" };
  }
  if (newPin === currentPin) {
    return { error: "الرمز الجديد لا يمكن أن يكون نفس الرمز القديم" };
  }

  const user = db.select().from(users).where(eq(users.id, session.userId)).get();
  if (!user?.pinHash || !user.active) {
    return { error: "المستخدم غير موجود" };
  }
  if (!bcrypt.compareSync(currentPin, user.pinHash)) {
    return { error: "الرمز الحالي غير صحيح" };
  }
  // Same as stored hash (covers mistyped "current" matching old via other paths)
  if (bcrypt.compareSync(newPin, user.pinHash)) {
    return { error: "الرمز الجديد لا يمكن أن يكون نفس الرمز القديم" };
  }

  const staff = db.select().from(users).all();
  if (isPinTakenByOther(staff, newPin, session.userId)) {
    return {
      error: "الرمز الجديد مستخدم من موظف آخر — اختر رمزاً مختلفاً",
    };
  }

  db.update(users)
    .set({
      pinHash: hashStaffPin(newPin),
      mustChangePin: false,
    })
    .where(eq(users.id, session.userId))
    .run();

  const token = await signSessionToken({
    userId: session.userId,
    name: session.name,
    role: session.role,
    venueId,
  });
  const cookie = sessionCookieValue(token);
  const cookieStore = await cookies();
  cookieStore.set(cookie.name, cookie.value, cookie.options);

  const redirectTo =
    session.role === "waiter"
      ? `/waiter/${venueId}`
      : `/cashier/${venueId}`;

  return { ok: true, redirectTo };
}
