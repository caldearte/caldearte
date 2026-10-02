import { unstable_cache } from "next/cache";
import type { Database } from "@caldearte/shared-types";
import { getSupabaseClient } from "./supabase-client";
import { toEventRecord, type EventRecord, type EventRow } from "./events";
import type { VenueData, VenueRecord } from "./venuePage";

// Same nullable-view-type caveat as events.ts's EventRow: Postgres views
// don't propagate NOT NULL, but id/name are genuinely not null on the real
// `venues` table.
type VenueRow = Omit<Database["public"]["Views"]["venues_public"]["Row"], "id" | "name"> & {
  id: string;
  name: string;
};

// Own cached read rather than a field on EventRecord: the home page ships
// EventRecord[] to the browser, and a venue id per event would be dead
// weight in that payload (the Fast Origin Transfer incidents, 2026-08-06
// and 2026-08-27, are why payload size matters here). Reads go through
// venues_public / events_public, never the base tables — see
// supabase/migrations/20261002140000_add_venues_public_view.sql.
async function fetchVenueDataFromDb(): Promise<VenueData> {
  const client = getSupabaseClient();
  const [venuesRes, eventsRes, regionsRes] = await Promise.all([
    client.from("venues_public").select("*"),
    client.from("events_public").select("*").not("venue_id", "is", null),
    client.from("regions_public").select("id, name"),
  ]);
  if (venuesRes.error) throw new Error(`Failed to fetch venues: ${venuesRes.error.message}`);
  if (eventsRes.error) throw new Error(`Failed to fetch venue events: ${eventsRes.error.message}`);
  if (regionsRes.error) throw new Error(`Failed to fetch regions: ${regionsRes.error.message}`);

  const regionNameById = new Map((regionsRes.data ?? []).flatMap((r) => (r.id && r.name ? [[r.id, r.name] as const] : [])));
  const venues: VenueRecord[] = ((venuesRes.data ?? []) as VenueRow[]).map((v) => ({
    id: v.id,
    name: v.name,
    comuna: v.comuna,
    instagramHandle: v.instagram_handle,
  }));

  const eventsByVenueId: Record<string, EventRecord[]> = {};
  for (const row of (eventsRes.data ?? []) as EventRow[]) {
    const venueId = row.venue_id;
    if (!venueId) continue;
    (eventsByVenueId[venueId] ??= []).push(toEventRecord(row, regionNameById));
  }
  return { venues, eventsByVenueId };
}

export const VENUES_CACHE_TAG = "venues-public";

export const fetchVenueData = unstable_cache(fetchVenueDataFromDb, ["venues-and-their-events"], {
  revalidate: 600,
  tags: [VENUES_CACHE_TAG],
});
