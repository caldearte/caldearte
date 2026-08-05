import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    // /login and /api/ are disallowed — /login is deliberately never
    // linked from the site's own UI (admin-only entry point), no reason
    // for a crawler to index it either.
    rules: { userAgent: "*", allow: "/", disallow: ["/login", "/api/"] },
    // www, not the apex — caldearte.com 308-redirects to www.caldearte.com
    // at the Vercel domain level. Pointing this at the apex made Google
    // Search Console's sitemap fetch fail ("Couldn't fetch") after
    // following the robots.txt-declared Sitemap: line into a redirect.
    sitemap: "https://www.caldearte.com/sitemap.xml",
  };
}
