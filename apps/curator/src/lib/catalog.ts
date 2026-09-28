import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@caldearte/shared-types";
import { INSTAGRAM_ACCOUNTS } from "./instagram-accounts.js";
import { getSupabaseClient } from "./supabase-client.js";

// Our own registry of artists and venues, derived from the events we
// already curate (see migration 20260928120000_add_artist_venue_catalog
// for the why). `events.artist` and `events.place_name` stay the source of
// truth for what the site shows; this module turns them into `artists`,
// `venues`, `event_artists` and `events.venue_id`, sweeping every event
// whose `catalog_synced_at` is still null. Run at the end of each
// discovery pipeline and never able to fail it — the catalog is a side
// channel, not part of curation.

// Lowercase, strip accents, collapse everything that isn't a letter or a
// digit into single spaces. The identity used to find an existing row.
export function catalogKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Keyed on the ADMINISTRATIVE region (Región Metropolitana, Región de
// Valparaíso...), not on `regions` — those are comunas, and the same place
// is often tagged "Santiago" by one source and "Vitacura" by another.
// Two same-named places in different regions (the GAM in Santiago and the
// Centro Cultural Gabriela Mistral in Villa Alemana) stay apart.
export function venueKey(placeName: string, adminRegion: string | null): string {
  return `${catalogKey(placeName)}|${catalogKey(adminRegion ?? "")}`;
}

// Segments that name a curator or a crowd, not an artist of the show.
const NON_ARTIST_SEGMENT =
  /^(curadur[ií]a|curador|curadora|curated by|con la curadur[ií]a|varios|varias|otros|otras|y otros|y otras|artistas? invitad[oa]s?|colectiva|estudiantes)\b|\bartistas\b|\bestudiantes\b/i;

// Split outside parentheses on the separators Haiku uses between names.
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0) {
      const rest = text.slice(i);
      const sep = /^(\s*[,;/&]\s*|\s+[—–]\s+|\s+y\s+)/.exec(rest);
      if (sep) {
        parts.push(current);
        current = "";
        i += sep[0].length;
        continue;
      }
    }
    current += ch;
    i += 1;
  }
  parts.push(current);
  return parts;
}

// "Pedro Lagos, Mario Rojas" → both; "Colectivo Taller (Ana Vidal, Pía
// Correa)" → the collective and each member;
// "Núcleo de Investigación Visual del Sur (NIVS)" → the name without the
// acronym; "Curaduría de X — Y" → Y only. Deliberately conservative: a
// name we can't split cleanly stays whole rather than being cut in two.
export function splitArtistNames(artist: string | null): string[] {
  if (!artist) return [];
  const names: string[] = [];
  for (const raw of splitTopLevel(artist)) {
    const segment = raw.trim();
    if (segment.length === 0) continue;
    const paren = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(segment);
    let outer = segment;
    if (paren) {
      outer = paren[1].trim();
      const inner = paren[2];
      if (/[,;]/.test(inner)) names.push(...splitArtistNames(inner));
    }
    outer = outer.replace(/\.$/, "").trim();
    if (outer.length < 3 || NON_ARTIST_SEGMENT.test(outer)) continue;
    names.push(outer);
  }
  const seen = new Set<string>();
  return names.filter((n) => {
    const k = catalogKey(n);
    if (k.length < 3 || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const NAME_STOPWORDS = new Set(["de", "del", "la", "las", "los", "el", "y", "da", "do", "van", "von"]);

// A co-author's username belongs to an artist when it contains every
// meaningful word of the name: "lucia_pradom" ↔ "Lucía Prado",
// "tomas.nunez.san.martin" ↔ "Tomás Núñez San Martín". Needs two
// words of 3+ letters — a single first name matches far too much.
export function handleMatchesName(handle: string, name: string): boolean {
  const flatHandle = catalogKey(handle).replace(/ /g, "");
  const words = catalogKey(name)
    .split(" ")
    .filter((w) => w.length >= 3 && !NAME_STOPWORDS.has(w));
  if (words.length < 2) return false;
  return words.every((w) => flatHandle.includes(w));
}

function cleanHandle(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

// Registered Instagram accounts that are one fixed place, by normalized
// place name — so a venue gets the handle of our own source for it.
function registryHandlesByPlace(): Map<string, string> {
  const map = new Map<string, string>();
  for (const account of INSTAGRAM_ACCOUNTS) {
    if (account.fixedLocation) map.set(catalogKey(account.fixedLocation.placeName), account.username.toLowerCase());
  }
  return map;
}

type Client = SupabaseClient<Database>;

interface ArtistRow {
  id: string;
  name_key: string;
  instagram_handle: string | null;
}

interface UnsyncedEvent {
  id: string;
  artist: string | null;
  artist_instagram_handle: string | null;
  place_name: string | null;
  freeform_location: string;
  region_id: string | null;
  source_url: string | null;
}

const BATCH = 200;

async function loadArtists(client: Client): Promise<ArtistRow[]> {
  const rows: ArtistRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("artists").select("id, name_key, instagram_handle").range(from, from + 999);
    if (error) throw new Error(`loading artists: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function loadVenues(client: Client): Promise<Map<string, { id: string; instagram_handle: string | null }>> {
  const map = new Map<string, { id: string; instagram_handle: string | null }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("venues").select("id, name_key, instagram_handle").range(from, from + 999);
    if (error) throw new Error(`loading venues: ${error.message}`);
    for (const v of data) map.set(v.name_key, { id: v.id, instagram_handle: v.instagram_handle });
    if (data.length < 1000) return map;
  }
}

export interface CatalogSyncResult {
  events: number;
  newArtists: number;
  newVenues: number;
  handlesFound: number;
}

// Processes every event not yet in the catalog (removed ones too: an
// artist's history view filters them out, but the link is kept in case the
// removal is undone). Idempotent: an event is marked synced only after its
// links are written, so a crash mid-batch just redoes that batch.
export async function syncCatalog(client: Client = getSupabaseClient()): Promise<CatalogSyncResult> {
  const result: CatalogSyncResult = { events: 0, newArtists: 0, newVenues: 0, handlesFound: 0 };
  const artists = await loadArtists(client);
  const byKey = new Map(artists.map((a) => [a.name_key, a]));
  const byHandle = new Map(artists.filter((a) => a.instagram_handle).map((a) => [a.instagram_handle as string, a]));
  const venues = await loadVenues(client);
  const registryByPlace = registryHandlesByPlace();
  const { data: regionRows, error: regionError } = await client.from("regions").select("id, admin_region_name");
  if (regionError) throw new Error(`loading regions: ${regionError.message}`);
  const adminRegionOf = new Map(regionRows.map((r) => [r.id, r.admin_region_name]));

  const setHandle = async (artist: ArtistRow, handle: string, source: "event" | "collab"): Promise<ArtistRow> => {
    if (artist.instagram_handle) return artist;
    const owner = byHandle.get(handle);
    if (owner) return owner; // the handle already names someone: that row is the person
    const { error } = await client.from("artists").update({ instagram_handle: handle, instagram_handle_source: source }).eq("id", artist.id);
    if (error) throw new Error(`setting handle on artist ${artist.id}: ${error.message}`);
    artist.instagram_handle = handle;
    byHandle.set(handle, artist);
    result.handlesFound += 1;
    return artist;
  };

  const findOrCreateArtist = async (name: string): Promise<ArtistRow> => {
    const key = catalogKey(name);
    const existing = byKey.get(key);
    if (existing) return existing;
    const { data, error } = await client
      .from("artists")
      .upsert({ name, name_key: key }, { onConflict: "name_key" })
      .select("id, name_key, instagram_handle")
      .single();
    if (error) throw new Error(`creating artist "${name}": ${error.message}`);
    byKey.set(key, data);
    result.newArtists += 1;
    return data;
  };

  const findOrCreateVenue = async (e: UnsyncedEvent): Promise<string | null> => {
    if (!e.place_name || catalogKey(e.place_name).length === 0) return null;
    const key = venueKey(e.place_name, e.region_id ? (adminRegionOf.get(e.region_id) ?? null) : null);
    const registryHandle = registryByPlace.get(catalogKey(e.place_name)) ?? null;
    const existing = venues.get(key);
    if (existing) {
      if (!existing.instagram_handle && registryHandle) {
        await client.from("venues").update({ instagram_handle: registryHandle }).eq("id", existing.id);
        existing.instagram_handle = registryHandle;
      }
      return existing.id;
    }
    const { data, error } = await client
      .from("venues")
      .upsert(
        { name: e.place_name, name_key: key, region_id: e.region_id, comuna: e.freeform_location, instagram_handle: registryHandle },
        { onConflict: "name_key" },
      )
      .select("id, instagram_handle")
      .single();
    if (error) throw new Error(`creating venue "${e.place_name}": ${error.message}`);
    venues.set(key, data);
    result.newVenues += 1;
    return data.id;
  };

  for (;;) {
    const { data: events, error } = await client
      .from("events")
      .select("id, artist, artist_instagram_handle, place_name, freeform_location, region_id, source_url")
      .is("catalog_synced_at", null)
      .order("created_at")
      .limit(BATCH);
    if (error) throw new Error(`loading unsynced events: ${error.message}`);
    if (events.length === 0) return result;

    const postUrls = events.map((e) => e.source_url).filter((u): u is string => Boolean(u?.includes("instagram.com")));
    const coauthorsByPost = new Map<string, string[]>();
    if (postUrls.length > 0) {
      const { data: edges, error: edgeError } = await client.from("instagram_collab_edges").select("post_url, handle").in("post_url", postUrls);
      if (edgeError) throw new Error(`loading collab edges: ${edgeError.message}`);
      for (const edge of edges) {
        const list = coauthorsByPost.get(edge.post_url) ?? [];
        list.push(edge.handle);
        coauthorsByPost.set(edge.post_url, list);
      }
    }

    for (const e of events) {
      const names = splitArtistNames(e.artist);
      const eventHandle = e.artist_instagram_handle ? cleanHandle(e.artist_instagram_handle) : null;
      const coauthors = (e.source_url && coauthorsByPost.get(e.source_url)) || [];
      const artistIds = new Set<string>();

      for (const name of names) {
        let artist: ArtistRow | undefined;
        // The event's own handle, when it is clearly this name's: the only
        // name on the event, or a handle spelling out the name.
        const ownHandle = eventHandle && (names.length === 1 || handleMatchesName(eventHandle, name)) ? eventHandle : null;
        if (ownHandle && byHandle.has(ownHandle)) artist = byHandle.get(ownHandle);
        artist ??= await findOrCreateArtist(name);
        if (ownHandle) artist = await setHandle(artist, ownHandle, "event");
        else {
          const collab = coauthors.find((h) => handleMatchesName(h, name));
          if (collab) artist = await setHandle(artist, collab, "collab");
        }
        artistIds.add(artist.id);
      }
      // A handle but no name (e.g. "por @artista" with artist null):
      // the handle is still an artist of the show.
      if (names.length === 0 && eventHandle) {
        const artist = byHandle.get(eventHandle) ?? (await setHandle(await findOrCreateArtist(`@${eventHandle}`), eventHandle, "event"));
        artistIds.add(artist.id);
      }

      const venueId = await findOrCreateVenue(e);

      const { error: deleteError } = await client.from("event_artists").delete().eq("event_id", e.id);
      if (deleteError) throw new Error(`clearing links for event ${e.id}: ${deleteError.message}`);
      if (artistIds.size > 0) {
        const { error: linkError } = await client
          .from("event_artists")
          .insert([...artistIds].map((artist_id) => ({ event_id: e.id, artist_id })));
        if (linkError) throw new Error(`linking event ${e.id}: ${linkError.message}`);
      }
      const { error: markError } = await client
        .from("events")
        .update({ venue_id: venueId, catalog_synced_at: new Date().toISOString() })
        .eq("id", e.id);
      if (markError) throw new Error(`marking event ${e.id}: ${markError.message}`);
      result.events += 1;
    }
  }
}

// The pipelines' entry point: logs one line, never throws.
export async function syncCatalogSafely(label: string): Promise<void> {
  try {
    const r = await syncCatalog();
    if (r.events > 0) {
      console.log(
        `[${label}] catalog: ${r.events} event(s) synced, ${r.newArtists} new artist(s), ${r.newVenues} new venue(s), ${r.handlesFound} artist handle(s) found`,
      );
    }
  } catch (err) {
    console.error(`[${label}] catalog sync failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
