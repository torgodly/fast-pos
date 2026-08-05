import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, verifyToken } from "@/lib/auth/token";
import type { SessionPayload } from "@/lib/auth/token";

function staffHome(session: SessionPayload) {
  const venue = session.venueId ?? "restaurant";
  return session.role === "waiter"
    ? `/waiter/${venue}`
    : `/cashier/${venue}`;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (pathname === "/") {
    if (session?.role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin/login")) {
    if (session?.role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    if (session?.role === "waiter" || session?.role === "cashier") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (!session || session.role !== "admin") {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/pin/")) {
    const venue = pathname.split("/")[2];
    if (session?.role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    if (session?.role === "waiter") {
      return NextResponse.redirect(new URL(`/waiter/${venue}`, request.url));
    }
    if (session?.role === "cashier") {
      return NextResponse.redirect(new URL(`/cashier/${venue}`, request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/waiter/")) {
    const venue = pathname.split("/")[2];
    if (session?.role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    if (session?.role === "cashier") {
      return NextResponse.redirect(new URL(staffHome(session), request.url));
    }
    if (!session || session.role !== "waiter") {
      return NextResponse.redirect(new URL(`/pin/${venue}`, request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/cashier/")) {
    const venue = pathname.split("/")[2];
    if (session?.role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    if (session?.role === "waiter") {
      return NextResponse.redirect(new URL(staffHome(session), request.url));
    }
    if (!session || session.role !== "cashier") {
      return NextResponse.redirect(new URL(`/pin/${venue}`, request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/pin/:path*",
    "/waiter/:path*",
    "/cashier/:path*",
  ],
};
