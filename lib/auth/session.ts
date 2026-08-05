import { cookies } from "next/headers";
import { authCookieOptions } from "./cookie-options";
import {
  COOKIE_NAME,
  SESSION_DAYS,
  signSessionToken,
  verifyToken,
  type SessionPayload,
} from "./token";

export type { SessionPayload };
export { COOKIE_NAME, verifyToken };

export async function createSession(payload: SessionPayload) {
  const token = await signSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, authCookieOptions(SESSION_DAYS * 24 * 60 * 60));
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", { ...authCookieOptions(0), maxAge: 0 });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}
