// Input guards for /api/social/flyer. That route is public and
// unauthenticated on purpose — the browser-side "Compartir" feature
// (shareInauguracionesCarousel.ts, a client component) calls it directly,
// so there's no secret it could carry. These checks bound what a stranger
// can make it do: no oversized text, and no fetching of internal/private
// addresses through the event-photo download (it runs server-side).
//
// Added 2026-10-04, right after GHSA-vcvr-r3jv-pc5j (RCE in Node
// next/og ImageResponse with request-controlled values) was patched by
// upgrading Next.js — defense in depth, not the fix itself.

// Generous next to real data (2026-10-04, approved events: longest title
// 114 chars, longest artist list 508, longest place name 96, longest image
// URL 222) so no real event is ever rejected.
export const FLYER_PARAM_MAX_LENGTH: Record<string, number> = {
  type: 20,
  title: 300,
  artist: 1000,
  placeName: 300,
  comuna: 100,
  region: 100,
  imageUrl: 2048,
  openingDatetime: 40,
  openingTimeConfirmed: 10,
  v: 5,
};

/** Returns an error message for the first over-long or unknown-but-huge param, or null if all fit. */
export function checkFlyerParamLengths(searchParams: URLSearchParams): string | null {
  for (const [key, value] of searchParams) {
    const max = FLYER_PARAM_MAX_LENGTH[key];
    if (max === undefined) continue; // unknown params are ignored by the route anyway
    if (value.length > max) return `Param '${key}' too long (${value.length} > ${max})`;
  }
  return null;
}

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata endpoints
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast/reserved
  );
}

function isPrivateIPv6(host: string): boolean {
  if (!host.startsWith("[")) return false;
  const h = host.slice(1, -1).toLowerCase();
  return (
    h === "::" ||
    h === "::1" ||
    h.startsWith("fc") ||
    h.startsWith("fd") || // unique local
    h.startsWith("fe8") ||
    h.startsWith("fe9") ||
    h.startsWith("fea") ||
    h.startsWith("feb") || // link-local
    h.startsWith("::ffff:") // IPv4-mapped — just refuse rather than re-parse
  );
}

/**
 * Parses and vets an event-photo URL before the server fetches it. Only
 * https to a public-looking hostname; `allowLocal` (dev only) also lets
 * http://localhost through so the route stays testable locally.
 * A literal-hostname check, not a DNS-resolution one — enough to stop the
 * obvious internal targets (metadata endpoint, localhost, RFC 1918).
 */
export function parsePublicImageUrl(raw: string, { allowLocal = false } = {}): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (allowLocal && isLocalHost && (url.protocol === "http:" || url.protocol === "https:")) return url;
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (
    isLocalHost ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") ||
    isPrivateIPv4(host) ||
    isPrivateIPv6(host)
  ) {
    return null;
  }
  return url;
}

/**
 * Downloads the event photo with the same explicit Accept header the route
 * always used (see route.tsx's comment on Squarespace's WebP negotiation),
 * following at most MAX_REDIRECTS hops and re-vetting each one, with a
 * timeout and a size cap.
 */
export async function fetchFlyerPhoto(
  raw: string,
  { allowLocal = false } = {},
): Promise<{ buffer: Buffer; contentType: string }> {
  let current = parsePublicImageUrl(raw, { allowLocal });
  if (!current) throw new Error("Event photo URL is not an allowed public https URL");

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, {
      headers: { Accept: "image/jpeg,image/png,image/gif" },
      redirect: "manual",
      signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`Event photo redirect (${res.status}) without a Location header`);
      const next = parsePublicImageUrl(new URL(location, current).toString(), { allowLocal });
      if (!next) throw new Error("Event photo redirected to a non-public URL");
      current = next;
      continue;
    }

    if (!res.ok) throw new Error(`Failed to fetch event photo (${res.status})`);
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/") || contentType.includes("webp")) {
      throw new Error(`Event photo resolved to an unsupported content-type (${contentType})`);
    }
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_PHOTO_BYTES) throw new Error(`Event photo too large (${declared} bytes)`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_PHOTO_BYTES) throw new Error(`Event photo too large (${buffer.length} bytes)`);
    return { buffer, contentType };
  }
  throw new Error(`Event photo exceeded ${MAX_REDIRECTS} redirects`);
}
