import { unstable_cache } from "next/cache";
import type { Database } from "@caldearte/shared-types";
import { getSupabaseClient } from "./supabase-client";
import { DATA_WINDOW_SECONDS, fetchApprovedEvents, type DataWindow } from "./events";
import { assembleVenueData, type VenueData, type VenueRecord } from "./venuePage";

// Same nullable-view-type caveat as events.ts's EventRow: Postgres views
// don't propagate NOT NULL, but id/name are genuinely not null on the real
// `venues` table.
type VenueRow = Omit<Database["public"]["Views"]["venues_public"]["Row"], "id" | "name"> & {
  id: string;
  name: string;
};

interface VenueLinks {
  venues: VenueRecord[];
  venueIdByEventId: Record<string, string>;
}

// Only the small half is cached here: the venues themselves and which
// event belongs to which venue (a few tens of kB). The events are NOT
// fetched again — they come from fetchApprovedEvents's existing cache
// entry (~750 kB; a venue-specific copy would double that for nothing,
// and the home page ships EventRecord[] to the browser, so a venue id
// per event is kept off EventRecord too: the Fast Origin Transfer
// incidents of 2026-08-06 and 2026-08-27 are why payload size matters).
// Reads go through venues_public / events_public, never the base tables —
// see supabase/migrations/20261002140000_add_venues_public_view.sql.
async function fetchVenueLinksFromDb(): Promise<VenueLinks> {
  const client = getSupabaseClient();
  const [venuesRes, linksRes] = await Promise.all([
    client.from("venues_public").select("*"),
    client.from("events_public").select("id, venue_id").not("venue_id", "is", null),
  ]);
  if (venuesRes.error) throw new Error(`Failed to fetch venues: ${venuesRes.error.message}`);
  if (linksRes.error) throw new Error(`Failed to fetch venue links: ${linksRes.error.message}`);

  const venues: VenueRecord[] = ((venuesRes.data ?? []) as VenueRow[]).map((v) => ({
    id: v.id,
    name: v.name,
    comuna: v.comuna,
    instagramHandle: v.instagram_handle,
  }));
  const venueIdByEventId: Record<string, string> = {};
  for (const row of linksRes.data ?? []) {
    if (row.id && row.venue_id) venueIdByEventId[row.id] = row.venue_id;
  }
  return { venues, venueIdByEventId };
}

export const VENUES_CACHE_TAG = "venues-public";

// Same two windows as fetchApprovedEvents (lib/events.ts).
const fetchVenueLinksHourly = unstable_cache(fetchVenueLinksFromDb, ["venue-links"], {
  revalidate: DATA_WINDOW_SECONDS.hourly,
  tags: [VENUES_CACHE_TAG],
});
const fetchVenueLinksDaily = unstable_cache(fetchVenueLinksFromDb, ["venue-links-daily"], {
  revalidate: DATA_WINDOW_SECONDS.daily,
  tags: [VENUES_CACHE_TAG],
});

export async function fetchVenueData(window: DataWindow = "hourly"): Promise<VenueData> {
  const [links, { events }] = await Promise.all([window === "daily" ? fetchVenueLinksDaily() : fetchVenueLinksHourly(), fetchApprovedEvents(window)]);
  return assembleVenueData(links.venues, links.venueIdByEventId, events);
}
