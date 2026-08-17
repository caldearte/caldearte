// Event Discovery orchestrator — deliberately simple (docs/region-discovery.md):
// every unit in `regions` gets a fixed cadence pass, no saturation state
// machine, no adaptive cadence. The old search_frequency/
// consecutive_zero_yield_runs columns are ignored entirely (they stay in
// the schema unread — no migration needed to stop using them);
// status='excluded' is still honored as a hard, editorial opt-out (e.g.
// OFAC), distinct from status='not_started' (a comuna simply not yet in
// the weekly batch rotation — see the 346-comuna rollout, below).
//
// Weekly batch rotation (2026-07-17): with all 346 official comunas
// seeded, running every due one every time would exceed GitHub Actions'
// 6-hour job timeout (346 sequential units ≈ 7.9h at ~82s/unit measured).
// getUnitsDueForRun caps each run to `weekly_batch_size` (system_config,
// no redeploy to change), oldest-last_run_at-first — a comuna that's
// never run (last_run_at null) sorts first, so the rotation naturally
// works through every comuna once before any repeats, then cycles
// forever with no special "reset" needed: a comuna that just ran becomes
// the newest, falls out of the "due" pool for RUN_INTERVAL_MS, and
// re-enters it once that elapses, same as always.
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { Tables } from "@caldearte/shared-types";
import { getSupabaseClient } from "../lib/supabase-client.js";
import { recordUsage, getConfigNumber, getCurrentMonthSpend } from "../lib/usage-tracking.js";
import type { Pipeline } from "../lib/pipeline.js";
import { classifyOutOfScope } from "../lib/out-of-scope-classifier.js";
import { estimateCostUsd } from "../lib/pricing.js";
import { knownSourceDomain, isAggregatorSource } from "../lib/known-sources.js";
import { KNOWN_LOW_QUALITY_SOURCE_DOMAINS } from "../lib/known-exclusions.js";
import { matchRegionId, type RegionLike } from "../lib/locations.js";
import {
  normalizeLocation,
  isLikelySameTitle,
  isLikelySameTitleIgnoringPlaceName,
  isLikelySameTitleWithoutRatio,
  placeNamesLikelySame,
  isWithinAnchorWindow,
} from "../lib/event-filters.js";
import { enrichCandidates, enrichBrightSourceItemDetails, isSocialMediaUrl, type FetchLike as PageFetchLike } from "../lib/page-fetch.js";
import { rehostImage, type RehostImageFn } from "../lib/image-rehost.js";
import { sendRunSummaryEmail, sendEscalationEmail, type RunSummary, type CandidateSummary } from "../lib/notify.js";
import { recordRunSummary } from "../lib/run-summary-store.js";
import {
  buildBlock,
  buildSystemPrompt,
  curate,
  curateBrightSourceItems,
  currentMonthLabel,
  EVENT_DISCOVERY_MODEL,
  filterKnownExclusions,
  isCurrentOrUpcoming,
  normalizeTitle,
  searchUnit,
  type DiscoverUsage,
  type EventCandidate,
  type MessagesClient,
  type RawResult,
} from "./discover.js";
import {
  detectNewBrightSources,
  fetchBrightSources,
  mergeBrightSources,
  type BrightSource,
} from "./sources.js";

type Region = Tables<"regions">;

// ~monthly with tolerance for scheduling jitter (a cron that fires a day
// early shouldn't silently skip the whole month).
const RUN_INTERVAL_MS = 28 * 24 * 60 * 60 * 1000;

// Tavily's pay-as-you-go overage rate, confirmed against tavily.com/pricing
// (see docs/region-discovery.md's cost-governance section) — used only for
// the run-summary email's cost estimate, not for any real billing decision.
const TAVILY_COST_PER_CREDIT = 0.008;

function isDueForRun(region: Region, now: Date): boolean {
  if (!region.last_run_at) return true;
  return now.getTime() - new Date(region.last_run_at).getTime() >= RUN_INTERVAL_MS;
}

// Oldest last_run_at first; never-run (null) sorts before every real
// timestamp, so brand-new comunas get priority into the batch over ones
// merely due for a refresh.
function byOldestLastRunFirst(a: Region, b: Region): number {
  if (!a.last_run_at && !b.last_run_at) return 0;
  if (!a.last_run_at) return -1;
  if (!b.last_run_at) return 1;
  return a.last_run_at.localeCompare(b.last_run_at);
}

export async function getUnitsDueForRun(now: Date = new Date()): Promise<Region[]> {
  const { data, error } = await getSupabaseClient()
    .from("regions")
    .select("*")
    .neq("status", "excluded");

  if (error) {
    throw new Error(`Failed to load units: ${error.message}`);
  }

  const due = (data ?? []).filter((r) => isDueForRun(r, now)).sort(byOldestLastRunFirst);
  const batchSize = await getConfigNumber("weekly_batch_size");
  return due.slice(0, batchSize);
}

// All regions, regardless of status — region_id is a location tag, not a
// "should we search here" flag, so an event can still match an excluded
// or not-yet-due region by name.
export async function loadAllRegions(): Promise<RegionLike[]> {
  const { data, error } = await getSupabaseClient().from("regions").select("id, name");

  if (error) {
    throw new Error(`Failed to load regions: ${error.message}`);
  }

  return data ?? [];
}

async function loadDetectedSources(): Promise<BrightSource[]> {
  const { data, error } = await getSupabaseClient()
    .from("detected_sources")
    .select("url, note, source_type");

  if (error) {
    throw new Error(`Failed to load detected sources: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    url: row.url,
    note: row.note,
    type: row.source_type as BrightSource["type"],
  }));
}

// Per-source independent fetch cadence — until now, EVERY bright source got
// fetched on EVERY run with no gating at all. Same "due" shape as regions'
// isDueForRun/RUN_INTERVAL_MS, but keyed by the source's own url (see the
// bright_source_fetch_state migration for why: KNOWN_SOURCES is
// hand-curated in code, not a DB row, so url is the only identity both
// hand-curated and auto-detected sources share).
//
// 14 days -> 7 (2026-07-23, dual-cadence strategy — see
// event-discovery.yml's own doc comment): bright sources moved to their
// own weekly cron, separate from the comuna batch's monthly one. A 14-day
// per-source cadence against a 7-day cron would only find something new
// every OTHER run — halved to match.
const BRIGHT_SOURCE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function isSourceDue(lastFetchedAt: string | undefined, now: Date): boolean {
  if (!lastFetchedAt) return true;
  return now.getTime() - new Date(lastFetchedAt).getTime() >= BRIGHT_SOURCE_INTERVAL_MS;
}

// Exported for headless-discovery/run.ts, which shares the exact same
// bright_source_fetch_state table/cadence — MAVI is just another bright
// source whose fetch mechanism happens to need a real browser instead of a
// plain fetch(), not a fundamentally different concept.
export async function loadBrightSourceFetchState(): Promise<Map<string, string>> {
  const { data, error } = await getSupabaseClient().from("bright_source_fetch_state").select("url, last_fetched_at");

  if (error) {
    throw new Error(`Failed to load bright source fetch state: ${error.message}`);
  }

  return new Map((data ?? []).map((row) => [row.url, row.last_fetched_at]));
}

// Records an attempt, not just a success — fetchBrightSources already
// swallows a single source's failure (network error, 404, etc.) and logs
// it rather than throwing, so by the time this runs there's no per-source
// success/failure signal left to key off. Retrying a broken source every
// single run wastes just as much time as retrying a working one; the
// 7-day backoff applies equally, same posture as regions' own due-check
// (which doesn't distinguish a zero-yield run from a failed one either).
export async function recordBrightSourcesFetched(urls: string[], now: Date): Promise<void> {
  const client = getSupabaseClient();
  for (const url of urls) {
    const { error } = await client.from("bright_source_fetch_state").upsert({ url, last_fetched_at: now.toISOString() });
    if (error) {
      console.error(`[event-discovery] failed to record fetch state for ${url}: ${error.message}`);
    }
  }
}

// Cross-run dedup: don't re-insert an event already in the calendar (e.g.
// a mid-July re-run must not duplicate everything found on July 1st).
// Three keys, any one is enough to count as a duplicate:
// - Normalized title — the same event routinely surfaces with slightly
//   different punctuation/quoting across sources and runs, which
//   exact-match comparison misses (a real observed failure).
// - sourceUrl — a real production bug (found 2026-07-16): the SAME bright
//   source content, re-curated in a later run, got a DIFFERENT title from
//   Haiku each time ("Rama torcida" vs "Muestra "Rama torcida" en el
//   Museo de Arte Contemporáneo" — same source_url, same image, same
//   event) — title extraction isn't stable across separate Haiku calls
//   even on identical input, so title-only dedup missed it entirely.
//   sourceUrl doesn't have that instability, so it catches what title
//   dedup can't. Only applied when sourceUrl is non-null — never used to
//   dedup two different candidates that both happen to lack one.
// - location + date fingerprint — a real production bug (found
//   2026-07-18): the same San Felipe exhibition, posted by 3 DIFFERENT
//   accounts (2 Instagram, 1 Facebook), got 3 differently-punctuated
//   titles ("SALa FEM 2026" / "SAlaFEM2026" / "SalaFEM 2026") AND 3
//   different sourceUrls — evading both keys above — while sharing the
//   exact same location, run dates, and opening time. That combination is
//   an extremely unlikely coincidence for genuinely different events, so
//   it's treated as a third dedup signal.
//
//   ONLY checked against events already in the DB from a PAST run
//   (`seen.locationDates`, loaded once via loadExistingKeys and never
//   mutated below) — deliberately NOT re-applied blindly between sibling
//   candidates within the SAME run's own batch. Real production bug
//   (found 2026-07-23): a single arteinformado.com pass had 9 genuinely
//   DIFFERENT concurrent exhibitions ("Ejercicios de enlaces", "Vestiario",
//   "Materia sensible", ...) all opening the same day in the same MAC wing
//   — same location, same exact run dates, completely unrelated titles.
//   Blind same-batch matching kept only the first and silently dropped
//   the other 8 as "duplicates". Within a single batch, only the
//   title-similarity-aware fuzzy check below (isFuzzyDuplicateTitle)
//   applies — safe for both real shapes: a repost with a garbled title
//   still needs the title to be at least somewhat similar to get merged
//   (true for real reposts, false for e.g. "Vestiario" vs "Materia
//   sensible").
//
//   Real production bug, found 2026-08-12 (via a user-requested audit):
//   the SAME thing can happen ACROSS runs, not just within one batch — a
//   venue running a whole "temporada" of concurrent shows that all open
//   and close on the museum's shared season dates. MAC - Parque Forestal
//   had 3 genuinely different real exhibitions ("Nazca/Sudamericana",
//   "Obras extraordinarias", "El ángel de la historia") all sharing the
//   exact same placeName + 11-jul-to-11-oct run. "Nazca/Sudamericana" was
//   inserted first (a prior week's run); the other two, discovered later,
//   collided on the exact fingerprint against it and got silently dropped
//   as "duplicates". `seen.locationDates` is now list-valued (one
//   venue+date combo can legitimately hold several real events) and
//   requires a title match too — but plain isLikelySameTitle isn't safe
//   here: uchile.cl/artes.uchile.cl bakes the venue name straight into
//   every title ("... en el MAC Parque Forestal"), so ALL THREE of these
//   titles share enough words (the venue name itself) to pass isLikelySameTitle
//   even though they're unrelated exhibitions — confirmed by this fix's own
//   first attempt, caught by its regression test. Uses
//   isLikelySameTitleIgnoringPlaceName instead (event-filters.ts), which
//   strips placeName's own words from both titles first. The San Felipe
//   case above still passes fine (its titles don't embed a venue name at
//   all), so this only closes the gap, doesn't reopen it.
// placeName joined the fingerprint (2026-07-28, alongside comuna and
// title): a real cross-source case (chilecultura.gob.cl vs. the venue's
// own site both listing "Balmaceda Arte Joven" / "Estado de Posibilidad")
// showed comuna alone is too coarse — many venues share a comuna — while
// place_name pins it down to the actual venue. Normalized the same way as
// title (accents/quotes/case), since venue names get punctuated
// differently across sources too ("Balmaceda Arte Joven" vs "BAJ RM").
function locationDateKey(
  location: string,
  placeName: string | null,
  c: Pick<EventCandidate, "openingDatetime" | "runStartDate" | "runEndDate">,
): string {
  const dateFingerprint = c.openingDatetime ?? `${c.runStartDate ?? ""}|${c.runEndDate ?? ""}`;
  return `${normalizeLocation(location)}|${normalizeTitle(placeName ?? "")}|${dateFingerprint}`;
}

// Date-only (no time-of-day) companion to locationDateKey, for the fuzzy
// title-similarity fallback below — deliberately coarser than
// locationDateKey's exact-datetime fingerprint, since the whole point is to
// catch cases where two sources report slightly different exact hours for
// what's otherwise the same real opening (inauguración: date only, per the
// user's own read of the odds — two distinct inauguraciones sharing venue,
// title-similarity AND day, differing only by hour, is negligible). For an
// exposición (no openingDatetime), both runStartDate AND runEndDate are
// part of the fingerprint — a real exhibition run is defined by its whole
// span, not just when it opens; using only runStartDate (as this used to)
// would treat two different-length runs starting the same day as one.
//
// Deliberately does NOT include placeName in the BUCKET key (real bug,
// found 2026-07-29 running a manual curation audit): 8 exhibitions at the
// same physical MAC - Quinta Normal venue were inserted TWICE, once from
// arteinformado.com ("MAC - Museo de Arte Contemporáneo") and once from
// uchile.cl ("MAC - Quinta Normal") — same real venue, worded differently
// per source. Requiring an EXACT placeName string match to even land in
// the same bucket meant isLikelySameTitle never got a chance to compare
// "Vestiario" against "Exposición 'Vestiario' en el Museo de Arte
// Contemporáneo" — the exact case this fuzzy fallback exists for.
// placeName isn't dropped from the dedup decision entirely, though — see
// placeNamesLikelySame below, checked alongside title similarity at the
// call site. Broadening this bucket to comuna+date alone, with no
// placeName check anywhere, would reopen the false-merge case placeName
// was added to prevent in the first place — this file's own existing
// test seeds exactly that scenario (two DIFFERENT venues sharing a
// comuna, a near-identical title, same day — must NOT merge) and would
// fail without placeNamesLikelySame's veto. locationDateKey (above) keeps
// placeName in its STRICT exact-match tier unchanged.
// Prefers the run-date RANGE over openingDatetime when both are present —
// the opposite priority from locationDateKey's strict fingerprint above.
// Real bug, found 2026-07-29 building the MAC - Quinta Normal fix itself:
// the two real duplicate rows had IDENTICAL run_start_date/run_end_date
// ("2026-04-25"/"2026-08-23"), but only the arteinformado.com one also had
// a confirmed openingDatetime — with openingDatetime prioritized first
// (the original logic here), the two rows' dateOnly fingerprints came out
// as "2026-04-24" (opening day) vs "2026-04-25|2026-08-23" (run range):
// different buckets, so placeNamesLikelySame's fix above still couldn't
// have caught them without this too. The run-date range is the more
// stable, more-often-present signal for "the same exhibition" (an
// opening is one specific moment WITHIN a run, a narrower concept) — only
// fall back to openingDatetime when a candidate genuinely has no run
// range at all (a bare inauguración with no separately-stated exhibition
// span, allowed by enforceDateCompleteness).
function locationDateOnlyKey(
  location: string,
  c: Pick<EventCandidate, "openingDatetime" | "runStartDate" | "runEndDate">,
): string {
  const dateOnly =
    c.runStartDate && c.runEndDate
      ? `${c.runStartDate}|${c.runEndDate}`
      : (c.openingDatetime?.slice(0, 10) ?? `${c.runStartDate ?? ""}|${c.runEndDate ?? ""}`);
  return `${normalizeLocation(location)}|${dateOnly}`;
}

// Carries enough of an already-stored event's own data for
// shouldReplaceExisting (below) to judge it against a new duplicate
// candidate, and for insertCandidates to target the exact row with an
// UPDATE when the new one wins.
export interface ExistingEventInfo {
  id: string;
  title: string;
  placeName: string | null;
  sourceUrl: string | null;
  openingDatetime: string | null;
  openingTimeConfirmed: boolean;
  // Added 2026-08-14 for titlesByPlaceName's own venue+end-date dedup tier
  // — see that map's doc comment for why runStartDate alone isn't a
  // reliable match key here.
  runStartDate: string | null;
  runEndDate: string | null;
}

export interface SeenKeys {
  titles: Map<string, ExistingEventInfo>;
  sourceUrls: Map<string, ExistingEventInfo>;
  // List-valued (2026-08-12, real production bug): a venue running a whole
  // "temporada" of concurrent exhibitions can have several genuinely
  // DIFFERENT shows sharing the exact same placeName + run dates (found via
  // MAC - Parque Forestal, 3 real 11-jul-to-11-oct exhibitions —
  // "Nazca/Sudamericana", "Obras extraordinarias", "El ángel de la
  // historia"). Treating the fingerprint alone as proof of "same event"
  // (the original single-value map) silently dropped the other 2 as
  // duplicates of the first one inserted. See the title-similarity check
  // at the call site below — same fix shape as titlesByLocationDateOnly's
  // own fuzzy tier, applied to this stricter exact-fingerprint tier too.
  locationDates: Map<string, ExistingEventInfo[]>;
  // Real bug (found 2026-07-20, via a user-requested audit): none of the
  // three exact-match signals above catch two DIFFERENT sources reporting
  // the SAME real event with different exact hours ("19:00" vs "19:30")
  // and different exact title wording — the location+datetime fingerprint
  // misses on the time difference, and title/sourceUrl obviously differ
  // too. Bucketed by the coarser date-only key (comuna + date, no
  // placeName — see locationDateOnlyKey's own doc comment); within a
  // bucket, a new candidate is a duplicate if BOTH its title (see
  // isLikelySameTitle) AND its placeName (see placeNamesLikelySame,
  // 2026-07-29, deliberately more lenient) are a close match to the SAME
  // existing entry already in that bucket — deliberately conservative on
  // the title side (both a Jaccard threshold AND a minimum shared-word
  // count) since a false merge here silently drops a real, distinct
  // event, which is worse than an occasional missed duplicate.
  titlesByLocationDateOnly: Map<string, ExistingEventInfo[]>;
  // Real bug found 2026-08-14 (hifas.galeria, "Cartografía del Fuego"):
  // two Instagram posts about the same real exhibition, both missing an
  // explicit opening date in their OWN text — fillRunStartFromPublishedDate
  // (discover.ts) backfills runStartDate from each POST'S OWN publish
  // date, which genuinely differs post to post, so locationDateOnlyKey
  // (which keys on the full runStartDate+runEndDate pair) puts them in
  // DIFFERENT buckets even though they're the same real event with the
  // same real runEndDate. Bucketed by exact placeName alone (normalized),
  // independent of any date — the dedup check at the call site below
  // additionally requires a matching runEndDate (the one date signal
  // that's actually grounded in the source text here, not backfilled)
  // plus isLikelySameTitleWithoutRatio, so this stays narrow: it only
  // fires for the exact-venue-exact-enddate case, never a blanket
  // same-venue merge.
  titlesByPlaceName: Map<string, ExistingEventInfo[]>;
}

export async function loadExistingKeys(): Promise<SeenKeys> {
  const { data, error } = await getSupabaseClient()
    .from("events")
    .select("id, title, source_url, freeform_location, place_name, opening_datetime, opening_time_confirmed, run_start_date, run_end_date")
    .eq("source", "discovered");

  if (error) {
    throw new Error(`Failed to load existing discovered events: ${error.message}`);
  }

  const rows = data ?? [];
  const toInfo = (row: (typeof rows)[number]): ExistingEventInfo => ({
    id: row.id,
    title: row.title,
    placeName: row.place_name,
    sourceUrl: row.source_url,
    openingDatetime: row.opening_datetime,
    openingTimeConfirmed: row.opening_time_confirmed,
    runStartDate: row.run_start_date,
    runEndDate: row.run_end_date,
  });

  const titlesByPlaceName = new Map<string, ExistingEventInfo[]>();
  for (const row of rows) {
    if (!row.place_name) continue;
    const key = normalizeTitle(row.place_name);
    const existing = titlesByPlaceName.get(key);
    if (existing) existing.push(toInfo(row));
    else titlesByPlaceName.set(key, [toInfo(row)]);
  }

  const titlesByLocationDateOnly = new Map<string, ExistingEventInfo[]>();
  for (const row of rows) {
    const key = locationDateOnlyKey(row.freeform_location, {
      openingDatetime: row.opening_datetime,
      runStartDate: row.run_start_date,
      runEndDate: row.run_end_date,
    });
    const existing = titlesByLocationDateOnly.get(key);
    if (existing) existing.push(toInfo(row));
    else titlesByLocationDateOnly.set(key, [toInfo(row)]);
  }

  const locationDates = new Map<string, ExistingEventInfo[]>();
  for (const row of rows) {
    const key = locationDateKey(row.freeform_location, row.place_name, {
      openingDatetime: row.opening_datetime,
      runStartDate: row.run_start_date,
      runEndDate: row.run_end_date,
    });
    const existing = locationDates.get(key);
    if (existing) existing.push(toInfo(row));
    else locationDates.set(key, [toInfo(row)]);
  }

  return {
    titles: new Map(rows.map((row) => [normalizeTitle(row.title), toInfo(row)])),
    sourceUrls: new Map(rows.flatMap((row) => (row.source_url ? [[row.source_url, toInfo(row)] as const] : []))),
    locationDates,
    titlesByLocationDateOnly,
    titlesByPlaceName,
  };
}

// Real rule, set by the project owner (2026-07-28): a duplicate isn't
// always a wash — the "better" version should win and REPLACE the stored
// row instead of being silently dropped. Two tiers, in order:
// 1. Whichever side has a CONFIRMED opening date+time wins outright — a
//    candidate with only a bare date (or nothing) never beats one that
//    has the real hour, regardless of source.
// 2. If both sides tie on that (both confirmed, or neither), the venue's
//    own site wins over an aggregator merely re-listing it (see
//    isAggregatorSource) — real case: chilecultura.gob.cl carried a stale
//    run_end_date for an MSSA exhibition that MSSA's own detail page had
//    already corrected. A true tie (same tier on both signals) keeps
//    whatever's already stored, per explicit instruction.
function shouldReplaceExisting(candidate: EventCandidate, existing: ExistingEventInfo): boolean {
  const candidateHasOpening = candidate.openingDatetime !== null && candidate.openingTimeConfirmed;
  const existingHasOpening = existing.openingDatetime !== null && existing.openingTimeConfirmed;
  if (candidateHasOpening !== existingHasOpening) return candidateHasOpening;

  const candidateIsAggregator = candidate.sourceUrl !== null && isAggregatorSource(candidate.sourceUrl);
  const existingIsAggregator = existing.sourceUrl !== null && isAggregatorSource(existing.sourceUrl);
  if (candidateIsAggregator !== existingIsAggregator) return !candidateIsAggregator;

  return false;
}

// --- Cross-source curation conflict escalation (2026-07-30) -----------
// Found via a manual curation audit: the same real exhibition can be
// simultaneously approved (one source's vague description) and correctly
// rejected under a sensitivity axis (a different source's more detailed
// one) — Haiku applies the axis correctly whenever it sees the
// disqualifying text, but nothing compared a new candidate against an
// EXISTING decision on likely the same real event from a different
// source_url. See docs/curation-policy.md's "Cross-source conflict
// escalation" section for the full design and the real case that
// prompted this.

// Best-effort single anchor date for a candidate/existing row — same
// priority order locationDateOnlyKey already uses (a run's own start
// date is the more stable signal than a single opening moment).
function anchorDateOf(c: { openingDatetime: string | null; runStartDate: string | null; runEndDate: string | null }): string | null {
  return c.runStartDate ?? c.openingDatetime?.slice(0, 10) ?? c.runEndDate ?? null;
}

interface ConflictMatch {
  kind: "approved_event" | "rejected_candidate";
  id: string;
  title: string;
  sourceUrl: string;
  reasoning: string;
}

// Looks for an already-APPROVED event describing what's likely the same
// real thing as a candidate that's about to be REJECTED, from a
// different source_url, within isWithinAnchorWindow's ±30-day default.
// Scoped to the candidate's own region_id — cheap and precise, same value
// insertCandidates already computes for its own insert/update payload.
// Known simplification: this re-queries the full region every call
// rather than caching per-region results across a batch — fine at this
// project's scale (a run's candidates rarely exceed a few dozen), worth
// revisiting only if it's ever measured to matter.
async function findConflictingApprovedEvent(
  client: ReturnType<typeof getSupabaseClient>,
  candidate: Pick<EventCandidate, "title" | "placeName" | "sourceUrl" | "openingDatetime" | "runStartDate" | "runEndDate">,
  regionId: string | null,
  anchorDate: string | null,
): Promise<ConflictMatch | null> {
  if (!regionId || !anchorDate) return null;

  const { data, error } = await client
    .from("events")
    .select("id, title, place_name, source_url, curation_reasoning, opening_datetime, run_start_date, run_end_date")
    .eq("curation_status", "approved")
    .eq("region_id", regionId);

  if (error) {
    console.error(`[event-discovery] conflict check (approved events) failed: ${error.message}`);
    return null;
  }

  for (const row of data ?? []) {
    if (!row.source_url || row.source_url === candidate.sourceUrl) continue;
    const rowAnchor = anchorDateOf({ openingDatetime: row.opening_datetime, runStartDate: row.run_start_date, runEndDate: row.run_end_date });
    if (!rowAnchor || !isWithinAnchorWindow(anchorDate, rowAnchor)) continue;
    if (!isLikelySameTitle(row.title, candidate.title)) continue;
    if (!placeNamesLikelySame(row.place_name, candidate.placeName)) continue;
    return { kind: "approved_event", id: row.id, title: row.title, sourceUrl: row.source_url, reasoning: row.curation_reasoning ?? "" };
  }
  return null;
}

// Same idea, the other direction: looks for an already-REJECTED candidate
// that likely describes the same real thing as a candidate that's about
// to be APPROVED. rejected_candidates only carries region_id/anchor_date
// since the migration that added this feature — older rows simply won't
// match, which is fine, they age out via the existing 90-day prune
// anyway. No placeName check here (rejected_candidates never stored it,
// deliberately minimal — see that table's own migration comment) — title
// + region + date window is still a 3-signal check.
async function findConflictingRejectedCandidate(
  client: ReturnType<typeof getSupabaseClient>,
  candidate: Pick<EventCandidate, "title" | "sourceUrl">,
  regionId: string | null,
  anchorDate: string | null,
): Promise<ConflictMatch | null> {
  if (!regionId || !anchorDate) return null;

  const { data, error } = await client
    .from("rejected_candidates")
    .select("id, title, source_url, reason, anchor_date")
    .eq("region_id", regionId)
    .not("anchor_date", "is", null);

  if (error) {
    console.error(`[event-discovery] conflict check (rejected candidates) failed: ${error.message}`);
    return null;
  }

  for (const row of data ?? []) {
    if (row.source_url === candidate.sourceUrl) continue;
    if (!row.anchor_date || !isWithinAnchorWindow(anchorDate, row.anchor_date)) continue;
    if (!isLikelySameTitle(row.title, candidate.title)) continue;
    return { kind: "rejected_candidate", id: row.id, title: row.title, sourceUrl: row.source_url, reasoning: row.reason };
  }
  return null;
}

// Records the conflict and notifies the site owner — never throws, same
// "ancillary, must not break the run" posture as this file's other
// notification side effects. The conflict itself is ALWAYS logged via
// console.log regardless of whether the DB insert or the email succeeds,
// so it's still visible in the run's own logs even in the worst case.
async function recordEscalation(
  client: ReturnType<typeof getSupabaseClient>,
  existing: ConflictMatch,
  candidate: EventCandidate,
  candidatePayload: Record<string, unknown>,
): Promise<void> {
  console.log(
    `[event-discovery] conflict detected: "${candidate.title}" (${candidate.status}) vs existing "${existing.title}" (${existing.kind}) — escalated, not inserted`,
  );

  const acceptToken = crypto.randomBytes(32).toString("hex");
  const rejectToken = crypto.randomBytes(32).toString("hex");

  const { error } = await client.from("curation_escalations").insert({
    existing_kind: existing.kind,
    existing_event_id: existing.kind === "approved_event" ? existing.id : null,
    existing_rejected_id: existing.kind === "rejected_candidate" ? existing.id : null,
    existing_title: existing.title,
    existing_source_url: existing.sourceUrl,
    existing_reasoning: existing.reasoning,
    new_title: candidate.title,
    new_source_url: candidate.sourceUrl ?? "",
    new_status: candidate.status,
    new_reasoning: candidate.curationReasoning,
    new_candidate_payload: candidatePayload,
    accept_token: acceptToken,
    reject_token: rejectToken,
  });

  if (error) {
    console.error(`[event-discovery] failed to record escalation for "${candidate.title}": ${error.message}`);
    return;
  }

  await sendEscalationEmail(
    { title: existing.title, sourceUrl: existing.sourceUrl, reasoning: existing.reasoning },
    { title: candidate.title, sourceUrl: candidate.sourceUrl ?? "", reasoning: candidate.curationReasoning },
    acceptToken,
    rejectToken,
  );
}

// What actually happened to an individual candidate after curation decided
// it — distinct from `status` (Haiku's own "is this real, in-scope art"
// verdict), which is all the email report used to show. Real bug found via
// a user-requested audit (2026-08-10): a report showed "25 aprobados · 0
// insertados" and the user couldn't tell from the per-row "✅ Aprobado"
// badges alone which of the 25 were actually new — turned out ALL 25 were
// re-approvals of events already on the site (see "duplicate_skipped"
// below), but the badge gave no hint of that. This type lets the email
// show the real per-row outcome instead of just Haiku's verdict.
export type InsertOutcome = "inserted" | "replaced" | "duplicate_skipped" | "escalated" | "expired" | "insert_failed";

export async function insertCandidates(
  candidates: EventCandidate[],
  regions: RegionLike[],
  seen: SeenKeys,
  now: Date,
  pipeline: Pipeline,
  rehostImageFn: RehostImageFn = rehostImage,
): Promise<{ insertedCount: number; outcomes: Map<EventCandidate, InsertOutcome> }> {
  const client = getSupabaseClient();
  let inserted = 0;
  const outcomes = new Map<EventCandidate, InsertOutcome>();

  for (const c of candidates) {
    const regionId = matchRegionId(c.location, regions);
    const anchorDate = anchorDateOf(c);

    // Cross-source conflict escalation — checked BEFORE either branch
    // below, for both approved- and rejected-bound candidates, but only
    // ever against the OPPOSITE existing status (same-status "conflicts"
    // aren't conflicts at all — today's ordinary dedup logic already
    // handles those). Only meaningful with a real sourceUrl, needed both
    // for the cross-source comparison itself and for a useful email — an
    // approved candidate always has one (see the INVARIANT enforced
    // elsewhere), a rejected one without one just can't be checked.
    if (c.sourceUrl) {
      const conflict =
        c.status === "approved"
          ? await findConflictingRejectedCandidate(client, c, regionId, anchorDate)
          : await findConflictingApprovedEvent(client, c, regionId, anchorDate);

      if (conflict) {
        // Rehosted NOW, not if/when a human clicks "Aceptar" later — a
        // signed Instagram/Facebook CDN link can rot within hours, and
        // this candidate's decision may not be resolved for days.
        let imageUrl = c.imageUrl;
        if (c.status === "approved" && imageUrl && isSocialMediaUrl(c.sourceUrl)) {
          imageUrl = await rehostImageFn(imageUrl, client);
        }
        const candidatePayload = {
          freeform_location: c.location,
          place_name: c.placeName,
          region_id: regionId,
          title: c.title,
          description: c.description,
          artist: c.artist,
          opening_datetime: c.openingDatetime,
          opening_time_confirmed: c.openingTimeConfirmed,
          run_start_date: c.runStartDate,
          run_end_date: c.runEndDate,
          medium_type: c.mediumType,
          sensitivity_tags: c.sensitivityTags,
          source: "discovered",
          pipeline,
          source_account: c.sourceAccount,
          source_url: c.sourceUrl,
          image_url: imageUrl,
          curation_status: c.status,
          curation_reasoning: c.curationReasoning,
        };
        await recordEscalation(client, conflict, c, candidatePayload);
        outcomes.set(c, "escalated");
        continue;
      }
    }

    // Rejected candidates are no longer stored in `events` — was
    // originally kept for audit (spotting false negatives, a real event
    // wrongly rejected), but that auditing never actually happened in
    // practice, while storing rejected rows was the direct cause of a
    // real crash (2026-07-22, see lib/event-filters.ts/lib/locations.ts's
    // null-safety fixes): processing every candidate, not just approved
    // ones, through the dedup/region-match code let a rejected
    // candidate's null `location` reach a code path that assumed it was
    // always a string. A log line is enough for now — full
    // curationReasoning stays visible in the run's own logs without the
    // DB write or the crash surface that came with it.
    if (c.status !== "approved") {
      console.log(`[event-discovery] rejected: "${c.title}" — ${c.curationReasoning}`);
      // Recorded by source_url only — never touches `location` in the
      // fields that caused the 2026-07-22 crash (location/region_id/
      // anchor_date below are all nullable and best-effort, same
      // defensive posture the 2026-07-30 migration that added them used).
      // Lets a future run skip re-curating this same item (see
      // loadRecentlyRejectedSourceUrls, above) instead of re-spending
      // Haiku tokens on the same verdict every fetch cycle, and lets a
      // LATER candidate's conflict check (above) find this one. Ancillary
      // — a failure here must never break the actual run.
      if (c.sourceUrl) {
        const { error: rejectError } = await client.from("rejected_candidates").upsert(
          {
            source_url: c.sourceUrl,
            title: c.title,
            reason: c.curationReasoning,
            created_at: now.toISOString(),
            location: c.location,
            region_id: regionId,
            anchor_date: anchorDate,
            pipeline,
            source_account: c.sourceAccount,
          },
          { onConflict: "source_url" },
        );
        if (rejectError) {
          console.error(`[event-discovery] failed to record rejected candidate "${c.title}": ${rejectError.message}`);
        }
      }

      // Best-effort, same defensive posture as the rejected_candidates
      // write above — a failure here must never break the run. Runs
      // regardless of sourceUrl (unlike the write above, which is keyed
      // on it) — source_url is nullable on out_of_scope_signals, and a
      // rejection with no URL is just as real a signal as one with one.
      // See out-of-scope-classifier.ts's own doc comment for why this is
      // a deterministic keyword classifier, not a new Haiku field.
      const outOfScopeCategory = classifyOutOfScope(c.curationReasoning);
      if (outOfScopeCategory) {
        const { error: signalError } = await client.from("out_of_scope_signals").insert({
          pipeline,
          category: outOfScopeCategory,
          source_url: c.sourceUrl,
          source_account: c.sourceAccount,
          title: c.title,
          reason: c.curationReasoning,
          region_id: regionId,
          anchor_date: anchorDate,
        });
        if (signalError) {
          console.error(`[event-discovery] failed to record out-of-scope signal "${c.title}": ${signalError.message}`);
        }
      }
      continue;
    }

    if (!isCurrentOrUpcoming(c, now)) {
      // Was previously silent (no log, no DB write at all) — a real,
      // approved candidate could vanish here with zero trace anywhere,
      // found 2026-08-13 tracing a genuinely missing Instagram event that
      // turned out to be exactly this case. Ancillary logging only, same
      // posture as the "rejected"/"duplicate_skipped" branches around it.
      console.log(`[event-discovery] expired before insertion: "${c.title}" (opening/run dates already past)`);
      outcomes.set(c, "expired");
      // Real gap found 2026-08-17, auditing a week of rejections: unlike
      // an ordinary rejection (written to rejected_candidates below, and
      // thus protected by loadRecentlyRejectedSourceUrls' 90-day window),
      // an "expired" candidate got NO durable record at all — its
      // sourceUrl never entered `seen` either (that only happens in the
      // "inserted"/"replaced" branches further down). For a source whose
      // stale content stays on the page indefinitely (a news/blog-style
      // listing, e.g. Centex — confirmed 15 such candidates in a single
      // run, 2026-08-17), that meant re-fetching, re-curating, and
      // re-expiring the SAME item every single week, forever, with zero
      // memory. Recording it here — same upsert, same table, same shape
      // as an ordinary rejection — gives it the exact same 90-day
      // dedup protection instead of none at all.
      if (c.sourceUrl) {
        const { error: expiredError } = await client.from("rejected_candidates").upsert(
          {
            source_url: c.sourceUrl,
            title: c.title,
            reason: `${c.curationReasoning} [FILTRO DE CÓDIGO: aprobado por Haiku pero expiró antes de insertarse; fechas ya pasadas al momento de la corrida]`,
            created_at: now.toISOString(),
            location: c.location,
            region_id: regionId,
            anchor_date: anchorDate,
            pipeline,
            source_account: c.sourceAccount,
          },
          { onConflict: "source_url" },
        );
        if (expiredError) {
          console.error(`[event-discovery] failed to record expired candidate "${c.title}": ${expiredError.message}`);
        }
      }
      continue;
    }

    const titleKey = normalizeTitle(c.title);
    const locDateKey = locationDateKey(c.location, c.placeName, c);
    const locDateOnlyKey = locationDateOnlyKey(c.location, c);
    const titleMatch = seen.titles.get(titleKey);
    const sourceUrlMatch = c.sourceUrl !== null ? seen.sourceUrls.get(c.sourceUrl) : undefined;
    const locationDateMatch = (seen.locationDates.get(locDateKey) ?? []).find((existing) =>
      isLikelySameTitleIgnoringPlaceName(existing.title, c.title, c.placeName),
    );
    // isLikelySameTitleIgnoringPlaceName here too (2026-08-12, same MAC -
    // Parque Forestal bug as locationDateMatch above) — this bucket's own
    // placeNamesLikelySame check confirms the venues are alike separately,
    // but without stripping placeName's words from the title comparison
    // first, a source that bakes its venue name into every title (uchile.cl/
    // artes.uchile.cl) still passes on the venue name alone.
    const fuzzyMatch = (seen.titlesByLocationDateOnly.get(locDateOnlyKey) ?? []).find(
      (existing) =>
        isLikelySameTitleIgnoringPlaceName(existing.title, c.title, c.placeName) &&
        placeNamesLikelySame(existing.placeName, c.placeName),
    );
    // Real gap found 2026-08-14 (factor__f, "BOTÁNICA"): two independently-
    // worded Instagram captions about the same real opening, sharing only
    // 3 of ~9 significant words each — not enough for isLikelySameTitle's
    // 0.6 jaccard/overlap bar, so fuzzyMatch above missed it even though
    // locDateOnlyKey already matched. When the venue name is an EXACT
    // match (not just placeNamesLikelySame's looser "some shared word"),
    // that's already strong independent evidence — only a single
    // genuinely shared significant word is required here, see
    // isLikelySameTitleWithoutRatio's own doc comment.
    //
    // Bucketed by placeName ALONE (titlesByPlaceName), not locDateOnlyKey
    // — a second real gap found the same day (hifas.galeria, "Cartografía
    // del Fuego"): when neither post states an explicit opening date,
    // fillRunStartFromPublishedDate (discover.ts) backfills runStartDate
    // from each POST'S OWN publish date, which genuinely differs post to
    // post — putting the two candidates in DIFFERENT locDateOnlyKey
    // buckets despite being the same real event with the same real
    // runEndDate. Matching on runEndDate alone (when both sides have one)
    // sidesteps that: it's the one date signal actually grounded in the
    // source text here, not backfilled.
    // KNOWN, UNFIXED gap found 2026-08-14 (mssachile, "América despierta"):
    // an institution that posts several content-marketing "highlight" posts
    // about individual rooms/artworks within ONE running exhibition — each
    // captioned with genuinely disjoint vocabulary ("¿Conoces las obras...",
    // "Te invitamos a conocer la sala...", "Últimos días para..." — sharing
    // 0-1 significant words pairwise, since "exposición" itself is a
    // GENERIC_TITLE_WORDS stopword) — produces 4 separate DB rows for the
    // same real exhibition despite an identical placeName + exact
    // runEndDate. Deliberately NOT fixed by dropping the title check for an
    // exact runEndDate match: that would directly reopen the MAC - Parque
    // Forestal regression this file already guards against (below,
    // "Nazca/Sudamericana" vs "Obras extraordinarias" — two genuinely
    // DIFFERENT exhibitions sharing a venue's season-wide dates, same
    // shape: same placeName, same run dates, ~0 shared title words). The
    // two real cases are structurally indistinguishable by word-overlap
    // alone; telling them apart needs actually understanding the caption's
    // content, not just its vocabulary — out of scope for a deterministic
    // string comparator. Accepted as a bounded cost (a duplicate real
    // listing is noise, not fabrication) rather than risking the
    // regression; a moderator can merge duplicates via the admin "Quitar"
    // action same as any other curation touch-up.
    const sameVenueMatch = c.placeName
      ? (seen.titlesByPlaceName.get(normalizeTitle(c.placeName)) ?? []).find(
          (existing) =>
            ((existing.runEndDate && c.runEndDate && existing.runEndDate === c.runEndDate) ||
              locationDateOnlyKey(c.location, existing) === locDateOnlyKey) &&
            isLikelySameTitleWithoutRatio(existing.title, c.title, c.placeName),
        )
      : undefined;
    const existingMatch = titleMatch ?? sourceUrlMatch ?? locationDateMatch ?? fuzzyMatch ?? sameVenueMatch;

    if (existingMatch && !shouldReplaceExisting(c, existingMatch)) {
      const reason = fuzzyMatch && !titleMatch && !sourceUrlMatch && !locationDateMatch
        ? " (same location + date, similar title — likely the same event reported with a different exact hour)"
        : locationDateMatch && !titleMatch && !sourceUrlMatch
          ? " (same location + date, different title/source)"
          : sourceUrlMatch && !titleMatch
            ? " (same sourceUrl, different title)"
            : sameVenueMatch && !titleMatch && !sourceUrlMatch && !locationDateMatch && !fuzzyMatch
              ? " (same exact venue + date, differently-worded title — likely two posts about the same real opening)"
              : "";
      console.log(`[event-discovery] skipping duplicate: "${c.title}"${reason}`);
      outcomes.set(c, "duplicate_skipped");
      continue;
    }

    // Instagram/Facebook's own imageUrl is a signed CDN link that rots
    // within hours-to-days (confirmed against real production samples) —
    // only ever re-hosted for a candidate that's actually about to be
    // inserted (approved, guaranteed by the status check at the top of
    // this loop now). On failure this resolves to null rather than
    // storing a link already known to rot; see image-rehost.ts's own doc
    // comment.
    let imageUrl = c.imageUrl;
    if (imageUrl && c.sourceUrl && isSocialMediaUrl(c.sourceUrl)) {
      imageUrl = await rehostImageFn(imageUrl, client);
    }

    // Real rule, set by the project owner (2026-07-28): a "better" version
    // of an already-stored event (confirmed opening date+time it lacked,
    // or the venue's own site over an aggregator — see
    // shouldReplaceExisting above) REPLACES the existing row in place
    // (same id, so nothing downstream keyed off it breaks) instead of
    // being silently dropped as a duplicate.
    if (existingMatch) {
      const { error: updateError } = await client
        .from("events")
        .update({
          freeform_location: c.location,
          place_name: c.placeName,
          region_id: regionId,
          title: c.title,
          description: c.description,
          artist: c.artist,
          opening_datetime: c.openingDatetime,
          opening_time_confirmed: c.openingTimeConfirmed,
          run_start_date: c.runStartDate,
          run_end_date: c.runEndDate,
          medium_type: c.mediumType,
          sensitivity_tags: c.sensitivityTags,
          source_url: c.sourceUrl,
          pipeline,
          source_account: c.sourceAccount,
          image_url: imageUrl,
          curation_status: c.status,
          curation_reasoning: c.curationReasoning,
        })
        .eq("id", existingMatch.id);

      if (updateError) {
        console.error(`[event-discovery] failed to replace duplicate "${c.title}": ${updateError.message}`);
        continue;
      }

      console.log(
        `[event-discovery] replaced duplicate: "${c.title}" — ${
          c.openingDatetime && c.openingTimeConfirmed && !(existingMatch.openingDatetime && existingMatch.openingTimeConfirmed)
            ? "new version confirms the opening date+time, the stored one didn't"
            : "new version is from the venue's own site, the stored one was from an aggregator"
        }`,
      );

      const updatedInfo: ExistingEventInfo = {
        id: existingMatch.id,
        title: c.title,
        placeName: c.placeName,
        sourceUrl: c.sourceUrl,
        openingDatetime: c.openingDatetime,
        openingTimeConfirmed: c.openingTimeConfirmed,
        runStartDate: c.runStartDate,
        runEndDate: c.runEndDate,
      };
      seen.titles.set(titleKey, updatedInfo);
      if (c.sourceUrl) seen.sourceUrls.set(c.sourceUrl, updatedInfo);
      const bucket = seen.titlesByLocationDateOnly.get(locDateOnlyKey);
      if (bucket) bucket.push(updatedInfo);
      else seen.titlesByLocationDateOnly.set(locDateOnlyKey, [updatedInfo]);
      if (c.placeName) {
        const placeKey = normalizeTitle(c.placeName);
        const placeBucket = seen.titlesByPlaceName.get(placeKey);
        if (placeBucket) placeBucket.push(updatedInfo);
        else seen.titlesByPlaceName.set(placeKey, [updatedInfo]);
      }
      outcomes.set(c, "replaced");
      continue;
    }

    const { data: insertedRow, error } = await client
      .from("events")
      .insert({
        freeform_location: c.location,
        place_name: c.placeName,
        region_id: regionId,
        title: c.title,
        description: c.description,
        artist: c.artist,
        opening_datetime: c.openingDatetime,
        opening_time_confirmed: c.openingTimeConfirmed,
        run_start_date: c.runStartDate,
        run_end_date: c.runEndDate,
        medium_type: c.mediumType,
        sensitivity_tags: c.sensitivityTags,
        source: "discovered",
        pipeline,
        source_account: c.sourceAccount,
        source_url: c.sourceUrl,
        image_url: imageUrl,
        curation_status: c.status,
        curation_reasoning: c.curationReasoning,
      })
      .select("id")
      .single();

    if (error) {
      // Real production incident: one malformed candidate (missing every
      // date field the DB accepts) threw and crashed the entire run,
      // losing every remaining unit and the bright-sources pass. One bad
      // candidate must not cost the whole month's data — log it and move
      // on; it's visible in the workflow's own logs for follow-up.
      console.error(`[event-discovery] failed to insert "${c.title}": ${error.message}`);
      outcomes.set(c, "insert_failed");
      continue;
    }

    // Real id (not just the key strings) recorded here too — .select()
    // above, added alongside the replace-a-duplicate feature (2026-07-28)
    // — so a LATER candidate in this same batch that turns out to be a
    // "better" version of THIS one (see shouldReplaceExisting) can UPDATE
    // it in place instead of just being dropped as a same-batch duplicate.
    const freshInfo: ExistingEventInfo = {
      id: insertedRow.id,
      title: c.title,
      placeName: c.placeName,
      sourceUrl: c.sourceUrl,
      openingDatetime: c.openingDatetime,
      openingTimeConfirmed: c.openingTimeConfirmed,
      runStartDate: c.runStartDate,
      runEndDate: c.runEndDate,
    };
    seen.titles.set(titleKey, freshInfo);
    if (c.sourceUrl) seen.sourceUrls.set(c.sourceUrl, freshInfo);
    // seen.locationDates is deliberately NOT updated here — see this
    // function's own doc comment above (2026-07-23 MAC case): the blind
    // location+date fingerprint only applies against events already
    // stored from a PAST run, never between sibling candidates in this
    // same batch. Sibling comparisons rely on titlesByLocationDateOnly
    // below instead, which requires title similarity too.
    const bucket = seen.titlesByLocationDateOnly.get(locDateOnlyKey);
    if (bucket) bucket.push(freshInfo);
    else seen.titlesByLocationDateOnly.set(locDateOnlyKey, [freshInfo]);
    if (c.placeName) {
      const placeKey = normalizeTitle(c.placeName);
      const placeBucket = seen.titlesByPlaceName.get(placeKey);
      if (placeBucket) placeBucket.push(freshInfo);
      else seen.titlesByPlaceName.set(placeKey, [freshInfo]);
    }
    outcomes.set(c, "inserted");
    inserted += 1;
  }

  return { insertedCount: inserted, outcomes };
}

const EVENT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

// overview.md's retention policy: delete events roughly a year past their
// run's end, not their opening date. Mirrors date.ts's activeRange "end"
// derivation (run_end_date, else run_start_date, else opening_datetime) so
// an event with only a confirmed opening and no run dates is still retained
// relative to that date. Piggybacked on this run's own weekly cadence
// rather than a separate cron (same reasoning as pruneOldRawSearchResults)
// — ancillary, a failure here must never break the actual run.
async function pruneExpiredEvents(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - EVENT_RETENTION_MS).toISOString().slice(0, 10);
  const { error } = await getSupabaseClient().rpc("prune_expired_events", { cutoff_date: cutoff });
  if (error) {
    console.error(`[event-discovery] failed to prune expired events: ${error.message}`);
  }
}

const RAW_SEARCH_RESULTS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// Not a permanent archive — a short rolling window so an on-demand review
// ("¿hay fuentes brillantes nuevas?" shortly after a run) has real data to
// query, without needing a separate cleanup job. Piggybacked on this
// run's own cadence (Event Discovery is manually triggered, no schedule
// yet) rather than a new automation. Ancillary — a failure here must never
// break the actual run.
async function pruneOldRawSearchResults(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - RAW_SEARCH_RESULTS_RETENTION_MS).toISOString();
  const { error } = await getSupabaseClient().from("raw_search_results").delete().lt("created_at", cutoff);
  if (error) {
    console.error(`[event-discovery] failed to prune raw_search_results: ${error.message}`);
  }
}

// ~3 months — see rejected_candidates' own migration doc comment for why
// this window exists at all (skip re-curating a bright source's typically-
// static listing every run, without excluding an item forever if its
// content genuinely changes later).
export const REJECTED_CANDIDATE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

async function pruneOldRejectedCandidates(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - REJECTED_CANDIDATE_WINDOW_MS).toISOString();
  const { error } = await getSupabaseClient().from("rejected_candidates").delete().lt("created_at", cutoff);
  if (error) {
    console.error(`[event-discovery] failed to prune rejected_candidates: ${error.message}`);
  }
}

// Pre-curation dedup — bright sources only (see docs/region-discovery.md's
// dated section on this): a fixed listing (e.g. a museum's cartelera, or
// chilecultura.gob.cl's ~50-item national Artes-visuales feed) mostly
// repeats week to week, and until now every item got re-sent to Haiku
// regardless, spending real tokens re-deriving the exact same verdict.
// Returns every source_url this bright-source item set should be filtered
// against BEFORE it ever reaches curateBrightSourceItems: source_urls
// already rejected within the rolling window, keyed only by source_url
// (never touches location — that's the field whose null-ness caused the
// 2026-07-22 crash that got rejected-candidate storage removed from
// `events` in the first place).
export async function loadRecentlyRejectedSourceUrls(now: Date): Promise<Set<string>> {
  const cutoff = new Date(now.getTime() - REJECTED_CANDIDATE_WINDOW_MS).toISOString();
  const { data, error } = await getSupabaseClient()
    .from("rejected_candidates")
    .select("source_url")
    .gte("created_at", cutoff);
  if (error) {
    throw new Error(`Failed to load rejected_candidates: ${error.message}`);
  }
  return new Set((data ?? []).map((row) => row.source_url));
}

// Logs EVERY raw Tavily hit for a unit (before filterKnownExclusions, so
// the log reflects everything Tavily actually returned) — not just what
// Haiku turns into a candidate. `events` can't serve this purpose: a
// weak-snippet aggregator page can show up in every search and never
// produce a single candidate, so it would never appear there. Purpose:
// spot a domain that keeps showing up (a possible bright-source
// candidate, found the same way mnba.gob.cl was) without re-running
// searches by hand. Ancillary — a failure here must never break the
// actual run.
async function logRawSearchResults(unitName: string, results: RawResult[]): Promise<void> {
  if (results.length === 0) return;
  const rows = results.map((r) => {
    let domain: string;
    try {
      domain = knownSourceDomain(r.url);
    } catch {
      domain = r.url; // unparseable — keep something queryable rather than dropping the row
    }
    return { unit_name: unitName, domain, url: r.url, title: r.title, score: r.score };
  });
  const { error } = await getSupabaseClient().from("raw_search_results").insert(rows);
  if (error) {
    console.error(`[event-discovery] failed to log raw search results for ${unitName}: ${error.message}`);
  }
}

// Ancillary bookkeeping, same posture as pruneOldRawSearchResults/
// recordBrightSourcesFetched — a failure here must never fail the whole
// run, since by the time this runs (the very last step) every unit and
// bright source has already been fully processed and saved. Real
// production bug (2026-07-17): a domain-normalization mismatch (fixed in
// detectNewBrightSources) let an ALREADY-known source repeatedly get
// flagged "new", hitting detected_sources' unique constraint on url and
// crashing an otherwise-fully-successful run at the last step. Even with
// that root cause fixed, this loop stays defensive — a duplicate/race
// here is a real possibility (e.g. two runs overlapping) and shouldn't
// be allowed to mark real, already-saved event data as a failed run.
async function persistNewBrightSources(candidates: EventCandidate[], now: Date, excludeDomains: string[]): Promise<void> {
  const detected = detectNewBrightSources(candidates, now, excludeDomains);
  if (detected.length === 0) return;

  const client = getSupabaseClient();
  for (const source of detected) {
    const { error } = await client.from("detected_sources").insert({
      url: source.url,
      note: source.note,
    });
    if (error) {
      console.error(`[event-discovery] failed to persist detected source ${source.url}: ${error.message}`);
      continue;
    }
    console.log(`[event-discovery] new bright source auto-added: ${source.url}`);
  }
}

export interface RunDeps {
  messagesClient?: MessagesClient;
  searchUnitFn?: typeof searchUnit;
  fetchBrightSourcesFn?: typeof fetchBrightSources;
  pageFetchFn?: PageFetchLike;
  rehostImageFn?: RehostImageFn;
  sendRunSummaryEmailFn?: typeof sendRunSummaryEmail;
  now?: Date;
  // Added 2026-07-23: a manual "just run bright sources" request kept
  // triggering a full run, which also picked up the next `weekly_batch_size`
  // due comunas — spending real Tavily/Haiku cost on a batch nobody asked
  // for, just to test/refresh a handful of bright sources. Skips
  // getUnitsDueForRun and the whole comuna loop entirely; bright sources
  // still only fetch if actually due (isSourceDue) — this doesn't force
  // them, it only removes the comuna batch as a side effect of checking.
  brightSourcesOnly?: boolean;
  // Added 2026-07-23: debugging one misbehaving bright source (e.g.
  // arteinformado.com's "Cannot read properties of null" failure) meant
  // waiting for its own 7-day cadence, or clearing EVERY source's fetch
  // state just to force the one you actually wanted logs for. A substring
  // match against each source's own url (e.g. "arteinformado.com",
  // "parquecultural.cl") — when set, this REPLACES the normal isSourceDue
  // check entirely for that filtered set: a matched source runs
  // regardless of its own cadence, and everything else is skipped, not
  // just deprioritized. Implies brightSourcesOnly in spirit (there's
  // rarely a reason to also want the comuna batch when debugging one
  // named source) but doesn't force it — set both explicitly if that's
  // not what you want.
  brightSourceUrlFilter?: string[];
}

export function toCandidateSummary(c: EventCandidate, outcome?: InsertOutcome): CandidateSummary {
  return {
    title: c.title,
    status: c.status,
    location: c.location,
    placeName: c.placeName,
    runStartDate: c.runStartDate,
    runEndDate: c.runEndDate,
    curationReasoning: c.curationReasoning,
    sourceUrl: c.sourceUrl,
    outcome: outcome ?? null,
  };
}

export async function run(deps: RunDeps = {}): Promise<void> {
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!tavilyApiKey && !deps.searchUnitFn) {
    throw new Error("TAVILY_API_KEY is not set");
  }

  const now = deps.now ?? new Date();
  const messagesClient: MessagesClient = deps.messagesClient ?? new Anthropic();
  const searchUnitFn = deps.searchUnitFn ?? searchUnit;
  const fetchBrightSourcesFn = deps.fetchBrightSourcesFn ?? fetchBrightSources;
  const pageFetchFn = deps.pageFetchFn ?? fetch;
  const rehostImageFn = deps.rehostImageFn ?? rehostImage;
  const client = getSupabaseClient();

  await pruneOldRawSearchResults(now);
  await pruneExpiredEvents(now);
  await pruneOldRejectedCandidates(now);

  const systemPrompt = buildSystemPrompt(currentMonthLabel(now));
  const brightSources = mergeBrightSources(await loadDetectedSources());
  // excludeDomains stays based on EVERY known bright source, not just the
  // due ones — a domain we've decided to treat as a bright source should
  // never resurface via regular Tavily search, independent of whether
  // we're actually re-fetching it this particular run. Also includes the
  // known low-quality-extraction domains (KNOWN_LOW_QUALITY_SOURCE_DOMAINS,
  // e.g. infobae.com's multi-country agenda-cultura pages) — passed to
  // Tavily so it ideally never returns them at all (saves the credits/
  // tokens of a result we'd discard anyway); filterKnownExclusions still
  // filters the same domains from whatever Tavily actually returns, since
  // exclude_domains isn't perfectly reliable on Tavily's side.
  const excludeDomains = [...brightSources.map((s) => knownSourceDomain(s.url)), ...KNOWN_LOW_QUALITY_SOURCE_DOMAINS];
  const fetchState = await loadBrightSourceFetchState();
  const dueBrightSources = deps.brightSourceUrlFilter?.length
    ? brightSources.filter((s) => deps.brightSourceUrlFilter!.some((f) => s.url.includes(f)))
    : brightSources.filter((s) => isSourceDue(fetchState.get(s.url), now));
  const seenKeys = await loadExistingKeys();
  const regions = await loadAllRegions();
  const allCandidates: EventCandidate[] = [];
  // Pre-curation dedup, bright sources only (docs/region-discovery.md).
  // Never asks Haiku about an item we've already approved (any age) or
  // rejected (within the rolling window) — computed once per run, reused
  // across every due bright source below.
  const rejectedSourceUrls = await loadRecentlyRejectedSourceUrls(now);
  const excludedSourceUrls = new Set([...seenKeys.sourceUrls.keys(), ...rejectedSourceUrls]);

  const units = deps.brightSourcesOnly ? [] : await getUnitsDueForRun(now);
  console.log(
    deps.brightSourcesOnly
      ? `[event-discovery] bright-sources-only run: skipping comuna batch, ${dueBrightSources.length}/${brightSources.length} bright source(s) due`
      : `[event-discovery] ${units.length} unit(s) due, ${dueBrightSources.length}/${brightSources.length} bright source(s) due`,
  );

  // Accumulated purely from data the run already computes (usage/credits
  // already returned by curate()/searchUnitFn) — no new API calls, see
  // sendRunSummaryEmail's own doc comment.
  const summary: RunSummary = {
    startedAt: now,
    units: { total: 0, failed: [] },
    comunas: [],
    brightSources: { due: dueBrightSources.length, total: brightSources.length },
    candidates: {
      total: 0,
      approvedByCuration: 0,
      rejectedByCuration: 0,
      insertedCount: 0,
      byMediumType: {},
      sensitivityTagged: 0,
    },
    eventGroups: [],
    cost: { anthropicUsd: 0, tavilyCredits: 0, tavilyUsd: 0, totalUsd: 0, monthToDateUsd: 0, monthlyBudgetUsd: 0 },
  };

  for (const unit of units) {
    summary.units.total += 1;
    summary.comunas.push(unit.name);

    // Real production bug (2026-07-17, weekly-batch rollout's first live
    // run): an uncaught exception processing ONE unit (Haiku returned
    // status:"approved" with location:null, crashing isChileanLocation)
    // killed the entire run — losing every remaining unit in the batch,
    // not just the bad one, and none of them got their last_run_at
    // updated despite Tavily credits/Haiku tokens already spent on the
    // ones that DID complete first. A weekly batch of 25+ units makes
    // this much more costly than it was as a single-digit-unit risk
    // before. Isolating per-unit like insertCandidates already isolates
    // per-candidate: one broken unit is logged and skipped, not fatal to
    // the rest of the batch. Deliberately does NOT update last_run_at/
    // status for a failed unit — it stays "due" and gets retried next
    // run, rather than being silently marked done with no real data.
    try {
      const { results: rawResults, credits } = await searchUnitFn(tavilyApiKey ?? "", unit.name, now, excludeDomains);
      console.log(`[event-discovery] ${unit.name}: ${rawResults.length} results, ${credits} Tavily credits`);
      summary.cost.tavilyCredits += credits;
      await logRawSearchResults(unit.name, rawResults);

      // Drop known-out-of-scope results before they ever reach Haiku — saves
      // both the input tokens for that result's content and the output
      // tokens Haiku would've spent on a candidate we'd just discard anyway.
      const results = filterKnownExclusions(rawResults);
      if (results.length !== rawResults.length) {
        console.log(`[event-discovery] ${unit.name}: dropped ${rawResults.length - results.length} known-excluded result(s) before curation`);
      }

      let inserted = 0;
      if (results.length > 0) {
        const block = buildBlock(`Resultados de búsqueda para "${unit.name}"`, results);
        const { candidates, usage } = await curate(messagesClient, systemPrompt, block);
        await recordUsage({
          purpose: "event_discovery",
          model: EVENT_DISCOVERY_MODEL,
          regionId: unit.id,
          pipeline: "comuna_search",
          usage,
        });
        summary.cost.anthropicUsd += estimateCostUsd(EVENT_DISCOVERY_MODEL, usage);
        await enrichCandidates(candidates, pageFetchFn, now, regions);
        allCandidates.push(...candidates);
        const { insertedCount, outcomes } = await insertCandidates(candidates, regions, seenKeys, now, "comuna_search", rehostImageFn);
        summary.eventGroups.push({ label: unit.name, candidates: candidates.map((c) => toCandidateSummary(c, outcomes.get(c))) });
        summary.candidates.insertedCount += insertedCount;
        inserted = insertedCount;
      }

      // A comuna's first real run graduates it out of 'not_started' — restores
      // real meaning to `status` (previously written once at seed time, then
      // never touched again by a run). 'active'/'excluded' otherwise pass
      // through untouched; only 'not_started' ever flips here.
      const nextStatus = unit.status === "not_started" ? "active" : unit.status;
      const { error } = await client
        .from("regions")
        .update({ last_run_at: now.toISOString(), status: nextStatus })
        .eq("id", unit.id);
      if (error) {
        throw new Error(`Failed to update last_run_at for ${unit.name}: ${error.message}`);
      }

      console.log(`[event-discovery] ${unit.name}: ${inserted} new approved event(s)`);
    } catch (err) {
      summary.units.failed.push(unit.name);
      console.error(`[event-discovery] ${unit.name}: unit failed, skipping (stays due for next run): ${(err as Error).message}`);
    }
  }

  // Bright sources: fetched directly, curated ONE SOURCE AT A TIME — not
  // attached to each unit's prompt (real runs showed Haiku inconsistently
  // surfacing that content when attached per-unit). Only the ones due for
  // their own 7-day cadence get fetched at all.
  //
  // Was ONE combined curate() call over every due source's content at
  // once — real production crash (2026-07-23): with enough sources due
  // together (arteinformado.com's own multi-page content alone is
  // sizeable), Haiku's response hit its max_tokens ceiling mid-JSON and
  // curate() choked, losing EVERY source's candidates for that run, not
  // just the oversized one. curate() itself was also hardened the same
  // day to degrade to zero candidates (keeping the real usage) instead of
  // throwing on a parse failure — but that alone doesn't fix a single
  // source alone being enough to blow the budget. Splitting into
  // one-call-per-source, same isolation as the per-unit comuna loop
  // above, means a single oversized/truncated source only loses ITS OWN
  // candidates, not every other due source's.
  if (dueBrightSources.length > 0) {
    const brightResults = await fetchBrightSourcesFn(dueBrightSources);
    const monthLabel = currentMonthLabel(now);
    for (const result of brightResults) {
      // "items": a source with a real extractor config — deterministic
      // title/sourceUrl/imageUrl/dates, Haiku only does curatorial
      // judgment (curateBrightSourceItems, discover.ts). "rawResult": the
      // old fallback path, still used for auto-detected sources with no
      // extractor config yet — unchanged curate()/isBrightSource behavior.
      const sourceUrl = result.kind === "items" ? result.source.url : result.result.url;
      try {
        let candidates: EventCandidate[];
        let usage: DiscoverUsage;
        if (result.kind === "items") {
          // Pre-curation dedup — skip anything already approved (ever) or
          // rejected (within the rolling window) before it ever reaches
          // Haiku. See excludedSourceUrls' own comment, above.
          const newItems = result.items.filter((item) => !excludedSourceUrls.has(item.sourceUrl));
          const skipped = result.items.length - newItems.length;
          if (skipped > 0) {
            console.log(`[event-discovery] bright source ${sourceUrl}: ${skipped}/${result.items.length} item(s) already seen, skipped before curation`);
          }
          if (newItems.length === 0) {
            console.log(`[event-discovery] bright source ${sourceUrl}: nothing new, skipping curation entirely`);
            continue;
          }
          // Real production bug, found 2026-07-28 (museodeancud.gob.cl): a
          // genuine exhibition got rejected because Haiku only ever saw its
          // title/dates/place, never the real description — this source's
          // LISTING page has no prose, only its detail page does, and that
          // was previously only fetched for already-approved candidates.
          // See enrichBrightSourceItemDetails' own doc comment.
          await enrichBrightSourceItemDetails(newItems, pageFetchFn);
          ({ candidates, usage } = await curateBrightSourceItems(messagesClient, newItems, monthLabel, {
            fixedLocation: result.source.fixedLocation,
          }));
        } else {
          const block = buildBlock("Fuentes brillantes (no específicas a ninguna comuna)", [result.result]);
          ({ candidates, usage } = await curate(messagesClient, systemPrompt, block, { isBrightSource: true }));
        }
        await recordUsage({ purpose: "event_discovery", model: EVENT_DISCOVERY_MODEL, pipeline: "bright_source", usage });
        summary.cost.anthropicUsd += estimateCostUsd(EVENT_DISCOVERY_MODEL, usage);
        await enrichCandidates(candidates, pageFetchFn, now, regions);
        allCandidates.push(...candidates);
        const { insertedCount, outcomes } = await insertCandidates(candidates, regions, seenKeys, now, "bright_source", rehostImageFn);
        summary.eventGroups.push({ label: sourceUrl, candidates: candidates.map((c) => toCandidateSummary(c, outcomes.get(c))) });
        summary.candidates.insertedCount += insertedCount;
        console.log(`[event-discovery] bright source ${sourceUrl}: ${insertedCount} new approved event(s)`);
      } catch (err) {
        // Stack, not just message — a real production case (2026-07-23,
        // arteinformado.com: "Cannot read properties of null (reading
        // 'replace')") had no line number to go on afterward, since only
        // .message was ever logged.
        console.error(`[event-discovery] bright source ${sourceUrl}: pass failed, skipping: ${(err as Error).stack ?? (err as Error).message}`);
      }
    }
    await recordBrightSourcesFetched(
      dueBrightSources.map((s) => s.url),
      now,
    );
  }

  await persistNewBrightSources(allCandidates, now, excludeDomains);

  // Ancillary reporting only — by this point every unit/bright-source has
  // already been fully processed and saved, so a failure computing or
  // sending the summary must never surface as a failed run (this file has
  // no top-level error handling; an uncaught rejection here would mark an
  // otherwise fully-successful GitHub Action run as failed).
  try {
    summary.candidates.total = allCandidates.length;
    for (const c of allCandidates) {
      if (c.status === "approved") summary.candidates.approvedByCuration += 1;
      if (c.status === "rejected") summary.candidates.rejectedByCuration += 1;
      summary.candidates.byMediumType[c.mediumType] = (summary.candidates.byMediumType[c.mediumType] ?? 0) + 1;
      if (c.sensitivityTags.length > 0) summary.candidates.sensitivityTagged += 1;
    }
    summary.cost.tavilyUsd = summary.cost.tavilyCredits * TAVILY_COST_PER_CREDIT;
    summary.cost.totalUsd = summary.cost.anthropicUsd + summary.cost.tavilyUsd;
    summary.cost.monthToDateUsd = await getCurrentMonthSpend();
    summary.cost.monthlyBudgetUsd = await getConfigNumber("monthly_budget_usd");

    // Recorded BEFORE the email send — this must survive a real Resend
    // failure (RESEND_API_KEY not set today just no-ops, doesn't throw,
    // but a genuine API error shouldn't cost us the persisted summary
    // too, see recordRunSummary's own doc comment on why this exists).
    await recordRunSummary("event_discovery", summary.startedAt, summary.candidates, summary.eventGroups, summary.cost);
    await (deps.sendRunSummaryEmailFn ?? sendRunSummaryEmail)(summary);
  } catch (err) {
    console.error(`[event-discovery] failed to build/send run-summary email: ${(err as Error).message}`);
  }
}
