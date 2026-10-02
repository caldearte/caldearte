import type { MetadataRoute } from "next";
import { fetchApprovedEvents } from "@/lib/events";
import { fetchVenueData } from "@/lib/venues";
import { fetchArtistData } from "@/lib/artists";
import { MIN_EVENTS_TO_INDEX } from "@/lib/venuePage";
import { isArtistIndexable } from "@/lib/artistPage";
import { artistSlug, venueSlug } from "@/lib/venueSlug";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // www, not the apex — see robots.ts's comment. Every <loc> here must be
  // the final URL Google actually lands on, not one that 308-redirects.
  const base = "https://www.caldearte.com";
  const { events } = await fetchApprovedEvents();
  // One URL per event's own shareable/indexable permalink (see
  // app/eventos/[id]/page.tsx) — "weekly" since a row can still change
  // after being written (e.g. an opening hour confirmed later).
  const eventUrls: MetadataRoute.Sitemap = events.map((e) => ({
    url: `${base}/eventos/${e.id}`,
    changeFrequency: "weekly",
    priority: 0.4,
  }));
  // Venue pages (app/espacios/[slug]) — only the ones worth indexing: a
  // venue with a single show renders noindex, so listing it here would
  // contradict its own robots meta.
  //
  // Guarded on its own: merging the migration that creates venues_public
  // and the deploy that reads it happen in parallel, so for a few minutes
  // the view may not exist yet — that must cost the sitemap its venue
  // entries, never the event entries (a failed sitemap fetch is what
  // Search Console reported as "Couldn't fetch" once before, see
  // robots.ts).
  let venueUrls: MetadataRoute.Sitemap = [];
  try {
    const { venues, eventsByVenueId } = await fetchVenueData();
    venueUrls = venues
      .filter((v) => (eventsByVenueId[v.id]?.length ?? 0) >= MIN_EVENTS_TO_INDEX)
      .map((v) => ({
        url: `${base}/espacios/${venueSlug(v)}`,
        changeFrequency: "weekly",
        priority: 0.5,
      }));
  } catch (err) {
    console.error(`[sitemap] venue pages left out: ${(err as Error).message}`);
  }
  // Artist pages (app/artistas/[slug]) — same rule as the page's own robots
  // meta (isArtistIndexable), guarded on its own for the same reason.
  let artistUrls: MetadataRoute.Sitemap = [];
  try {
    const { artists, eventsByArtistId } = await fetchArtistData();
    artistUrls = artists
      .filter((a) => isArtistIndexable(a, eventsByArtistId[a.id]?.length ?? 0))
      .map((a) => ({
        url: `${base}/artistas/${artistSlug(a)}`,
        changeFrequency: "weekly",
        priority: 0.4,
      }));
  } catch (err) {
    console.error(`[sitemap] artist pages left out: ${(err as Error).message}`);
  }
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/privacidad`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/curatoria`, changeFrequency: "yearly", priority: 0.3 },
    ...venueUrls,
    ...artistUrls,
    ...eventUrls,
  ];
}
