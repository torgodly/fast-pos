import { SignJWT, jwtVerify } from "jose";
import type { UserRole, VenueId } from "@/lib/types";

export const COOKIE_NAME = "pos_session";
export const SESSION_DAYS = 7;

export type SessionPayload = {
  userId: number;
  name: string;
  role: UserRole;
  venueId: VenueId | null;
};

function getSecret() {
  const secret = process.env.SESSION_SECRET ?? "fast-pos-dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(payload: SessionPayload) {
  return new SignJWT({
    userId: payload.userId,
    name: payload.name,
    role: payload.role,
    venueId: payload.venueId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

export async function verifyToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = Number(payload.userId);
    const name = String(payload.name ?? "");
    const role = payload.role as UserRole;
    const venueId = (payload.venueId as VenueId | null) ?? null;

    if (!userId || !name || !role) return null;
    return { userId, name, role, venueId };
  } catch {
    return null;
  }
}
