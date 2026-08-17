import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  COOKIE_NAME,
  verifyToken,
  type SessionPayload,
} from "./token";

export type { SessionPayload };
export { COOKIE_NAME, verifyToken };

export type AppSession = SessionPayload & {
  mustChangePin: boolean;
};

export async function getSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = db
    .select()
    .from(users)
    .where(eq(users.id, payload.userId))
    .get();

  if (!user || !user.active || user.role !== payload.role) {
    return null;
  }

  return {
    userId: user.id,
    name: user.name,
    role: user.role,
    venueId: payload.venueId,
    mustChangePin:
      (user.role === "waiter" || user.role === "cashier") &&
      Boolean(user.mustChangePin),
  };
}
