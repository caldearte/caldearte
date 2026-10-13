// Hosts Vercel's image optimizer is allowed to fetch from — shared by
// next.config.ts (images.remotePatterns) and CardImage.tsx, which renders
// any OTHER host unoptimized instead of letting it break (2026-10-12).
//
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
// host used to 400 (and crash `next dev` outright) until its host was
// added below. Since 2026-10-12 CardImage renders an unlisted host's photo
// unoptimized — straight from the source, never through our optimizer,
// so the allowlist still keeps the optimizer from being an open proxy —
// and adding the host here is an optimization, not a fix for a broken
// image (5 of 85 home images were broken in production that day).
export const EVENT_IMAGE_HOSTS = [
  "agendauc-prod.s3.amazonaws.com",
  "artes.uchile.cl",
  "casaportugal.cl",
  "ccesantiago.aecid.es",
  "cdn.cclm.cl",
  "cdn.prod.website-files.com",
  "centex.cultura.gob.cl",
  "centronacionaldearte.cultura.gob.cl",
  "chilecultura.gob.cl",
  "elinsular.cl",
  "i0.wp.com",
  "images.squarespace-cdn.com",
  "mac.uchile.cl",
  "media.canal9.cl",
  "noticias.udec.cl",
  "parquecultural.cl",
  "static.arteinformado.com",
  // Added 2026-10-12 — found broken on the live home (400
  // INVALID_IMAGE_OPTIMIZE_REQUEST): Isabel Croxatto Galería and other
  // Artlogic-hosted galleries, Il Posto, Galería Hifas.
  "static-assets.artlogic.net",
  "uchile.cl",
  "valpocultura.cl",
  "walkingstgo.cl",
  "www.conaf.cl",
  "www.galeriahifas.cl",
  "www.ilposto.cl",
  "www.mgmistral.gob.cl",
  "www.mhnv.gob.cl",
  "www.mnba.gob.cl",
  "www.molinomachmar.cl",
  "www.museodeancud.gob.cl",
  "www.museoregionalaysen.gob.cl",
  "www.utalca.cl",
];

export function supabaseStorageHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// True when `url` can go through next/image's optimizer (its host is in
// the allowlist above). Client-safe: NEXT_PUBLIC_SUPABASE_URL is inlined.
export function isOptimizableImageUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (EVENT_IMAGE_HOSTS.includes(hostname) || hostname === supabaseStorageHost());
  } catch {
    return false;
  }
}
