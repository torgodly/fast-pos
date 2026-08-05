import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Auth is enforced in server pages/actions (Node). Edge proxy cannot read SESSION_SECRET reliably. */
export async function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/waiter/:path*", "/cashier/:path*"],
};
