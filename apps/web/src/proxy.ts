import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/sign-in",
  "/auth/callback",
  "/invite/",
  "/showcase",
  "/status",
  "/privacy",
];
// gr_session locally, gr_<env>_session elsewhere (e.g. gr_staging_session).
const SESSION_COOKIE = /^gr_([a-z]+_)?session$/;

/** Sends visitors without a session cookie to sign-in; validity is checked client-side. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (
    PUBLIC_PREFIXES.some(
      (p) =>
        pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`),
    )
  ) {
    return NextResponse.next();
  }
  const hasSession = request.cookies
    .getAll()
    .some((c) => SESSION_COOKIE.test(c.name));
  if (hasSession) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = `?redirectTo=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/|api/|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml|webmanifest)$).*)",
  ],
};
