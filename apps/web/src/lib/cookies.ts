export const CITY_COOKIE = "caldearte_city";
export const FAMILY_MODE_COOKIE = "caldearte_family_mode";
// "day" | "week" — which time window the visitor is viewing (Header's
// Día/Semana toggle). Absent cookie defaults to "week" — see page.tsx.
export const WINDOW_MODE_COOKIE = "caldearte_window_mode";

// Client-side only (writes document.cookie directly) — matches the
// 1-year expiry every preference cookie above already uses. Previously
// duplicated inline in CalendarView.tsx; shared here once a second
// caller (the event detail page's comuna link) needed the same logic.
export function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}`;
}
