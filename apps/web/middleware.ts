/**
 * Route protection.
 *
 * When Auth0 is configured, anonymous requests to anything other than
 * the public-list paths are redirected to /api/auth/login. When Auth0
 * is NOT configured (dev mode), the middleware is a transparent
 * pass-through — the demo runs as the seeded admin via the dev
 * fallback in @aegis/auth/server.
 *
 * The session cookie that @auth0/nextjs-auth0 sets is named "appSession"
 * by default. If your AUTH0_SESSION_COOKIE_NAME differs, update below.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/_next",
  "/api/health",
  "/api/auth/", // login, logout, callback, me, current-user
  "/favicon",
];

function isAuth0ConfiguredAtEdge(): boolean {
  // Edge middleware runs without Node `process.env` typings; the env is
  // injected at build time by Next.js for any var prefixed with NEXT_
  // OR explicitly listed in next.config.mjs's `env` block. We re-check
  // AUTH0_SECRET only — its presence is the binary on/off signal.
  return !!process.env.AUTH0_SECRET;
}

export function middleware(req: NextRequest) {
  if (!isAuth0ConfiguredAtEdge()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Quick session cookie check — no JWT validation here; the API routes
  // and getResolvedUser() do the real validation. This is a redirect
  // fast-path: no cookie → no session → kick to /api/auth/login.
  const session = req.cookies.get("appSession");
  if (!session?.value) {
    const loginUrl = new URL("/api/auth/login", req.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  // Match every request except Next internals, static assets, and the
  // public list (those still get the early-return above for clarity).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
