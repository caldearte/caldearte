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

type Subscriber = Pick<Tables<"newsletter_subscribers">, "id" | "email" | "city_id" | "confirm_token">;
type EventRow = Tables<"events">;

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

function toDigestEvent(event: EventRow): DigestEvent {
  return {
    title: event.title,
    placeName: event.place_name ?? event.freeform_location,
    openingDatetime: event.opening_datetime,
    runEndDate: event.run_end_date,
    sourceUrl: event.source_url,
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

// Builds the four sections for one subscriber's comuna out of the full
// approved/non-sensitive event pool already loaded for the run (avoids a
// per-subscriber query — the pool is small enough, see docs/data-model.md).
export function buildDigestSections(
  events: EventRow[],
  cityId: string,
  week: { start: string; end: string },
): DigestSection[] {
  const inCity = events.filter((e) => e.region_id === cityId);
  const runningThisWeek = inCity.filter((e) => isRunningOn(e, week.end));

  const openings = runningThisWeek.filter(
    (e) => e.opening_datetime && e.opening_datetime.slice(0, 10) >= week.start && e.opening_datetime.slice(0, 10) <= week.end,
  );
  const openingIds = new Set(openings.map((e) => e.id));

  const newThisWeek = runningThisWeek.filter(
    (e) => !openingIds.has(e.id) && e.created_at.slice(0, 10) >= week.start && e.created_at.slice(0, 10) <= week.end,
  );
  const newIds = new Set(newThisWeek.map((e) => e.id));

  const reminders = runningThisWeek
    .filter((e) => !openingIds.has(e.id) && !newIds.has(e.id))
    .sort((a, b) => (a.run_end_date ?? "9999-12-31").localeCompare(b.run_end_date ?? "9999-12-31"))
    .slice(0, REMINDER_CAP);

  const otherComunas = shuffle(events.filter((e) => e.region_id !== cityId && isRunningOn(e, week.end))).slice(0, OTHER_COMUNAS_CAP);

  const sections: DigestSection[] = [];
  if (openings.length > 0) sections.push({ label: "Inauguraciones de esta semana", events: openings.map(toDigestEvent) });
  if (newThisWeek.length > 0) sections.push({ label: "Expos nuevas esta semana", events: newThisWeek.map(toDigestEvent) });
  if (reminders.length > 0) sections.push({ label: "No te las pierdas", events: reminders.map(toDigestEvent) });
  if (otherComunas.length > 0) sections.push({ label: "En otras comunas", events: otherComunas.map(toDigestEvent) });
  return sections;
}

export async function run(deps: RunDeps = {}): Promise<void> {
  const supabase = deps.supabase ?? getSupabaseClient();
  const now = deps.now ?? new Date();
  const week = weekBoundsInSantiago(now);

  const [subscribersRes, eventsRes] = await Promise.all([
    supabase
      .from("newsletter_subscribers")
      .select("id, email, city_id, confirm_token")
      .not("confirmed_at", "is", null)
      .is("unsubscribed_at", null),
    supabase.from("events").select("*").eq("curation_status", "approved"),
  ]);

  if (subscribersRes.error) throw new Error(`Failed to load newsletter_subscribers: ${subscribersRes.error.message}`);
  if (eventsRes.error) throw new Error(`Failed to load events: ${eventsRes.error.message}`);

  const subscribers = (subscribersRes.data ?? []) as Subscriber[];
  const events = ((eventsRes.data ?? []) as EventRow[]).filter((e) => e.sensitivity_tags.length === 0);

  console.log(`[newsletter] ${subscribers.length} confirmed subscriber(s), ${events.length} eligible approved event(s), week ${week.start}..${week.end}`);

  let sent = 0;
  let skipped = 0;
  for (const subscriber of subscribers) {
    const sections = buildDigestSections(events, subscriber.city_id, week);
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
