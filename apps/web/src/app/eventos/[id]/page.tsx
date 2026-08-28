import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchApprovedEvents } from "@/lib/events";
import { truncateDescription, displayNameForCity, resolveAdminRegionName, filterByRegion, filterActiveInRange } from "@/lib/event-utils";
import { buildRegionMetaByCityId, regionIdFromAdminRegionName } from "@/lib/cities";
import { currentWeekInSantiago, todayInSantiago, isCurrentOrUpcoming } from "@/lib/date";
import { extractDomain, resolveCardImage } from "@/lib/image-source";
import { buildEventJsonLd, jsonLdScriptContent } from "@/lib/eventJsonLd";
import { esCL } from "@/i18n/es-CL";
import EventDetailCard from "@/components/EventDetailCard";
import EventCityLink from "@/components/EventCityLink";
import EventPageFooter from "@/components/EventPageFooter";
import ExpoCard from "@/components/ExpoCard";

interface PageParams {
  id: string;
}

// Real content changes at most a few times a day (event discovery/
// curation runs on a multi-day cadence, not per-minute) — matches
// app/page.tsx's own `revalidate` and fetchApprovedEvents's own
// unstable_cache window (lib/events.ts), same 2026-08-28 fix, same real
// incident (see this file's own comment on generateMetadata/EventPage
// below).
export const revalidate = 600;

export async function generateStaticParams() {
  const { events } = await fetchApprovedEvents();
  return events.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { id } = await params;
  const { events } = await fetchApprovedEvents();
  const event = events.find((e) => e.id === id);
  if (!event) return {};

  const description = truncateDescription(event.description) ?? event.title;
  const image = resolveCardImage(event);
  const title = `${event.title} | ${esCL.appName}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image.type === "photo" ? [image.url] : undefined,
    },
    // Twitter/X's crawler falls back to og:image for the image itself, but
    // NOT for the card type — without an explicit "summary_large_image"
    // here it renders the small square "summary" thumbnail from
    // layout.tsx's site-wide default instead of the bigger, more visually
    // compelling card (this is what WhatsApp shares' link previews are
    // reusing too — asked about explicitly, 2026-07-21: "se comparte con
    // imagen?").
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image.type === "photo" ? [image.url] : undefined,
    },
  };
}

// "List mode" (2026-08-06 — position-in-list, prev/next, a full región+
// semana picker in a sticky top nav, the visitor's own current
// Inauguraciones/Exposiciones lists at the bottom) read cookies()/
// headers() to personalize all of that, which forced this page to render
// fresh on every single request — no ISR, no cache, ever. That was fine
// at low traffic; once the Instagram launch (2026-08-23) started sending
// real volume straight to individual event pages, it became the real
// driver of a second Vercel free-tier incident (Fast Origin Transfer,
// exceeded 2026-08-27/28 — same underlying category as the home page's
// own spike this same file already fixed once, 2026-08-06, see
// app/page.tsx's comment) — every crawl (robots.ts allows /eventos/*
// freely) and every shared-link visit was a full, uncached origin render.
//
// Rather than rebuild list mode as a client-side-personalized fetch (the
// same pattern app/page.tsx uses) — real option, but list mode touches
// nearly the whole page (top nav, position indicator, two full sections),
// so the "flash of standalone-then-list-mode" risk on every load would
// have been far more visually disruptive than home's own equivalent
// (which only nudges counts/filters within an already-settled layout) —
// the user chose instead (2026-08-28) to drop list mode entirely and
// replace it with the small deterministic teaser below: a fixed sample of
// this event's own región's current exposiciones, computed the same way
// for every visitor, no cookies, so the page is fully cache-eligible
// again (see `revalidate` above).
export default async function EventPage({ params }: { params: Promise<PageParams> }) {
  const { id } = await params;
  const { events, regions } = await fetchApprovedEvents();
  const event = events.find((e) => e.id === id);
  if (!event) notFound();

  const domain = event.sourceUrl ? extractDomain(event.sourceUrl) : null;
  const metaByCityId = buildRegionMetaByCityId(regions);
  const eventCityName = displayNameForCity(event);
  const eventAdminRegionName = resolveAdminRegionName(event, metaByCityId);
  const eventRegionId = regionIdFromAdminRegionName(eventAdminRegionName ?? "");

  // Deterministic — same input (this event's own región) for every
  // visitor, so this stays safe to cache. Excludes the event itself; 4
  // items matches ExposicionesSection's own desktop grid's first "big +
  // medium" row without needing that component's client-side
  // slider/toggle machinery this teaser doesn't need.
  const today = todayInSantiago();
  const { start: rangeStart, end: rangeEnd } = currentWeekInSantiago();
  const moreExpos = filterByRegion(filterActiveInRange(events, rangeStart, rangeEnd), eventAdminRegionName ?? "", metaByCityId)
    .filter((e) => e.id !== event.id && isCurrentOrUpcoming(e, today))
    .slice(0, 4);

  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      {/* Schema.org VisualArtsEvent — see lib/eventJsonLd.ts's own comment. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(buildEventJsonLd(event)) }} />

      <div className="flex items-center justify-between gap-2 mb-[40px] md:mb-[60px]">
        <Link href="/" className="font-lato font-black leading-none text-brand-magenta text-[28px]">
          {esCL.appName}
        </Link>
        <EventCityLink regionId={eventRegionId} cityName={eventCityName} />
      </div>

      <EventDetailCard event={event} domain={domain} />

      <Link
        href="/"
        className="mt-[40px] md:mt-[60px] inline-block font-fragment-mono text-[14px] uppercase text-text-primary underline"
      >
        {esCL.eventPageBackToHome} →
      </Link>

      {moreExpos.length > 0 && (
        <section className="mt-16">
          <h2 className="font-lato font-black text-[28px] md:text-[41px] text-text-primary mb-6">{esCL.eventPageMoreExposLabel}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-[20px]">
            {moreExpos.map((e) => (
              <ExpoCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}

      <EventPageFooter />
    </main>
  );
}
