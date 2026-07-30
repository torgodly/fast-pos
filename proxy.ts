import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, verifyToken } from "@/lib/auth/token";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!session || session.role !== "admin") {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // Staff can work at any venue, so only the role is checked.
  if (pathname.startsWith("/waiter/")) {
    const venue = pathname.split("/")[2];
    if (!session || session.role !== "waiter") {
      return NextResponse.redirect(new URL(`/pin/${venue}`, request.url));
    }
  }

  if (pathname.startsWith("/cashier/")) {
    const venue = pathname.split("/")[2];
    if (!session || session.role !== "cashier") {
      return NextResponse.redirect(new URL(`/pin/${venue}`, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/waiter/:path*", "/cashier/:path*"],
};
