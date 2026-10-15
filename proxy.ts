import { auth0 } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const ROLES_CLAIM = "https://time-4-action.com/roles";

export async function proxy(request: NextRequest) {
  const authResponse = await auth0.middleware(request);

  const { pathname } = request.nextUrl;

  // Allow auth flow and unauthorized page to pass through
  if (pathname.startsWith("/auth") || pathname === "/unauthorized") {
    return authResponse;
  }

  const session = await auth0.getSession(request);

  // Not logged in — auth0 middleware will handle redirect to login
  if (!session) return authResponse;

  const idToken = (session as any).tokenSet?.idToken;
  const tokenPayload = idToken
    ? JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString())
    : {};
  const roles = (tokenPayload[ROLES_CLAIM] as string[] | undefined) ?? [];

  if (!roles.includes("ai")) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return authResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt, static assets
     * - healthz (deploy health check)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|healthz|.*\\.svg|.*\\.png|.*\\.ico).*)",
  ],
};
