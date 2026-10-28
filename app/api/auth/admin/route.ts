import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  sessionCookieValue,
} from "@/lib/auth/cookie";
import {
  adminRateLimitKey,
  checkRateLimit,
  clearAuthFailures,
  recordAuthFailure,
} from "@/lib/auth/rate-limit";
import { signSessionToken } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function POST(request: Request) {
  const limitKey = adminRateLimitKey(request);
  const limited = checkRateLimit(limitKey);
  if (!limited.ok) {
    return NextResponse.json(
      {
        error: `محاولات دخول كثيرة. حاول مرة أخرى بعد ${limited.retryAfterSec} ثانية.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "طلب غير صالح" },
      { status: 400 },
    );
  }

  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  if (!username || !password) {
    return NextResponse.json(
      { error: "أدخل اسم المستخدم وكلمة المرور" },
      { status: 400 },
    );
  }

  const user = db
    .select()
    .from(users)
    .where(
      and(
        eq(users.username, username),
        eq(users.role, "admin"),
        eq(users.active, true),
      ),
    )
    .get();

  if (!user?.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
    recordAuthFailure(limitKey);
    return NextResponse.json(
      { error: "اسم المستخدم أو كلمة المرور غير صحيحة" },
      { status: 401 },
    );
  }

  clearAuthFailures(limitKey);

  const token = await signSessionToken({
    userId: user.id,
    name: user.name,
    role: "admin",
    venueId: null,
  });

  const response = NextResponse.json({
    ok: true,
    redirectTo: "/admin",
  });
  const session = sessionCookieValue(token);
  response.cookies.set(session.name, session.value, session.options);
  return response;
}
