import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sessionCookieValue } from "@/lib/auth/cookie";
import {
  checkRateLimit,
  clearAuthFailures,
  clientRateLimitKey,
  recordAuthFailure,
} from "@/lib/auth/rate-limit";
import { isValidPinFormat, matchStaffByPin } from "@/lib/auth/pin";
import { signSessionToken } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isVenueId } from "@/lib/venues";

export async function POST(request: Request) {
  let body: { venueId?: string; pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const venueId = String(body.venueId ?? "");
  const pin = String(body.pin ?? "");

  if (!isVenueId(venueId)) {
    return NextResponse.json({ error: "فرع غير صالح" }, { status: 400 });
  }
  if (!isValidPinFormat(pin)) {
    return NextResponse.json(
      { error: "الرمز يجب أن يكون من 4 إلى 6 أرقام" },
      { status: 400 },
    );
  }

  const rateKey = clientRateLimitKey(request, venueId);
  const rate = checkRateLimit(rateKey);
  if (!rate.ok) {
    return NextResponse.json(
      {
        error: `محاولات كثيرة. حاول بعد ${rate.retryAfterSec} ثانية`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      },
    );
  }

  const staff = db
    .select()
    .from(users)
    .where(eq(users.active, true))
    .all();

  const match = matchStaffByPin(staff, pin);

  if (!match) {
    const failure = recordAuthFailure(rateKey);
    return NextResponse.json(
      {
        error: failure.locked
          ? `محاولات كثيرة. حاول بعد ${failure.retryAfterSec} ثانية`
          : "رمز الدخول غير صحيح",
      },
      { status: failure.locked ? 429 : 401 },
    );
  }

  clearAuthFailures(rateKey);

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
