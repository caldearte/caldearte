import { NextResponse } from "next/server";

// Short-circuits known vulnerability-scanner probes (WordPress, common
// config/secret files, exposed debug/admin endpoints, server-side script
// extensions this app never serves) with a plain 404, before the request
// ever reaches a page/route handler — Caldearte runs none of this, so
// every hit matching `config.matcher` below is pure noise (confirmed
// 2026-08-06: /wp-admin/install.php showed up in real Vercel usage data
// while investigating a Fast Origin Transfer spike). The actual pattern
// list lives in `config.matcher`, not here — see that export's own
// comment for why.
export function proxy() {
  // Reaching here at all means the matcher below already confirmed this
  // path looks like a scanner probe — no real route ever matches it.
  return new NextResponse(null, { status: 404 });
}

// Positive matcher — the INVERSE of the previous approach (which ran on
// almost every request and excluded a few static folders). Vercel's own
// guidance (vercel.com/docs/manage-cdn-usage#optimizing-fast-origin-transfer,
// checked 2026-08-06): Middleware/Proxy can accrue Fast Origin Transfer
// TWICE per request — once for the Proxy invocation, once for the page/
// function it's guarding — specifically warning to scope the matcher down
// to only what's necessary. Since this proxy's only job is blocking known
// scanner paths, it should never run at all for a real app route (/,
// /eventos/*, /api/*, ...) — only for paths matching the scanner patterns
// themselves, mirrored here as one matcher regex instead of in the
// function body.
// One entry, one outer capturing group around the whole alternation —
// Next's matcher parser (path-to-regexp) rejects a `*`/`.*` modifier that
// falls OUTSIDE a group (tried multiple separate entries first, several
// failed to even boot the dev server with "Unexpected MODIFIER, expected
// END"). Mirrors the shape of Next's own documented matcher example
// (`'/((?!api|_next/static|_next/image|.*\\.png$).*)'`) — a trailing
// `.*`/wildcard only ever appears immediately before that single closing
// `)`, never after it.
export const config = {
  matcher: [
    "/((?:wp-.*|wordpress.*|xmlrpc\\.php|\\.env.*|\\.git.*|\\.svn.*|\\.aws.*|\\.ssh.*|\\.idea.*|\\.vscode.*|\\.htaccess|\\.htpasswd|phpmyadmin.*|pma.*|admin\\.php|config\\.php|vendor/.*|laravel.*|telescope.*|_profiler.*|actuator.*|console|cgi-bin/.*|server-status|shell\\.php|eval-stdin\\.php|.*\\.(?:php\\d?|phtml|asp|aspx|jsp|jspx|cgi)))",
  ],
};
