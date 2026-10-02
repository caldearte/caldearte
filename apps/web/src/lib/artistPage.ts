import type { EventRecord } from "./events";
import { MIN_EVENTS_TO_INDEX, groupEventsByEntity, splitCurrentAndPast } from "./catalogPage";
import { artistSlug, findBySlug } from "./venueSlug";

// Pure half of the artist pages — artists.ts holds the cached fetch.

export interface ArtistRecord {
  id: string;
  name: string;
  // Already filtered in the database: artists_public only exposes a handle
  // whose source is 'event' or 'manual', never a heuristic 'collab' match
  // (see 20261002150000_add_artists_public_views.sql).
  instagramHandle: string | null;
}

export interface ArtistData {
  artists: ArtistRecord[];
  eventsByArtistId: Record<string, EventRecord[]>;
}

export function findArtistBySlug(artists: readonly ArtistRecord[], slug: string): ArtistRecord | undefined {
  return findBySlug(artists, slug);
}

// A show has one or several artists (event_artists is many-to-many), so
// the link query is a list of (event, artist) pairs rather than a map.
export function assembleArtistData(
  artists: readonly ArtistRecord[],
  links: ReadonlyArray<{ eventId: string; artistId: string }>,
  events: readonly EventRecord[],
): ArtistData {
  const artistIdsByEventId: Record<string, string[]> = {};
  for (const { eventId, artistId } of links) (artistIdsByEventId[eventId] ??= []).push(artistId);
  return {
    artists: [...artists],
    eventsByArtistId: groupEventsByEntity(events, artistIdsByEventId, new Set(artists.map((a) => a.id))),
  };
}

// Indexable with 2+ shows, OR with a publicly exposed Instagram handle: the
// handle is what makes a one-show page a real, findable identity rather
// than a bare name. Everything else renders noindex and stays out of the
// sitemap. Most artists have a single show (and only ~1 in 7 has a
// handle), which is exactly why this isn't "index everything".
export function isArtistIndexable(artist: ArtistRecord, totalEvents: number): boolean {
  return totalEvents >= MIN_EVENTS_TO_INDEX || artist.instagramHandle !== null;
}

export interface ArtistLink {
  href: string;
  name: string;
}

// An event credits at most this many artist links; a group show with ten
// names would otherwise bury the event's own details under a column of
// links. Alphabetical, so the choice is stable between renders.
export const MAX_ARTIST_LINKS = 3;

// Where an event page links to its artists' pages. Same rule as the venue
// link (venuePage.ts's findVenueLinkForEvent): only an artist whose page
// lists MORE than this event — a page showing just the show the visitor is
// already on adds nothing — which is also always an indexable page
// (MIN_EVENTS_TO_INDEX), so the site never links internally to a page it
// tells Google to skip. An artist with one show and a published handle IS
// indexable but deliberately not linked: all that page would add is their
// Instagram. Found through the catalog's event↔artist links, never by
// matching events.artist's free text (38 of those are lists of names).
export function findArtistLinksForEvent(data: ArtistData, eventId: string): ArtistLink[] {
  return data.artists
    .filter((a) => {
      const events = data.eventsByArtistId[a.id];
      return events !== undefined && events.length >= MIN_EVENTS_TO_INDEX && events.some((e) => e.id === eventId);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .slice(0, MAX_ARTIST_LINKS)
    .map((a) => ({ href: `/artistas/${artistSlug(a)}`, name: a.name }));
}

export interface ArtistPageData {
  artist: ArtistRecord;
  current: EventRecord[];
  past: EventRecord[];
  totalEvents: number;
  indexable: boolean;
}

export function buildArtistPageData(artist: ArtistRecord, events: readonly EventRecord[], todayStr: string): ArtistPageData {
  return {
    artist,
    ...splitCurrentAndPast(events, todayStr),
    totalEvents: events.length,
    indexable: isArtistIndexable(artist, events.length),
  };
}
