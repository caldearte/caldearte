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
  },
};

export default nextConfig;
