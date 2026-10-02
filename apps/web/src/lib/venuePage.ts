import type { EventRecord } from "./events";
import { MIN_EVENTS_TO_INDEX, groupEventsByEntity, splitCurrentAndPast } from "./catalogPage";
import { findBySlug, venueSlug } from "./venueSlug";

// Pure half of the venue pages (no next/cache, no Supabase) so it is
// testable on its own — venues.ts holds the cached fetch.

export { MIN_EVENTS_TO_INDEX };

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

export function findVenueBySlug(venues: readonly VenueRecord[], slug: string): VenueRecord | undefined {
  return findBySlug(venues, slug);
}

// venueIdByEventId is the small link query (events_public.venue_id); the
// events come from the shared approved-events cache — see
// catalogPage.ts's groupEventsByEntity.
export function assembleVenueData(
  venues: readonly VenueRecord[],
  venueIdByEventId: Readonly<Record<string, string>>,
  events: readonly EventRecord[],
): VenueData {
  const entityIdsByEventId: Record<string, string[]> = {};
  for (const [eventId, venueId] of Object.entries(venueIdByEventId)) entityIdsByEventId[eventId] = [venueId];
  return {
    venues: [...venues],
    eventsByVenueId: groupEventsByEntity(events, entityIdsByEventId, new Set(venues.map((v) => v.id))),
  };
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

export function buildVenuePageData(venue: VenueRecord, events: readonly EventRecord[], todayStr: string): VenuePageData {
  return {
    venue,
    ...splitCurrentAndPast(events, todayStr),
    totalEvents: events.length,
    indexable: events.length >= MIN_EVENTS_TO_INDEX,
  };
}
