import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchVenueData } from "@/lib/venues";
import { buildVenuePageData, findVenueBySlug } from "@/lib/venuePage";
import { venueSlug } from "@/lib/venueSlug";
import { buildVenueJsonLd } from "@/lib/venueJsonLd";
import { todayInSantiago } from "@/lib/date";
import { esCL } from "@/i18n/es-CL";
import CatalogEntityPage from "@/components/CatalogEntityPage";

interface PageParams {
  slug: string;
}

// Same settings and same reasoning as app/eventos/[id]/page.tsx (read its
// comments for the two Vercel free-tier incidents behind them): regenerate
// every 600s, and generate pages on first request instead of fanning out
// ~250 of them on every build — a build writes nothing, a page is written
// once when someone first visits it.
export const revalidate = 600;
export const dynamicParams = true;

export function generateStaticParams(): Array<{ slug: string }> {
  return [];
}

const SITE = "https://www.caldearte.com";

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { slug } = await params;
  const { venues, eventsByVenueId } = await fetchVenueData();
  const venue = findVenueBySlug(venues, slug);
  if (!venue) return {};

  const page = buildVenuePageData(venue, eventsByVenueId[venue.id] ?? [], todayInSantiago());
  const title = `${venue.name} | ${esCL.appName}`;
  const description = esCL.venuePageMetaDescription(venue.name, venue.comuna, page.totalEvents);
  // The canonical points at the CURRENT slug, so a link made before a
  // rename (same id prefix, old name part) consolidates onto one URL.
  const canonical = `${SITE}/espacios/${venueSlug(venue)}`;

  return {
    title,
    description,
    alternates: { canonical },
    // Thin pages (a single show) stay reachable but out of the index — see
    // MIN_EVENTS_TO_INDEX.
    robots: page.indexable ? undefined : { index: false, follow: true },
    openGraph: { title, description },
    twitter: { card: "summary", title, description },
  };
}

export default async function VenuePage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const { venues, eventsByVenueId } = await fetchVenueData();
  const venue = findVenueBySlug(venues, slug);
  if (!venue) notFound();

  const { current, past, totalEvents } = buildVenuePageData(venue, eventsByVenueId[venue.id] ?? [], todayInSantiago());

  return (
    <CatalogEntityPage
      jsonLd={buildVenueJsonLd(venue, `${SITE}/espacios/${venueSlug(venue)}`)}
      eyebrow={venue.comuna}
      title={venue.name}
      countText={esCL.venuePageEventCount(totalEvents)}
      instagramHandle={venue.instagramHandle}
      current={current}
      past={past}
      noCurrentText={esCL.venuePageNoCurrent}
      correctionNote={esCL.venuePageCorrectionNote}
    />
  );
}
