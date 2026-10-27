import type { NextConfig } from "next";

import { EVENT_IMAGE_HOSTS, supabaseStorageHost } from "./src/lib/imageHosts";

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
    // A transformation is one (photo, width, quality) combo, so the number
    // of allowed widths multiplies straight into the monthly quota. Next's
    // defaults offer 15 widths (32px–3840px); 2026-10-27 we hit 75% of the
    // 5,000 Transformations cap with only 604 live event photos, after the
    // October home redesigns (#648, #671) added new `sizes` per card. Every
    // real rendering here fits in five: the 96px mobile thumbnail at 2x/3x
    // (256/384), cards at 33–100vw on phones and tablets (640/828), and
    // the ficha's 600px column at 2x (1080, close enough to 1200 for a
    // flyer). All five are Next's own defaults, so already-cached variants
    // at those widths keep being served from cache.
    imageSizes: [256, 384],
    deviceSizes: [640, 828, 1080],
  },
};

export default nextConfig;
