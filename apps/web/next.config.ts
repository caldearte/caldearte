import type { NextConfig } from "next";

// Every hostname currently behind an approved event's image_url (verified
// against production 2026-08-18, see the mobile-performance Lighthouse
// follow-up), plus our own Supabase Storage host (where Instagram/Facebook
// images get re-hosted — see apps/curator/src/lib/image-rehost.ts). This is
// NOT "unknown domains" the way the old unoptimized:true comment assumed —
// bright_source/headless images only ever come from the small, hand-curated
// set of venue sites registered in the curator's own source list, so a
// fixed allowlist is the right shape here, same posture as
// apps/curator/src/lib/url-safety.ts's own allowlist-over-open-proxy
// choice. Adding a new bright source whose images live on a not-yet-listed
// host will 400 here (loud, not silent) until its host is added below —
// that's an intentional tripwire, not a bug.
const EVENT_IMAGE_HOSTS = [
  "agendauc-prod.s3.amazonaws.com",
  "artes.uchile.cl",
  "ccesantiago.aecid.es",
  "cdn.cclm.cl",
  "cdn.prod.website-files.com",
  "centex.cultura.gob.cl",
  "centronacionaldearte.cultura.gob.cl",
  "chilecultura.gob.cl",
  "images.squarespace-cdn.com",
  "media.canal9.cl",
  "noticias.udec.cl",
  "parquecultural.cl",
  "static.arteinformado.com",
  "uchile.cl",
  "valpocultura.cl",
  "www.conaf.cl",
  "www.mhnv.gob.cl",
  "www.mnba.gob.cl",
  "www.molinomachmar.cl",
  "www.museodeancud.gob.cl",
  "www.museoregionalaysen.gob.cl",
  "www.utalca.cl",
];

function supabaseStorageHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ["@caldearte/shared-types"],
  // Hides the floating "N" dev-mode route indicator — errors still surface.
  devIndicators: false,
  images: {
    remotePatterns: [
      ...EVENT_IMAGE_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
      ...(supabaseStorageHost() ? [{ protocol: "https" as const, hostname: supabaseStorageHost()! }] : []),
    ],
    // Default is 4 hours. Event photos essentially never change at the same
    // URL once curated (each event is touched once; a real fix goes through
    // a new sourceUrl/imageUrl, a different cache key, not a same-URL swap),
    // so a short TTL only buys unnecessary re-transformations under real
    // traffic. 90 days keeps every monthly Vercel Image Optimization quota
    // (Transformations/Cache Writes/Reads/Storage) at the "new content only"
    // floor — verified against real usage 2026-08-18: ~140 events/mo with an
    // image, ~11-23% of the Transformations cap even in the first month's
    // one-time catalog catch-up.
    minimumCacheTTL: 7776000, // 90 days
    // 65 instead of Next's own default of 75 — event photos are photographic
    // content shown at card sizes (never full-bleed hero), where the
    // Lighthouse image-delivery-insight audit measured ~30-55% real savings
    // per image at 75 with no visible quality loss at card scale (verified
    // 2026-08-19). CardImage.tsx passes quality={65} to actually use this.
    qualities: [65, 75],
  },
};

export default nextConfig;
