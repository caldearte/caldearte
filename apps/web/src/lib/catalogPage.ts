import type { EventRecord } from "./events";
import { activeRange } from "./date";

// Pure helpers shared by the venue and artist pages (no next/cache, no
// Supabase — testable on their own).

// A catalog page (venue or artist) with a single show is thin content —
// worth serving to anyone who lands on it, not worth asking Google to
// index. Measured 2026-10-02: 87 of 257 live venues have 2+ events. Below
// this a page renders noindex and stays out of the sitemap.
export const MIN_EVENTS_TO_INDEX = 2;

// Day-level on purpose, unlike lib/date's month-level isCurrentOrUpcoming
// (which exists for the home page's lookahead): on a venue's or artist's
// own page, a show that closed yesterday listed under "en cartelera" would
// simply be wrong. A show with no resolvable date (the DB constraint says
// that can't happen) goes to "past" rather than being promised as current.
export function splitCurrentAndPast(
  events: readonly EventRecord[],
  todayStr: string,
): { current: EventRecord[]; past: EventRecord[] } {
  const withRange = events.map((event) => ({ event, range: activeRange(event) }));
  const current = withRange
    .filter((x) => x.range !== null && x.range.end >= todayStr)
    .sort((a, b) => (a.range?.start ?? "").localeCompare(b.range?.start ?? ""))
    .map((x) => x.event);
  const past = withRange
    .filter((x) => x.range === null || x.range.end < todayStr)
    .sort((a, b) => (b.range?.end ?? "").localeCompare(a.range?.end ?? ""))
    .map((x) => x.event);
  return { current, past };
}

// Groups the shared approved-events list by whichever catalog entity each
// event belongs to. `entityIdsByEventId` comes from a small link query
// (events_public.venue_id, event_artists_public) — the events themselves
// are NOT re-fetched per page type: they already live in one cache entry
// (lib/events.ts's fetchApprovedEvents, ~750 kB at 457 events), and
// keeping a second and third copy of them under venue/artist caches would
// triple that storage for no reason. Entities absent from `entityIds`
// (hidden, or no live event) simply collect nothing.
export function groupEventsByEntity(
  events: readonly EventRecord[],
  entityIdsByEventId: Readonly<Record<string, readonly string[]>>,
  entityIds: ReadonlySet<string>,
): Record<string, EventRecord[]> {
  const grouped: Record<string, EventRecord[]> = {};
  for (const event of events) {
    for (const entityId of entityIdsByEventId[event.id] ?? []) {
      if (!entityIds.has(entityId)) continue;
      (grouped[entityId] ??= []).push(event);
    }
  }
  return grouped;
}
