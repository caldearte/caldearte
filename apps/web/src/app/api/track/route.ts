import { geolocation } from "@vercel/functions";
import { getSupabaseClient } from "@/lib/supabase-client";
import { TRACKED_EVENTS } from "@/lib/track";

// Receives lib/track.ts's beacons and writes one anonymous row to
// web_events (see its migration, 20261016180000_add_web_events.sql). The
// full user agent and the IP are read here only to drop bots and bucket
// the device — neither is stored. Always answers 204, stored or not: a
// beacon can't read the response anyway, and a bot learns nothing.

// Meta's link-preview and AI crawlers (the facebook.com "visitors" in
// Vercel Analytics, 2026-10-16) plus the generic bot/crawler/headless
// markers. A bot that hides its UA still gets through — that's what the
// country column is for.
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|meta-external|headless|lighthouse|preview/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST_RE = /^[a-z0-9.-]{1,200}(:\d{1,5})?$/i;

interface TrackPayload {
  event?: unknown;
  eventId?: unknown;
  path?: unknown;
  referrerHost?: unknown;
}

function deviceOf(ua: string): "mobile" | "tablet" | "desktop" {
  if (/ipad|tablet|android(?!.*mobile)/i.test(ua)) return "tablet";
  if (/mobi|iphone|android/i.test(ua)) return "mobile";
  return "desktop";
}

const noContent = () => new Response(null, { status: 204 });

export async function POST(request: Request) {
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return noContent();
  // A beacon from caldearte.com's own pages is "same-origin"; any other
  // value means another site's page sent it. Requests without the header
  // at all (old browsers) are let through.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return noContent();

  let payload: TrackPayload;
  try {
    // sendBeacon with a string body arrives as text/plain, not JSON.
    payload = JSON.parse(await request.text());
  } catch {
    return noContent();
  }

  const { event, eventId, path, referrerHost } = payload;
  if (typeof event !== "string" || !(TRACKED_EVENTS as readonly string[]).includes(event)) return noContent();
  if (typeof path !== "string" || !path.startsWith("/") || path.length > 300) return noContent();
  if (eventId != null && (typeof eventId !== "string" || !UUID_RE.test(eventId))) return noContent();
  if (referrerHost != null && (typeof referrerHost !== "string" || !HOST_RE.test(referrerHost))) return noContent();

  const country = geolocation(request).country;

  const { error } = await getSupabaseClient()
    .from("web_events")
    .insert({
      event,
      event_id: (eventId as string | null) ?? null,
      path,
      referrer_host: (referrerHost as string | null)?.toLowerCase() ?? null,
      country: country && /^[A-Z]{2}$/.test(country) ? country : null,
      device: deviceOf(ua),
    });
  if (error) console.error("[track] insert failed", error);

  return noContent();
}
