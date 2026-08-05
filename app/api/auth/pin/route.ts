import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sessionCookieValue } from "@/lib/auth/cookie";
import { signSessionToken } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isVenueId } from "@/lib/venues";

export async function POST(request: Request) {
  let body: { venueId?: string; pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "طلب غير صالح" },
      { status: 400 },
    );
  }

  const venueId = String(body.venueId ?? "");
  const pin = String(body.pin ?? "");

  if (!isVenueId(venueId)) {
    return NextResponse.json({ error: "فرع غير صالح" }, { status: 400 });
  }
  if (!/^\d{4,6}$/.test(pin)) {
    return NextResponse.json(
      { error: "الرمز يجب أن يكون من 4 إلى 6 أرقام" },
      { status: 400 },
    );
  }

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
    return NextResponse.json(
      { error: "رمز الدخول غير صحيح" },
      { status: 401 },
    );
  }

  const token = await signSessionToken({
    userId: match.id,
    name: match.name,
    role: match.role,
    venueId,
  });

  const redirectTo =
    match.role === "waiter"
      ? `/waiter/${venueId}`
      : `/cashier/${venueId}`;

  const response = NextResponse.json({ ok: true, redirectTo });
  const session = sessionCookieValue(token);
  response.cookies.set(session.name, session.value, session.options);
  return response;
}
