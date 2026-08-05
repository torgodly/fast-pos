import { authCookieOptions } from "./cookie-options";
import { COOKIE_NAME, SESSION_DAYS } from "./token";

type SessionCookie = {
  name: string;
  value: string;
  options: ReturnType<typeof authCookieOptions>;
};

export function sessionCookieValue(token: string): SessionCookie {
  return {
    name: COOKIE_NAME,
    value: token,
    options: authCookieOptions(SESSION_DAYS * 24 * 60 * 60),
  };
}

export function clearSessionCookieValue(): SessionCookie {
  return {
    name: COOKIE_NAME,
    value: "",
    options: { ...authCookieOptions(0), maxAge: 0 },
  };
}
