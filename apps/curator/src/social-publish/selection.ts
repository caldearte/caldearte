// Pure selection logic for the 3 automated Instagram carousel types
// (docs/roadmap.md, Fase 4). Deliberately takes already-loaded plain data
// (events, region names, the de-dup log) rather than querying Supabase
// itself — same posture as newsletter/run.ts's buildDigestSections, keeps
// this testable without a DB and lets the eventual run.ts own the actual
// fetching.
import { diversifyByComuna } from "../lib/diversify.js";

export type SocialPostType = "inauguracion" | "no_te_la_pierdas" | "destacada";

export interface SocialEvent {
  id: string;
  title: string;
  artist: string | null;
  placeName: string | null;
  comunaName: string | null;
  imageUrl: string | null;
  description: string | null;
  sensitivityTags: string[];
  openingDatetime: string | null;
  openingTimeConfirmed: boolean;
  runStartDate: string | null;
  runEndDate: string | null;
}

export const CAROUSEL_CAP = 10;

// Never included in any automated post — the site's own blur/family-mode
// is a per-visitor exposure control, not a publish-time filter, and
// Instagram has its own content policies a flagged post could trip. A
// smaller carousel is a fine tradeoff for never risking the account —
// explicit decision, 2026-08-22.
function isSafeForAutoPost(e: SocialEvent): boolean {
  return e.sensitivityTags.length === 0;
}

function isRunningOn(e: SocialEvent, dateStr: string): boolean {
  if (e.runStartDate && e.runStartDate > dateStr) return false;
  if (e.runEndDate && e.runEndDate < dateStr) return false;
  return true;
}

// (A) Inauguraciones — ordered by fecha de apertura ascending, nationwide.
// Deliberately no de-dup against social_post_log: repeating the same
// inauguración across the week's posts is the intended behavior (it's a
// recurring reminder to attend, not a one-time announcement) — see
// docs/roadmap.md.
export function selectInauguraciones(events: SocialEvent[], week: { start: string; end: string }, cap = CAROUSEL_CAP): SocialEvent[] {
  const eligible = events
    .filter(isSafeForAutoPost)
    .filter((e) => e.openingDatetime && e.openingDatetime.slice(0, 10) >= week.start && e.openingDatetime.slice(0, 10) <= week.end)
    .sort((a, b) => a.openingDatetime!.localeCompare(b.openingDatetime!));
  return diversifyByComuna(eligible, cap);
}

// (B) "No te la pierdas" — expos closing within the current Santiago week
// (same "closing soon" window as apps/web/src/lib/date.ts's own
// isClosingSoon, so this matches the site's own "últimos días" framing),
// ordered by fecha de fin ascending. alreadyPostedIds excludes whatever
// this same post type already featured this week — see social_post_log's
// own migration comment for why 'inauguracion' never populates that set.
export function selectNoTeLaPierdas(
  events: SocialEvent[],
  todayStr: string,
  week: { start: string; end: string },
  alreadyPostedIds: ReadonlySet<string>,
  cap = CAROUSEL_CAP,
): SocialEvent[] {
  const eligible = events
    .filter(isSafeForAutoPost)
    .filter((e) => !alreadyPostedIds.has(e.id))
    .filter((e) => e.runEndDate && e.runEndDate >= todayStr && e.runEndDate <= week.end)
    .sort((a, b) => a.runEndDate!.localeCompare(b.runEndDate!));
  return diversifyByComuna(eligible, cap);
}

// (C) Selección/destacada — currently-running, non-sensitive expos with
// enough real content to feature (a real photo, a real description — no
// placeholder/thin listing), excluding whatever this same post type
// already featured this week, ordered by how long since each one last
// appeared as a destacada (lastFeaturedAt: null = never featured, sorts
// first) so the rotation actually rotates instead of resurfacing the same
// handful every week.
const MIN_DESCRIPTION_LENGTH = 40;

export function selectDestacada(
  events: SocialEvent[],
  todayStr: string,
  alreadyPostedIds: ReadonlySet<string>,
  lastFeaturedAt: ReadonlyMap<string, string>,
  cap = CAROUSEL_CAP,
): SocialEvent[] {
  const eligible = events
    .filter(isSafeForAutoPost)
    .filter((e) => !alreadyPostedIds.has(e.id))
    .filter((e) => isRunningOn(e, todayStr))
    .filter((e) => e.imageUrl && e.description && e.description.length >= MIN_DESCRIPTION_LENGTH)
    .sort((a, b) => {
      const aLast = lastFeaturedAt.get(a.id) ?? "";
      const bLast = lastFeaturedAt.get(b.id) ?? "";
      return aLast.localeCompare(bLast);
    });
  return diversifyByComuna(eligible, cap);
}
