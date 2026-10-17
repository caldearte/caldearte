// The few clicks that show a visitor means to go (see the web_events
// migration, 20261016180000_add_web_events.sql, for why only these).
// Mirrors that table's CHECK on `event`.
export const TRACKED_EVENTS = ["directions", "add_to_calendar", "outbound_source", "outbound_instagram", "newsletter_signup"] as const;
export type TrackedEvent = (typeof TRACKED_EVENTS)[number];

// Fire-and-forget beacon to /api/track. sendBeacon survives the page
// opening a new tab or navigating away, which is exactly when these clicks
// happen. Sends no identifier of any kind — only what was clicked, on
// which page, and the host the visitor arrived from (document.referrer
// keeps the landing referrer across Next's client-side navigations).
// Never throws: a tracking failure must not break the click itself.
export function track(event: TrackedEvent, eventId?: string | null): void {
  try {
    let referrerHost: string | null = null;
    if (document.referrer) referrerHost = new URL(document.referrer).host;
    const body = JSON.stringify({ event, eventId: eventId ?? null, path: window.location.pathname, referrerHost });
    if (navigator.sendBeacon?.("/api/track", body)) return;
    fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // ignore
  }
}
