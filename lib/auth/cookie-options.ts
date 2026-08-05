/** Cookie flags for LAN HTTP deployments (default) vs HTTPS production. */
export function authCookieOptions(maxAgeSeconds: number) {
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    process.env.COOKIE_SECURE === "1";

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
