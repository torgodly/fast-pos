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

export function getSessionSecretBytes() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET is required in production. Set a strong random value.",
      );
    }
    return new TextEncoder().encode("fast-pos-dev-secret-change-me");
  }
  return new TextEncoder().encode(secret);
}

function getSecret() {
  return getSessionSecretBytes();
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
