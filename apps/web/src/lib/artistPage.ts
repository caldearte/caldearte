import type { EventRecord } from "./events";
import { MIN_EVENTS_TO_INDEX, groupEventsByEntity, splitCurrentAndPast } from "./catalogPage";
import { findBySlug } from "./venueSlug";

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
