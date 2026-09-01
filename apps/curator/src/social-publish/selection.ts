// Pure selection logic for the automated Instagram carousel (docs/roadmap.md,
// Fase 4 — redesigned 2026-08-31 into a single "agenda" carousel, see the
// plan doc referenced in that commit). Deliberately takes already-loaded
// plain data (events, region names, the de-dup log) rather than querying
// Supabase itself — same posture as newsletter/run.ts's
// buildDigestSections, keeps this testable without a DB and lets the
// eventual run.ts own the actual fetching.
import { diversifyByComuna } from "../lib/diversify.js";

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
  // Added 2026-08-29, alongside events.event_type — selectUpcoming (below)
  // reads this to admit inauguracion + visita_guiada while still excluding
  // exposicion, since all 3 categories can populate openingDatetime. See
  // packages/curation-policy/src/policy.ts's EVENT_TYPE_POLICY.
  eventType: "inauguracion" | "visita_guiada" | "exposicion";
  // Instagram handle of the account this event was sourced from — only
  // ever set for the Instagram pipeline (the account IS usually the
  // venue/artist's own), null for bright_source/other pipelines. Used to
  // @mention the venue in the post's caption (Daniel 2026-08-23: real
  // outreach lever — a tagged venue has a direct incentive to reshare to
  // its own audience, which a caption with no tag doesn't give it).
  sourceAccount: string | null;
  // Same idea, for the ARTIST specifically (Daniel 2026-08-25) — see
  // event-discovery/discover.ts's EventCandidate.artistInstagramHandle
  // doc comment for the real engagement signal that prompted this. Only
  // populated when the source post itself @-mentioned the artist by
  // name; never guessed from their plain name.
  artistInstagramHandle: string | null;
}

export const CAROUSEL_CAP = 10;

// Never included in any automated post — the site's own blur/family-mode
// is a per-visitor exposure control, not a publish-time filter, and
// Instagram has its own content policies a flagged post could trip. A
// smaller carousel is a fine tradeoff for never risking the account —
// explicit decision, 2026-08-22.
//
// Also requires a real imageUrl — real bug, found testing against
// production data 2026-08-23: selectInauguraciones/selectNoTeLaPierdas
// didn't check for one (only selectDestacada did, as part of its own
// "enough real content" quality bar), so an event with no image would
// have produced a flyer with a blank/broken photo zone in a real post.
// The flyer layout has no fallback for a missing photo — every automated
// carousel type needs one, not just destacada.
//
// Excludes .webp images too — real bug, found in a real "destacada" post
// failing 2026-08-23: the flyer renderer (Satori/next-og) can't determine
// a .webp image's dimensions ("Image size cannot be determined"), so the
// flyer route 500s and Instagram rejects the whole carousel. Only 2 of
// 131 production events have a .webp source image — not worth adding an
// image-conversion dependency (e.g. sharp) for, so these are simply
// excluded from automated posts, same as no-image events.
function isEligibleForAutoPost(e: SocialEvent): boolean {
  return e.sensitivityTags.length === 0 && Boolean(e.imageUrl) && !e.imageUrl!.toLowerCase().endsWith(".webp");
}

// The one and only selector now (redesigned 2026-08-31, Camila's "bitácora"
// request): inauguraciones + visitas guiadas mixed into a single carousel,
// scoped to a short date window (Mon posts Mon+Tue, Wed posts Wed+Thu, Fri
// posts Fri-Sun — see run.ts's postingWindowFor) instead of the whole week.
// Every event that's ever been posted is excluded permanently via
// alreadyPostedIds — nothing repeats across posts anymore, unlike the old
// inauguracion type's deliberate weekly repeat.
export function selectUpcoming(
  events: SocialEvent[],
  window: { start: string; end: string },
  alreadyPostedIds: ReadonlySet<string>,
  cap = CAROUSEL_CAP,
): SocialEvent[] {
  const eligible = events
    .filter(isEligibleForAutoPost)
    .filter((e) => e.eventType === "inauguracion" || e.eventType === "visita_guiada")
    .filter((e) => !alreadyPostedIds.has(e.id))
    .filter((e) => e.openingDatetime && e.openingDatetime.slice(0, 10) >= window.start && e.openingDatetime.slice(0, 10) <= window.end)
    .sort((a, b) => a.openingDatetime!.localeCompare(b.openingDatetime!));
  // diversifyByComuna round-robins ("round 1: each comuna's soonest event,
  // round 2: each comuna's second-soonest, ...") once truncating to cap —
  // that can interleave dates out of order across comunas, so the final
  // carousel is re-sorted chronologically after diversifying rather than
  // trusting diversifyByComuna's own output order.
  return diversifyByComuna(eligible, cap).sort((a, b) => a.openingDatetime!.localeCompare(b.openingDatetime!));
}
