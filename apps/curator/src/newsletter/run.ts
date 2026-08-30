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
import { diversifyByComuna } from "../lib/diversify.js";
import { generateRegionIntro, generateOtherRegionsIntro } from "./intro.js";

type Subscriber = Pick<Tables<"newsletter_subscribers">, "id" | "email" | "admin_region_name" | "confirm_token">;
type EventRow = Tables<"events">;
// Subscription scope is the macro-región (Región Metropolitana, Valparaíso,
// etc — regions.admin_region_name), not the comuna — see the migration
// comment (20260730190000). Each event's own admin_region_name/comunaName
// is resolved once in run() via its region_id, since events itself only
// carries region_id, not either name directly.
type EventWithRegion = EventRow & { adminRegionName: string | null; comunaName: string | null };

const VISIT_CAP = 10;
// Bumped 5 -> 10, 2026-08-08 (user request) — matches VISIT_CAP now, both
// read as "up to 10" sections.
const OTHER_REGIONS_CAP = 10;
const SITE_URL = "https://www.caldearte.com";

export interface RunDeps {
  supabase?: SupabaseClient<Database>;
  now?: Date;
  sendDigestEmailFn?: typeof sendDigestEmail;
  generateRegionIntroFn?: typeof generateRegionIntro;
  generateOtherRegionsIntroFn?: typeof generateOtherRegionsIntro;
}

// Same "fixed Monday-Sunday week" convention as apps/web/src/lib/date.ts's
// weekBoundsInSantiago — "esta semana" means the same thing all week long,
// not a rolling 7-day window that changes every time this runs — EXCEPT
// on a Sunday, where this resolves to the UPCOMING week (starting
// tomorrow), not the week ending today. Real bug, found 2026-08-23 while
// moving the newsletter's own send day to Sunday: apps/web's version (a
// general "current week" concept, correctly Sunday-inclusive for site
// display) was duplicated here as-is, but the newsletter's actual job is
// "which week is this digest announcing" — with the old Sunday-inclusive
// math, week.end landed on TODAY (send day), so a Sunday send would
// describe the week that just ended instead of the one about to start.
function weekBoundsInSantiago(now: Date): { start: string; end: string } {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now); // en-CA gives YYYY-MM-DD
  const [y, m, d] = todayStr.split("-").map(Number);
  const asUtc = new Date(Date.UTC(y, m - 1, d));
  const dow = asUtc.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? 1 : 1 - dow;
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

function isDatedInWeek(event: EventRow, week: { start: string; end: string }): boolean {
  return Boolean(event.opening_datetime && event.opening_datetime.slice(0, 10) >= week.start && event.opening_datetime.slice(0, 10) <= week.end);
}

// Added 2026-08-29 alongside events.event_type: openings/visitasGuiadas
// both read opening_datetime (the same field), so without the type check
// a "visita guiada" would show up under "Inauguraciones de esta semana"
// as if it were the exhibition's own opening — the exact bug that
// prompted event_type to exist. See lib/curation-policy.ts's
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
  // generateRegionIntro so it can cite a real number instead of counting
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
  // itself "the exhibition, available to visit any time," and (unlike an
  // inauguración) it usually has no run_start_date/run_end_date of its
  // own, so isRunningOn's null-means-always-running default would
  // otherwise leak it into "Expos para visitar." It gets its own section
  // instead, built from `inRegion` directly, below.
  const runningThisWeek = inRegion.filter((e) => e.event_type !== "visita_guiada" && isRunningOn(e, week.end));

  const openings = runningThisWeek.filter((e) => isOpeningInWeek(e, week));
  const openingIds = new Set(openings.map((e) => e.id));

  const visitasGuiadas = inRegion.filter((e) => isVisitaGuiadaInWeek(e, week));

  // Everything not opening this week goes in one pool, treated equally —
  // sorted ending-soonest first so it doubles as a nudge to catch it
  // before it closes. No separate "Expos nuevas esta semana" split by
  // run_start_date (removed 2026-08-08, user feedback: an inauguración
  // already IS how a new exhibition starts — a second "new" bucket read
  // as confusing, not clarifying). Kept as two values: the full pool (for
  // the "ver todas" count and the empty-state check) and the capped slice
  // actually rendered as cards — a región like Región Metropolitana can
  // easily have 40+ of these, showing all of them would bury everything
  // else in the email.
  const alsoVisitAll = runningThisWeek
    .filter((e) => !openingIds.has(e.id))
    .sort((a, b) => (a.run_end_date ?? "9999-12-31").localeCompare(b.run_end_date ?? "9999-12-31"));
  const alsoVisit = diversifyByComuna(alsoVisitAll, VISIT_CAP);

  // Deterministic (soonest-closing first, same convention as alsoVisitAll
  // above), not randomized — was shuffle()'d per-subscriber until
  // 2026-08-08, but this section now also gets its own shared AI intro
  // (generateOtherRegionsIntro, once per región/week, see run()'s own
  // memoization below) that names specific titles from this sample. A
  // random per-subscriber reshuffle would let that shared text describe
  // shows a given subscriber's own cards don't even include.
  const otherRegionsAll = events
    .filter((e) => e.adminRegionName !== adminRegionName && isRunningOn(e, week.end))
    .sort((a, b) => (a.run_end_date ?? "9999-12-31").localeCompare(b.run_end_date ?? "9999-12-31"));
  const otherRegionsSample = otherRegionsAll.slice(0, OTHER_REGIONS_CAP);

  // Only skip the subscriber entirely if there's truly nothing anywhere —
  // not even something to point at in another región. Otherwise the
  // digest always sends, using emptyMessage below to say so explicitly
  // rather than just omitting a section and leaving the reader guessing
  // whether that's a bug or genuinely nothing this week.
  const hasAnyContent = openings.length > 0 || visitasGuiadas.length > 0 || alsoVisitAll.length > 0 || otherRegionsAll.length > 0;
  if (!hasAnyContent) return { sections: [], regionTotalThisWeek: 0 };

  // Total across the whole country, not just the sample shown in "En
  // otras regiones" — the reader-facing count next to that section's
  // "explore everything" link.
  const nationwideActiveCount = events.filter((e) => isRunningOn(e, week.end)).length;
  const regionTotalThisWeek = openings.length + alsoVisitAll.length;

  const sections: DigestSection[] = [];

  sections.push({
    label: "Inauguraciones de esta semana",
    events: openings.map((e) => toDigestEvent(e, week)),
    emptyMessage:
      openings.length === 0 ? "No hemos encontrado ninguna inauguración para esta semana aún. Si sabes de una, avísanos." : undefined,
  });

  // Added 2026-08-29 alongside events.event_type — mismo orden que el
  // resto del sitio (mayor a menor interacción con la obra): inauguración,
  // visita guiada, exposición. Omitida por completo cuando no hay ninguna
  // esta semana, no se le da su propio emptyMessage (a diferencia de las
  // otras 2 secciones, que siempre se muestran) porque es la sección más
  // nueva/opcional de las 3 y aún no se sabe qué tan seguido va a tener
  // contenido real.
  if (visitasGuiadas.length > 0) {
    sections.push({
      label: "Visitas guiadas de esta semana",
      events: visitasGuiadas.map((e) => toDigestEvent(e, week)),
    });
  }

  sections.push({
    label: "Expos para visitar esta semana",
    events: alsoVisit.map((e) => toDigestEvent(e, week)),
    emptyMessage:
      alsoVisitAll.length === 0 ? "No hemos encontrado exposiciones para visitar esta semana aún. Si sabes de una, avísanos." : undefined,
    moreLink:
      alsoVisitAll.length > VISIT_CAP
        ? { label: `Ver todas las ${regionTotalThisWeek} exposiciones en ${adminRegionName}`, url: SITE_URL }
        : undefined,
  });

  if (otherRegionsSample.length > 0) {
    sections.push({
      label: "En otras regiones",
      events: otherRegionsSample.map((e) => toDigestEvent(e, week)),
      moreLink: {
        label: `Si deseas puedes explorar las ${nationwideActiveCount} exposiciones activas esta semana a lo largo de Chile`,
        url: SITE_URL,
      },
    });
  }

  return { sections, regionTotalThisWeek };
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

  // One intro per región, shared across every subscriber in it — not
  // per-subscriber, since buildDigestSections' own content is now
  // identical for every subscriber of the same región (the "En otras
  // regiones" sample is deterministic per región/week too, as of
  // 2026-08-08 — see buildDigestSections' own comment on otherRegionsAll).
  // Keeps the real Haiku cost to "once per active región per week," times
  // two now that there are two intros.
  const introByRegion = new Map<string, string | null>();
  const otherRegionsIntroByRegion = new Map<string, string | null>();

  let sent = 0;
  let skipped = 0;
  for (const subscriber of subscribers) {
    const { sections, regionTotalThisWeek } = buildDigestSections(events, subscriber.admin_region_name, week);
    if (sections.length === 0) {
      skipped++;
      continue;
    }

    if (!introByRegion.has(subscriber.admin_region_name)) {
      const intro = await (deps.generateRegionIntroFn ?? generateRegionIntro)(sections, regionTotalThisWeek);
      introByRegion.set(subscriber.admin_region_name, intro);
    }
    const intro = introByRegion.get(subscriber.admin_region_name) ?? null;

    if (!otherRegionsIntroByRegion.has(subscriber.admin_region_name)) {
      const otherRegionsEvents = sections.find((s) => s.label === "En otras regiones")?.events ?? [];
      const otherRegionsIntro = await (deps.generateOtherRegionsIntroFn ?? generateOtherRegionsIntro)(otherRegionsEvents);
      otherRegionsIntroByRegion.set(subscriber.admin_region_name, otherRegionsIntro);
    }
    const otherRegionsIntro = otherRegionsIntroByRegion.get(subscriber.admin_region_name) ?? null;

    // Reuses the subscriber's own confirm_token as the unsubscribe token
    // too — one opaque value per subscriber is enough, see the migration
    // comment.
    await (deps.sendDigestEmailFn ?? sendDigestEmail)(
      subscriber.email,
      subscriber.confirm_token,
      sections,
      intro,
      week,
      otherRegionsIntro,
      subscriber.admin_region_name,
    );
    sent++;
  }

  console.log(`[newsletter] sent ${sent} digest(s), skipped ${skipped} subscriber(s) with nothing to show`);
}
