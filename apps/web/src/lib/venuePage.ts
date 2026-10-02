import type { EventRecord } from "./events";
import { activeRange } from "./date";
import { venueIdPrefixFromSlug, venueSlug } from "./venueSlug";

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

export interface VenueLink {
  href: string;
  name: string;
}

// Where an event page links to its venue's page. Only when that page has
// something to add: a venue whose only show is THIS event would send the
// visitor to a page listing the event they are already on (and that
// renders noindex besides) — same MIN_EVENTS_TO_INDEX bar as the sitemap,
// so the site never links internally to a page it tells Google to skip.
export function findVenueLinkForEvent(data: VenueData, eventId: string): VenueLink | null {
  const venue = data.venues.find((v) => data.eventsByVenueId[v.id]?.some((e) => e.id === eventId));
  if (!venue) return null;
  if ((data.eventsByVenueId[venue.id]?.length ?? 0) < MIN_EVENTS_TO_INDEX) return null;
  return { href: `/espacios/${venueSlug(venue)}`, name: venue.name };
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
