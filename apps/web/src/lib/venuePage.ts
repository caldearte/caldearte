import type { EventRecord } from "./events";
import { activeRange } from "./date";
import { venueIdPrefixFromSlug } from "./venueSlug";

// Pure half of the venue pages (no next/cache, no Supabase) so it is
// testable on its own — venues.ts holds the cached fetch.

export interface VenueRecord {
  id: string;
  name: string;
  comuna: string | null;
  instagramHandle: string | null;
}

export interface VenueData {
  venues: VenueRecord[];
  eventsByVenueId: Record<string, EventRecord[]>;
}

// A venue page with a single show is thin content — worth serving to
// anyone who lands on it, not worth asking Google to index (measured
// 2026-10-02: 87 of 257 live venues have 2+ events). Below this the page
// renders noindex and stays out of the sitemap.
export const MIN_EVENTS_TO_INDEX = 2;

export function findVenueBySlug(venues: readonly VenueRecord[], slug: string): VenueRecord | undefined {
  const prefix = venueIdPrefixFromSlug(slug);
  if (!prefix) return undefined;
  return venues.find((v) => v.id.toLowerCase().startsWith(prefix));
}

export interface VenuePageData {
  venue: VenueRecord;
  current: EventRecord[];
  past: EventRecord[];
  totalEvents: number;
  indexable: boolean;
}

// Day-level on purpose, unlike lib/date's month-level isCurrentOrUpcoming
// (which exists for the home page's lookahead): on a venue's own page, a
// show that closed yesterday listed under "en cartelera" would simply be
// wrong. A show with no resolvable date (the DB constraint says that
// can't happen) goes to "past" rather than being promised as current.
export function buildVenuePageData(venue: VenueRecord, events: readonly EventRecord[], todayStr: string): VenuePageData {
  const withRange = events.map((event) => ({ event, range: activeRange(event) }));
  const current = withRange
    .filter((x) => x.range !== null && x.range.end >= todayStr)
    .sort((a, b) => (a.range?.start ?? "").localeCompare(b.range?.start ?? ""))
    .map((x) => x.event);
  const past = withRange
    .filter((x) => x.range === null || x.range.end < todayStr)
    .sort((a, b) => (b.range?.end ?? "").localeCompare(a.range?.end ?? ""))
    .map((x) => x.event);
  return {
    venue,
    current,
    past,
    totalEvents: events.length,
    indexable: events.length >= MIN_EVENTS_TO_INDEX,
  };
}
