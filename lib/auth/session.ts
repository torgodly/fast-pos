import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  verifyToken,
  type SessionPayload,
} from "./token";

export type { SessionPayload };
export { COOKIE_NAME, verifyToken };

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}
