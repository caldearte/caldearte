// Newsletter — weekly digest, one email per confirmed subscriber. See
// docs/roadmap.md's Phase 1a punch list and docs/data-model.md for the
// full design. Deliberately honest about the discovery pipeline's actual
// cadence: event-discovery.yml's full comuna search only runs monthly
// (bright-sources-only runs weekly) — this module doesn't assume fresh
// discovery every week, it just summarizes whatever's currently approved
// and running, which is worthwhile on its own thanks to multi-week
// exhibition runs plus the weekly bright-source trickle.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@caldearte/shared-types";
import { getSupabaseClient } from "../lib/supabase-client.js";
import { sendDigestEmail, type DigestEvent, type DigestSection } from "../lib/notify.js";

type Subscriber = Pick<Tables<"newsletter_subscribers">, "id" | "email" | "admin_region_name" | "confirm_token">;
type EventRow = Tables<"events">;
// Subscription scope is the macro-región (Región Metropolitana, Valparaíso,
// etc — regions.admin_region_name), not the comuna — see the migration
// comment (20260730190000). Each event's own admin_region_name/comunaName
// is resolved once in run() via its region_id, since events itself only
// carries region_id, not either name directly.
type EventWithRegion = EventRow & { adminRegionName: string | null; comunaName: string | null };

const REMINDER_CAP = 3;
const OTHER_COMUNAS_CAP = 3;

export interface RunDeps {
  supabase?: SupabaseClient<Database>;
  now?: Date;
  sendDigestEmailFn?: typeof sendDigestEmail;
}

// Same "fixed Monday-Sunday week" convention as apps/web/src/lib/date.ts's
// weekBoundsInSantiago — "esta semana" means the same thing all week long,
// not a rolling 7-day window that changes every time this runs.
function weekBoundsInSantiago(now: Date): { start: string; end: string } {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now); // en-CA gives YYYY-MM-DD
  const [y, m, d] = todayStr.split("-").map(Number);
  const asUtc = new Date(Date.UTC(y, m - 1, d));
  const dow = asUtc.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(asUtc);
  monday.setUTCDate(asUtc.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

function isRunningOn(event: EventRow, dateStr: string): boolean {
  if (event.run_start_date && event.run_start_date > dateStr) return false;
  if (event.run_end_date && event.run_end_date < dateStr) return false;
  return true;
}

function toDigestEvent(event: EventWithRegion): DigestEvent {
  return {
    id: event.id,
    title: event.title,
    placeName: event.place_name ?? event.freeform_location,
    comunaName: event.comunaName,
    openingDatetime: event.opening_datetime,
    openingTimeConfirmed: event.opening_time_confirmed,
    runEndDate: event.run_end_date,
    imageUrl: event.image_url,
  };
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Builds the four sections for one subscriber's región out of the full
// approved/non-sensitive event pool already loaded for the run (avoids a
// per-subscriber query — the pool is small enough, see docs/data-model.md).
export function buildDigestSections(
  events: EventWithRegion[],
  adminRegionName: string,
  week: { start: string; end: string },
): DigestSection[] {
  const inRegion = events.filter((e) => e.adminRegionName === adminRegionName);
  const runningThisWeek = inRegion.filter((e) => isRunningOn(e, week.end));

  const openings = runningThisWeek.filter(
    (e) => e.opening_datetime && e.opening_datetime.slice(0, 10) >= week.start && e.opening_datetime.slice(0, 10) <= week.end,
  );
  const openingIds = new Set(openings.map((e) => e.id));

  // "New" means the exhibition's own run actually STARTS this week
  // (run_start_date), not when Haiku happened to curate it (created_at) —
  // real feedback after the first send: the pipeline's own curation
  // timing isn't what a reader means by "new," the exhibition's real
  // start date is.
  const newThisWeek = runningThisWeek.filter(
    (e) => !openingIds.has(e.id) && e.run_start_date && e.run_start_date >= week.start && e.run_start_date <= week.end,
  );
  const newIds = new Set(newThisWeek.map((e) => e.id));

  // Everything else already running (started before this week, still
  // open) — a plain "browse what's still on" list, capped and sorted
  // ending-soonest-first so it doubles as a nudge to catch it before it
  // closes.
  const alsoVisit = runningThisWeek
    .filter((e) => !openingIds.has(e.id) && !newIds.has(e.id))
    .sort((a, b) => (a.run_end_date ?? "9999-12-31").localeCompare(b.run_end_date ?? "9999-12-31"))
    .slice(0, REMINDER_CAP);

  const otherRegions = shuffle(events.filter((e) => e.adminRegionName !== adminRegionName && isRunningOn(e, week.end))).slice(
    0,
    OTHER_COMUNAS_CAP,
  );

  const sections: DigestSection[] = [];
  if (openings.length > 0) sections.push({ label: "Inauguraciones de esta semana", events: openings.map(toDigestEvent) });
  if (newThisWeek.length > 0) sections.push({ label: "Expos nuevas esta semana", events: newThisWeek.map(toDigestEvent) });
  if (alsoVisit.length > 0) sections.push({ label: "También puedes visitar", events: alsoVisit.map(toDigestEvent) });
  if (otherRegions.length > 0) sections.push({ label: "En otras regiones", events: otherRegions.map(toDigestEvent) });
  return sections;
}

export async function run(deps: RunDeps = {}): Promise<void> {
  const supabase = deps.supabase ?? getSupabaseClient();
  const now = deps.now ?? new Date();
  const week = weekBoundsInSantiago(now);

  const [subscribersRes, eventsRes, regionsRes] = await Promise.all([
    supabase
      .from("newsletter_subscribers")
      .select("id, email, admin_region_name, confirm_token")
      .not("confirmed_at", "is", null)
      .is("unsubscribed_at", null),
    supabase.from("events").select("*").eq("curation_status", "approved"),
    supabase.from("regions").select("id, name, admin_region_name"),
  ]);

  if (subscribersRes.error) throw new Error(`Failed to load newsletter_subscribers: ${subscribersRes.error.message}`);
  if (eventsRes.error) throw new Error(`Failed to load events: ${eventsRes.error.message}`);
  if (regionsRes.error) throw new Error(`Failed to load regions: ${regionsRes.error.message}`);

  const subscribers = (subscribersRes.data ?? []) as Subscriber[];
  const regionById = new Map((regionsRes.data ?? []).map((r) => [r.id, r]));
  const events: EventWithRegion[] = ((eventsRes.data ?? []) as EventRow[])
    .filter((e) => e.sensitivity_tags.length === 0)
    .map((e) => {
      const region = e.region_id ? regionById.get(e.region_id) : undefined;
      return { ...e, adminRegionName: region?.admin_region_name ?? null, comunaName: region?.name ?? null };
    });

  console.log(`[newsletter] ${subscribers.length} confirmed subscriber(s), ${events.length} eligible approved event(s), week ${week.start}..${week.end}`);

  let sent = 0;
  let skipped = 0;
  for (const subscriber of subscribers) {
    const sections = buildDigestSections(events, subscriber.admin_region_name, week);
    if (sections.length === 0) {
      skipped++;
      continue;
    }
    // Reuses the subscriber's own confirm_token as the unsubscribe token
    // too — one opaque value per subscriber is enough, see the migration
    // comment.
    await (deps.sendDigestEmailFn ?? sendDigestEmail)(subscriber.email, subscriber.confirm_token, sections);
    sent++;
  }

  console.log(`[newsletter] sent ${sent} digest(s), skipped ${skipped} subscriber(s) with nothing to show`);
}
