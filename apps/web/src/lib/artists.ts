import { unstable_cache } from "next/cache";
import type { Database } from "@caldearte/shared-types";
import { getSupabaseClient } from "./supabase-client";
import { fetchApprovedEvents } from "./events";
import { assembleArtistData, type ArtistData, type ArtistRecord } from "./artistPage";

// Same nullable-view-type caveat as venues.ts.
type ArtistRow = Omit<Database["public"]["Views"]["artists_public"]["Row"], "id" | "name"> & {
  id: string;
  name: string;
};

interface ArtistLinks {
  artists: ArtistRecord[];
  links: Array<{ eventId: string; artistId: string }>;
}

// Same split as venues.ts: only the artists and the (event, artist) pairs
// are cached here; the events come from fetchApprovedEvents's one cache
// entry. Reads go through artists_public / event_artists_public, never the
// base tables — see supabase/migrations/20261002150000_add_artists_public_views.sql
// (which also decides which handles are safe to publish).
async function fetchArtistLinksFromDb(): Promise<ArtistLinks> {
  const client = getSupabaseClient();
  const [artistsRes, linksRes] = await Promise.all([
    client.from("artists_public").select("*"),
    client.from("event_artists_public").select("event_id, artist_id"),
  ]);
  if (artistsRes.error) throw new Error(`Failed to fetch artists: ${artistsRes.error.message}`);
  if (linksRes.error) throw new Error(`Failed to fetch artist links: ${linksRes.error.message}`);

  const artists: ArtistRecord[] = ((artistsRes.data ?? []) as ArtistRow[]).map((a) => ({
    id: a.id,
    name: a.name,
    instagramHandle: a.instagram_handle,
  }));
  const links = (linksRes.data ?? []).flatMap((row) =>
    row.event_id && row.artist_id ? [{ eventId: row.event_id, artistId: row.artist_id }] : [],
  );
  return { artists, links };
}

export const ARTISTS_CACHE_TAG = "artists-public";

const fetchArtistLinks = unstable_cache(fetchArtistLinksFromDb, ["artist-links"], {
  revalidate: 600,
  tags: [ARTISTS_CACHE_TAG],
});

export async function fetchArtistData(): Promise<ArtistData> {
  const [{ artists, links }, { events }] = await Promise.all([fetchArtistLinks(), fetchApprovedEvents()]);
  return assembleArtistData(artists, links, events);
}
