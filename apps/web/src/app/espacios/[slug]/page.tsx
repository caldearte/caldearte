import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchVenueData } from "@/lib/venues";
import { buildVenuePageData, findVenueBySlug } from "@/lib/venuePage";
import { venueSlug } from "@/lib/venueSlug";
import { buildVenueJsonLd, instagramProfileUrl } from "@/lib/venueJsonLd";
import { jsonLdScriptContent } from "@/lib/eventJsonLd";
import { todayInSantiago } from "@/lib/date";
import { esCL } from "@/i18n/es-CL";
import ExpoCard from "@/components/ExpoCard";
import EventPageFooter from "@/components/EventPageFooter";

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

// Past shows listed on a venue page: the most recent ones only, so a
// venue with a long history doesn't turn into an endless page.
const MAX_PAST_EVENTS = 24;

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
  const url = `${SITE}/espacios/${venueSlug(venue)}`;

  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(buildVenueJsonLd(venue, url)) }} />

      <div className="mb-[40px] md:mb-[60px]">
        <Link href="/" className="font-lato font-black leading-none text-brand-magenta text-[28px]">
          {esCL.appName}
        </Link>
      </div>

      <header className="flex flex-col gap-[12px] md:gap-[16px]">
        {venue.comuna && <p className="font-fragment-mono text-[14px] uppercase text-text-primary">{venue.comuna}</p>}
        <h1 className="font-lato font-black text-[32px] md:text-[48px] leading-tight text-text-primary">{venue.name}</h1>
        <p className="font-fragment-mono text-[14px] text-text-primary">{esCL.venuePageEventCount(totalEvents)}</p>
        {venue.instagramHandle && (
          <a
            href={instagramProfileUrl(venue.instagramHandle)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-fragment-mono text-[14px] text-text-primary underline w-fit"
          >
            {esCL.venuePageInstagramLink(venue.instagramHandle)}
          </a>
        )}
      </header>

      <section className="mt-12 md:mt-16">
        <h2 className="font-lato font-black text-[28px] md:text-[41px] text-text-primary mb-6">{esCL.venuePageCurrentLabel}</h2>
        {current.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-[20px]">
            {current.map((e) => (
              <ExpoCard key={e.id} event={e} />
            ))}
          </div>
        ) : (
          <p className="font-fragment-mono text-[14px] text-text-primary">{esCL.venuePageNoCurrent}</p>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-16">
          <h2 className="font-lato font-black text-[28px] md:text-[41px] text-text-primary mb-6">{esCL.venuePagePastLabel}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-[20px]">
            {past.slice(0, MAX_PAST_EVENTS).map((e) => (
              <ExpoCard key={e.id} event={e} hideTodayBadge />
            ))}
          </div>
        </section>
      )}

      <Link
        href="/"
        className="mt-[40px] md:mt-[60px] inline-block font-fragment-mono text-[14px] uppercase text-text-primary underline"
      >
        {esCL.eventPageBackToHome} →
      </Link>

      <p className="mt-10 max-w-[640px] font-fragment-mono text-[13px] text-text-primary">{esCL.venuePageCorrectionNote}</p>

      <EventPageFooter />
    </main>
  );
}
