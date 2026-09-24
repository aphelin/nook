import { type NextRequest, NextResponse } from "next/server";

/**
 * Sends signed-out visitors to /login before any protected page renders.
 * The hint cookie grants nothing: every API call still needs a valid access token.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.get("nook_session")?.value === "1") return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/app/:path*", "/app"],
};
