// Superseded by REGION_COOKIE below (2026-08-12) — selection is now
// región-level everywhere, this stops being written entirely. Kept
// defined (not deleted) only in case any stray old-format cookie value
// needs to be recognized/ignored somewhere; no code should write it again.
export const CITY_COOKIE = "caldearte_city";
// The site's actual location-selection cookie — a región slug (see
// cities.ts's regionIdFromAdminRegionName), not a comuna id.
export const REGION_COOKIE = "caldearte_region";
export const FAMILY_MODE_COOKIE = "caldearte_family_mode";
// Filtros pills (FiltersSection) — both simple on/off, empty-string vs "1",
// same pattern as FAMILY_MODE_COOKIE. Everything always operates on the
// current Monday-Sunday week (see events.ts); these two just narrow what's
// shown within it — see page.tsx.
export const TODAY_FILTER_COOKIE = "caldearte_filter_today";
export const VIGENTES_FILTER_COOKIE = "caldearte_filter_vigentes";
// City picker "Últimas visitadas" row (CityPickerPanel) — JSON array of
// región ids, most-recent-first. See pushRecentRegionId below.
export const RECENT_REGIONS_COOKIE = "caldearte_recent_regions";
export const MAX_RECENT_REGIONS = 3;
// "granted" | "denied" — whether the visitor has already answered the
// first-visit GeoConsentBanner prompt (GeoConsentBanner.tsx). Set on
// EITHER answer, including a native browser permission denial or a
// getCurrentPosition error — once answered, never ask again, regardless
// of which way they answered.
export const GEO_CONSENT_COOKIE = "caldearte_geo_consent";
// The comuna id resolved from a real, granted geolocation reading (GPS/
// wifi via the browser, or the one-time banner grant) — durable, unlike
// page.tsx's own actualCityId computation from Vercel's per-request IP
// headers. Real bug found 2026-07-30: without this, "Tu ubicación actual"
// kept reverting to the coarse IP-based city (e.g. Santiago) after any
// navigation, even after the visitor had already granted a precise
// reading — this is the value that should win once it exists. Set by
// BOTH GeoConsentBanner (first-visit prompt) and CityPickerPanel's "Usar
// mi ubicación exacta" button — same durable signal either way.
export const PRECISE_CITY_COOKIE = "caldearte_precise_city";

// Client-side only (writes document.cookie directly) — matches the
// 1-year expiry every preference cookie above already uses. Previously
// duplicated inline in CalendarView.tsx; shared here once a second
// caller (the event detail page's comuna link) needed the same logic.
export function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}`;
}

// Client-side counterpart to setCookie — used by HomeClient.tsx to check
// whether the visitor's real cookies differ from the default page.tsx
// rendered (see that file's own comment). Same regex-parse approach as
// getRecentRegionIds below. Returns undefined both when the cookie is
// genuinely absent and when document isn't available yet (SSR) — callers
// only ever run this client-side, post-mount.
export function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

// Deliberately dumb/mechanical — no domain filtering here (excluding
// "otro", excluding the región being navigated TO, deduping against the
// región being navigated FROM) — that's CalendarView.tsx's job, the one
// place that actually knows what "a real visit" means. Malformed/tampered
// cookie content degrades to an empty list rather than throwing — this
// only ever feeds an optional convenience row in the city picker, never
// worth crashing the page over.
export function getRecentRegionIds(): string[] {
  if (typeof document === "undefined") return [];
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${RECENT_REGIONS_COOKIE}=([^;]*)`));
  if (!match) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]));
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecentRegionId(regionId: string): void {
  const next = [regionId, ...getRecentRegionIds().filter((id) => id !== regionId)].slice(0, MAX_RECENT_REGIONS);
  setCookie(RECENT_REGIONS_COOKIE, JSON.stringify(next));
}
