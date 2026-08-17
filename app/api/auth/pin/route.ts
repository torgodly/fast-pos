import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sessionCookieValue } from "@/lib/auth/cookie";
import { findStaffMatchingPin, isValidPinFormat } from "@/lib/auth/pin";
import { signSessionToken } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isVenueId } from "@/lib/venues";

export async function POST(request: Request) {
  let body: { venueId?: string; pin?: string; userId?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const venueId = String(body.venueId ?? "");
  const pin = String(body.pin ?? "");
  const requestedUserId =
    body.userId != null && Number.isFinite(Number(body.userId))
      ? Number(body.userId)
      : null;

  if (!isVenueId(venueId)) {
    return NextResponse.json({ error: "فرع غير صالح" }, { status: 400 });
  }
  if (!isValidPinFormat(pin)) {
    return NextResponse.json(
      { error: "الرمز يجب أن يكون من 4 إلى 6 أرقام" },
      { status: 400 },
    );
  }

  const staff = db.select().from(users).where(eq(users.active, true)).all();
  const matches = findStaffMatchingPin(staff, pin);

  if (matches.length === 0) {
    return NextResponse.json(
      { error: "رمز الدخول غير صحيح" },
      { status: 401 },
    );
  }

  if (matches.length > 1 && requestedUserId == null) {
    return NextResponse.json({
      ok: true,
      needUserPick: true,
      candidates: matches.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
      })),
    });
  }

  const match =
    requestedUserId != null
      ? matches.find((m) => m.id === requestedUserId)
      : matches[0];

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

  const mustChangePin = Boolean(
    staff.find((u) => u.id === match.id)?.mustChangePin,
  );

  const redirectTo = mustChangePin
    ? `/pin/${venueId}/change-pin`
    : match.role === "waiter"
      ? `/waiter/${venueId}`
      : `/cashier/${venueId}`;

  const response = NextResponse.json({ ok: true, redirectTo });
  const session = sessionCookieValue(token);
  response.cookies.set(session.name, session.value, session.options);
  return response;
}
