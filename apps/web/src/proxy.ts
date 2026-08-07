import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Short-circuits known vulnerability-scanner probes (WordPress, common
// config/secret files, etc.) with a plain 404, before the request ever
// reaches a page/route handler — Caldearte runs none of this, so every
// hit here is pure noise (confirmed 2026-08-06: /wp-admin/install.php
// showed up in real Vercel usage data while investigating a Fast Origin
// Transfer spike). This alone won't be the fix for that spike (bot
// traffic volume here is tiny next to real page views), but it's free
// cleanup that stops those specific hits from invoking the app/DB at all.
const SCANNER_PATH_PATTERNS = [
  /^\/wp-/i, // wp-admin, wp-login.php, wp-content, wp-includes, wp-json, ...
  /^\/wordpress/i,
  /^\/xmlrpc\.php$/i,
  /^\/\.env/i,
  /^\/\.git/i,
  /^\/phpmyadmin/i,
  /^\/admin\.php$/i,
  /^\/config\.php$/i,
  /^\/vendor\/phpunit/i,
];

export function proxy(request: NextRequest) {
  if (SCANNER_PATH_PATTERNS.some((p) => p.test(request.nextUrl.pathname))) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  // Excludes _next/static, _next/image, and public assets — no reason for
  // this to run on every single request, only ones that could plausibly
  // be a scanner probe.
  matcher: ["/((?!_next/static|_next/image|icons|images|placeholders).*)"],
};
