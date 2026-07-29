export const CITY_COOKIE = "caldearte_city";
export const FAMILY_MODE_COOKIE = "caldearte_family_mode";
// "day" | "week" — which time window the visitor is viewing (Header's
// Día/Semana toggle). Absent cookie defaults to "week" — see page.tsx.
export const WINDOW_MODE_COOKIE = "caldearte_window_mode";
// City picker "Últimas visitadas" row (CityPickerPanel) — JSON array of
// city ids, most-recent-first. See pushRecentCityId below.
export const RECENT_CITIES_COOKIE = "caldearte_recent_cities";
export const MAX_RECENT_CITIES = 3;

// Client-side only (writes document.cookie directly) — matches the
// 1-year expiry every preference cookie above already uses. Previously
// duplicated inline in CalendarView.tsx; shared here once a second
// caller (the event detail page's comuna link) needed the same logic.
export function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}`;
}

// Deliberately dumb/mechanical — no domain filtering here (excluding
// "otro", excluding the city being navigated TO, deduping against the
// city being navigated FROM) — that's CalendarView.tsx's job, the one
// place that actually knows what "a real visit" means. Malformed/tampered
// cookie content degrades to an empty list rather than throwing — this
// only ever feeds an optional convenience row in the city picker, never
// worth crashing the page over.
export function getRecentCityIds(): string[] {
  if (typeof document === "undefined") return [];
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${RECENT_CITIES_COOKIE}=([^;]*)`));
  if (!match) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]));
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecentCityId(cityId: string): void {
  const next = [cityId, ...getRecentCityIds().filter((id) => id !== cityId)].slice(0, MAX_RECENT_CITIES);
  setCookie(RECENT_CITIES_COOKIE, JSON.stringify(next));
}
