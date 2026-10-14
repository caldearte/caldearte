import { NextResponse } from "next/server";
import { fetchApprovedEvents } from "@/lib/events";
import { fetchVenueData } from "@/lib/venues";
import { fetchArtistData } from "@/lib/artists";
import { venueSlug, artistSlug } from "@/lib/venueSlug";
import { buildSearchPlaces, type SearchEntity, type SearchIndex } from "@/lib/search";

// Everything the site search can find (2026-10-13, see lib/search.ts):
// every approved event — past ones too — plus the venues and artists with
// at least one show, and every región/comuna. Same for every visitor (no
// cookies), so it's served static and refreshed every 10 minutes, like
// the pages built on the same data; family mode is applied in the browser.
// Events go without description or street address: the search shows
// neither, and they're the bulk of the bytes.
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  const [{ events, regions }, venueData, artistData] = await Promise.all([fetchApprovedEvents(), fetchVenueData(), fetchArtistData()]);

  const venues: SearchEntity[] = venueData.venues
    .map((v) => ({ name: v.name, href: `/espacios/${venueSlug(v)}`, meta: v.comuna, count: venueData.eventsByVenueId[v.id]?.length ?? 0 }))
    .filter((v) => v.count > 0);
  const artists: SearchEntity[] = artistData.artists
    .map((a) => ({ name: a.name, href: `/artistas/${artistSlug(a)}`, meta: null, count: artistData.eventsByArtistId[a.id]?.length ?? 0 }))
    .filter((a) => a.count > 0);

  const index: SearchIndex = {
    events: events.map((e) => ({ ...e, description: null, address: null })),
    venues,
    artists,
    places: buildSearchPlaces(regions),
  };
  return NextResponse.json(index);
}
