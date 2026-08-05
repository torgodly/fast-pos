import { NextResponse } from "next/server";
import { clearSessionCookieValue } from "@/lib/auth/cookie";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const cleared = clearSessionCookieValue();
  response.cookies.set(cleared.name, cleared.value, cleared.options);
  return response;
}
