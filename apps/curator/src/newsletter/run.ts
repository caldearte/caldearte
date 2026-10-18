// Newsletter — weekly digest, one email per confirmed subscriber, sent
// Thursday evening about the coming Friday-Sunday (since 2026-10-16, see
// editionBoundsInSantiago). See
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
import { OPENINGS_LABEL, sendDigestEmail, type DigestEvent, type DigestSection } from "../lib/notify.js";
import { generateDigestTexts, type DigestTexts } from "./intro.js";
import { shortRegionName } from "../lib/regionNames.js";

type Subscriber = Pick<Tables<"newsletter_subscribers">, "id" | "email" | "admin_region_name" | "confirm_token">;
type EventRow = Tables<"events">;
// Subscription scope is the macro-región (Región Metropolitana, Valparaíso,
// etc — regions.admin_region_name), not the comuna — see the migration
// comment (20260730190000). Each event's own admin_region_name/comunaName
// is resolved once in run() via its region_id, since events itself only
// carries region_id, not either name directly.
type EventWithRegion = EventRow & { adminRegionName: string | null; comunaName: string | null };

const SITE_URL = "https://www.caldearte.com";

export interface RunDeps {
  supabase?: SupabaseClient<Database>;
  now?: Date;
  sendDigestEmailFn?: typeof sendDigestEmail;
  generateDigestTextsFn?: typeof generateDigestTexts;
}

// The period this digest announces: Thursday to Sunday (Daniel,
// 2026-10-18; Friday-Sunday since 2026-10-16). Thursday is the busiest
// opening day — over 13 weeks, 68 openings nationwide against 47 Fridays,
// 53 Saturdays and 3 Sundays — and every Santiago Thursday opening known
// before it happened was already known by Wednesday night (28 of 28), so
// a Thursday-morning send loses nothing by including it. The old 19:00
// send couldn't: most Thursday openings start 17:00-19:00. Friday-Sunday
// coverage barely moves with the earlier send (Santiago, openings known
// before they happened: 34/48 by Thursday 08:00 vs 36/48 by 19:00).
// Run Monday-Thursday it's this week's Thursday-Sunday; run Friday-Sunday
// (a late or manual send) it's the one already under way. The returned
// `start`/`end` keep the `week` naming used throughout this file and
// lib/notify.ts — it's the digest's period.
export function editionBoundsInSantiago(now: Date): { start: string; end: string } {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now); // en-CA gives YYYY-MM-DD
  const [y, m, d] = todayStr.split("-").map(Number);
  const asUtc = new Date(Date.UTC(y, m - 1, d));
  const dow = asUtc.getUTCDay(); // 0=Sun..6=Sat
  const thursdayOffset = dow === 0 ? -3 : 4 - dow;
  const thursday = new Date(asUtc);
  thursday.setUTCDate(asUtc.getUTCDate() + thursdayOffset);
  const sunday = new Date(thursday);
  sunday.setUTCDate(thursday.getUTCDate() + 3);
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  return { start: fmt(thursday), end: fmt(sunday) };
}

// Mirrors apps/web/src/lib/date.ts's anchorDateOnly/activeRange — the
// site's own definition of "showing this week" (its home page keeps an
// event when this range overlaps the current Mon-Sun week), so every
// count this digest prints matches what a reader sees after clicking
// through. A missing run_end_date means a one-day event on its anchor
// date, NOT "still running." Real bug found 2026-10-04: this used to be
// isRunningOn(event, week.end), which treated a missing run_start_date/
// run_end_date as always running — and since approved events are kept
// forever, every exhibition with no known closing date stayed "active"
// indefinitely. The nationwide count only ever grew (41 on 2026-08-09,
// 218 on 2026-10-04) while the site showed ~105 for that same week.
function activeRange(event: EventRow): { start: string; end: string } | null {
  const anchor = event.opening_datetime?.slice(0, 10) ?? event.run_start_date ?? event.run_end_date;
  if (!anchor) return null;
  return { start: event.run_start_date ?? anchor, end: event.run_end_date ?? anchor };
}

function isActiveInWeek(event: EventRow, week: { start: string; end: string }): boolean {
  const range = activeRange(event);
  return range !== null && range.start <= week.end && week.start <= range.end;
}

function isDatedInWeek(event: EventRow, week: { start: string; end: string }): boolean {
  return Boolean(event.opening_datetime && event.opening_datetime.slice(0, 10) >= week.start && event.opening_datetime.slice(0, 10) <= week.end);
}

// Added 2026-08-29 alongside events.event_type: openings/visitasGuiadas
// both read opening_datetime (the same field), so without the type check
// a "visita guiada" would show up under "Inauguraciones de esta semana"
// as if it were the exhibition's own opening — the exact bug that
// prompted event_type to exist. See packages/curation-policy/src/policy.ts's
// EVENT_TYPE_POLICY.
function isOpeningInWeek(event: EventRow, week: { start: string; end: string }): boolean {
  return event.event_type === "inauguracion" && isDatedInWeek(event, week);
}

function isVisitaGuiadaInWeek(event: EventRow, week: { start: string; end: string }): boolean {
  return event.event_type === "visita_guiada" && isDatedInWeek(event, week);
}

function toDigestEvent(event: EventWithRegion, week: { start: string; end: string }): DigestEvent {
  return {
    id: event.id,
    title: event.title,
    placeName: event.place_name ?? event.freeform_location,
    comunaName: event.comunaName,
    openingDatetime: event.opening_datetime,
    openingTimeConfirmed: event.opening_time_confirmed,
    runEndDate: event.run_end_date,
    imageUrl: event.image_url,
    // Type-aware (not just "has a dated instance this week") — a visita
    // guiada card must never show the "abre esta semana" badge, that's
    // specifically what event_type exists to distinguish now.
    isOpeningThisWeek: isOpeningInWeek(event, week),
  };
}

export interface DigestSectionsResult {
  sections: DigestSection[];
  // True total for the región this week — openings + new + every
  // "también visitar" candidate, NOT just what's capped/rendered. Fed to
  // generateDigestTexts so it can cite a real number instead of counting
  // the (possibly truncated) list it was handed, and used for the "ver
  // todas" link's own count — real bug found 2026-07-31: the link and the
  // AI intro each quoted a different, both-wrong count.
  regionTotalThisWeek: number;
}

// Builds the (up to) three sections for one subscriber's región out of the full
// approved/non-sensitive event pool already loaded for the run (avoids a
// per-subscriber query — the pool is small enough, see docs/data-model.md).
export function buildDigestSections(
  events: EventWithRegion[],
  adminRegionName: string,
  week: { start: string; end: string },
): DigestSectionsResult {
  const inRegion = events.filter((e) => e.adminRegionName === adminRegionName);
  // visita_guiada events are excluded from the general "running this
  // week"/"expos para visitar" pool below — a guided-tour instance isn't
  // itself "the exhibition, available to visit any time," so it would
  // otherwise leak into "Expos para visitar" on its own date. It gets its
  // own section instead, built from `inRegion` directly, below.
  const runningThisWeek = inRegion.filter((e) => e.event_type !== "visita_guiada" && isActiveInWeek(e, week));

  const openings = runningThisWeek.filter((e) => isOpeningInWeek(e, week));
  const openingIds = new Set(openings.map((e) => e.id));

  const visitasGuiadas = inRegion.filter((e) => isVisitaGuiadaInWeek(e, week));

  // Everything not opening this week goes in one pool, treated equally —
  // sorted ending-soonest first so it doubles as a nudge to catch it
  // before it closes. No separate "Expos nuevas esta semana" split by
  // run_start_date (removed 2026-08-08, user feedback: an inauguración
  // already IS how a new exhibition starts — a second "new" bucket read
  // as confusing, not clarifying). No longer capped/diversified either
  // (removed 2026-09-27 alongside the section going compact) — it never
  // renders individual cards anymore, so there's nothing left to cap.
  const alsoVisitAll = runningThisWeek
    .filter((e) => !openingIds.has(e.id))
    .sort((a, b) => (a.run_end_date ?? "9999-12-31").localeCompare(b.run_end_date ?? "9999-12-31"));

  // Exposiciones only (a visita guiada isn't one), like the región's own
  // count below.
  const otherRegionsAll = events.filter(
    (e) => e.adminRegionName !== adminRegionName && e.event_type !== "visita_guiada" && isActiveInWeek(e, week),
  );

  // Only skip the subscriber entirely if there's truly nothing anywhere —
  // not even something to point at in another región. Otherwise the
  // digest always sends, using emptyMessage below to say so explicitly
  // rather than just omitting a section and leaving the reader guessing
  // whether that's a bug or genuinely nothing this week.
  const hasAnyContent = openings.length > 0 || visitasGuiadas.length > 0 || alsoVisitAll.length > 0 || otherRegionsAll.length > 0;
  if (!hasAnyContent) return { sections: [], regionTotalThisWeek: 0 };

  const regionTotalThisWeek = openings.length + alsoVisitAll.length;
  const regionShort = shortRegionName(adminRegionName);

  const sections: DigestSection[] = [];

  sections.push({
    label: OPENINGS_LABEL,
    events: openings.map((e) => toDigestEvent(e, week)),
    emptyMessage:
      openings.length === 0 ? "No hemos encontrado ninguna inauguración de jueves a domingo aún. Si sabes de una, avísanos." : undefined,
  });

  // Compact + always shown (2026-09-27, Daniel: the digest's primary
  // content is inauguraciones only — visitas guiadas and exposiciones
  // vigentes are demoted to a count instead of full cards, and shown even
  // at zero so their absence reads as a real "none this week" rather than
  // an unexplained gap.
  sections.push({
    label: "Visitas guiadas de jueves a domingo",
    events: visitasGuiadas.map((e) => toDigestEvent(e, week)),
    compact: true,
    emptyMessage: visitasGuiadas.length === 0 ? "Ninguna visita guiada programada de jueves a domingo." : undefined,
  });

  // The link names the same number it links to (2026-10-18: it used to
  // say 48 "vigentes", openings included, next to "47 expos para
  // visitar"), with the región's short name, as the rest of the email.
  sections.push({
    label: "Expos para visitar de jueves a domingo",
    events: alsoVisitAll.map((e) => toDigestEvent(e, week)),
    compact: true,
    emptyMessage:
      alsoVisitAll.length === 0 ? "No hemos encontrado exposiciones para visitar de jueves a domingo aún. Si sabes de una, avísanos." : undefined,
    moreLink:
      alsoVisitAll.length > 0
        ? { label: `Ver las ${alsoVisitAll.length} exposiciones en cartelera en ${regionShort}`, url: SITE_URL }
        : undefined,
  });

  // Compact too since 2026-10-18 (was 10 cards and its own AI paragraph):
  // a reader in Santiago got four phone screens of shows they can't go
  // to, against one card of their own región. Now one line to the rest.
  if (otherRegionsAll.length > 0) {
    sections.push({
      label: "En otras regiones",
      events: otherRegionsAll.map((e) => toDigestEvent(e, week)),
      compact: true,
      moreLink: {
        label: `Y fuera de ${regionShort}, ${otherRegionsAll.length} ${otherRegionsAll.length === 1 ? "exposición" : "exposiciones"} más a lo largo de Chile`,
        url: SITE_URL,
      },
    });
  }

  return { sections, regionTotalThisWeek };
}

// The edition only goes out Thursday-Saturday (Santiago). Any
// other day is a no-op: cron-watchdog.yml re-dispatches this workflow on
// a gap, and the first gap after the Sunday → Thursday switch (2026-10-16)
// would otherwise have sent the weekend edition on a Monday.
const SEND_DAYS = new Set(["Thu", "Fri", "Sat"]);

export async function run(deps: RunDeps = {}): Promise<void> {
  const now = deps.now ?? new Date();
  const dow = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", weekday: "short" }).format(now);
  if (!SEND_DAYS.has(dow)) {
    console.log(`[newsletter] ${dow}: the Thursday-Sunday edition only goes out Thursday-Saturday, nothing to send.`);
    return;
  }
  const supabase = deps.supabase ?? getSupabaseClient();
  const week = editionBoundsInSantiago(now);

  // Retried a few times with backoff — mirrors social-publish/run.ts's
  // own fix for the exact same transient Supabase error (2026-09-02: "JWT
  // issued at future", same service role key working fine hours earlier
  // and later). Real bug found 2026-09-27: the weekly newsletter cron hit
  // this same error with no retry at all and just crashed outright,
  // silently skipping that week's send — Cron Watchdog didn't catch it
  // either, since it only checks whether a run completed, not whether it
  // succeeded. Safe to retry here specifically because nothing has been
  // sent yet at this point in the run.
  const loadAll = () =>
    Promise.all([
      supabase
        .from("newsletter_subscribers")
        .select("id, email, admin_region_name, confirm_token")
        .not("confirmed_at", "is", null)
        .is("unsubscribed_at", null),
      // Real bug found 2026-08-08: this used to be missing the removed_at
      // filter that events_public (what apps/web actually reads) already
      // applies — an event soft-removed via the admin "Quitar" action (see
      // docs/data-model.md) still had curation_status='approved', so it
      // kept appearing in the newsletter (with a permalink that 404s, since
      // the site itself does exclude it) even though it had already
      // disappeared from the live site.
      supabase.from("events").select("*").eq("curation_status", "approved").is("removed_at", null),
      supabase.from("regions").select("id, name, admin_region_name"),
    ]);

  let [subscribersRes, eventsRes, regionsRes] = await loadAll();
  for (let attempt = 1; attempt <= 3 && (subscribersRes.error || eventsRes.error || regionsRes.error); attempt++) {
    const err = subscribersRes.error ?? eventsRes.error ?? regionsRes.error;
    console.warn(`[newsletter] Supabase read failed (attempt ${attempt}/3): ${err?.message}. Retrying...`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    [subscribersRes, eventsRes, regionsRes] = await loadAll();
  }
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

  // One set of texts (intro + day paragraphs) per región, shared across
  // every subscriber in it — not
  // per-subscriber, since buildDigestSections' own content is identical
  // for every subscriber of the same región. Keeps the real Haiku cost to
  // "once per active región per week".
  const textsByRegion = new Map<string, DigestTexts>();

  let sent = 0;
  let skipped = 0;
  for (const subscriber of subscribers) {
    const { sections, regionTotalThisWeek } = buildDigestSections(events, subscriber.admin_region_name, week);
    if (sections.length === 0) {
      skipped++;
      continue;
    }

    if (!textsByRegion.has(subscriber.admin_region_name)) {
      textsByRegion.set(subscriber.admin_region_name, await (deps.generateDigestTextsFn ?? generateDigestTexts)(sections, regionTotalThisWeek));
    }
    const texts = textsByRegion.get(subscriber.admin_region_name)!;

    // Reuses the subscriber's own confirm_token as the unsubscribe token
    // too — one opaque value per subscriber is enough, see the migration
    // comment.
    await (deps.sendDigestEmailFn ?? sendDigestEmail)(
      subscriber.email,
      subscriber.confirm_token,
      sections,
      texts.intro,
      week,
      subscriber.admin_region_name,
      texts.days,
    );
    sent++;
  }

  console.log(`[newsletter] sent ${sent} digest(s), skipped ${skipped} subscriber(s) with nothing to show`);
}
