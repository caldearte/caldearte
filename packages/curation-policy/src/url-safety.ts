// Real gap found in a 2026-08-17 security audit: nothing in this codebase
// validated a URL before fetching it, and several fetch call sites handle
// URLs extracted from arbitrary scraped HTML (og:image/twitter:image/
// JSON-LD image tags, a candidate's own sourceUrl) — a malicious or
// compromised source page could point one of those at an internal/
// link-local/cloud-metadata address. Real-world blast radius is low here
// (these run on a GitHub Actions runner, not Caldearte's own
// infrastructure — there's nothing internal to reach), but there was
// genuinely zero protection before this. Deliberately a literal
// hostname/IP-pattern check, not a DNS-resolution-based one: this stops
// the realistic case (a raw private-IP literal embedded in scraped HTML)
// at negligible cost; a DNS-rebinding attack (a public domain name that
// resolves to a private IP) is a meaningfully more sophisticated attack
// against a low-value target, not proportionate to build a resolver for
// here — revisit if that ever becomes a real, not hypothetical, concern.
const PRIVATE_OR_LOCAL_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./, // loopback
  /^0\.0\.0\.0$/,
  /^10\./, // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC1918
  /^192\.168\./, // RFC1918
  /^169\.254\./, // link-local — includes cloud metadata (169.254.169.254)
  /^\[?::1\]?$/, // IPv6 loopback
  /^\[?fc[0-9a-f]{2}:/i, // IPv6 unique local
  /^\[?fd[0-9a-f]{2}:/i, // IPv6 unique local
  /^\[?fe80:/i, // IPv6 link-local
];

// Only http(s) with a public-looking hostname is considered safe to fetch.
// Fails closed on anything unparseable, same posture as isSocialMediaUrl
// (page-fetch.ts) already uses for its own "never fetch it" default.
export function isSafeExternalUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const hostname = parsed.hostname.toLowerCase();
  return !PRIVATE_OR_LOCAL_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname));
}
