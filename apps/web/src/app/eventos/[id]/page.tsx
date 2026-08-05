import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase-client";
import {
  fetchApprovedEvents,
  truncateDescription,
  resolveCityId,
  displayNameForCity,
  filterByCity,
  splitInauguracionesYExpos,
  filterActiveInRange,
  filterUpcomingInauguraciones,
} from "@/lib/events";
import { resolveCityPickerContext } from "@/lib/cityPickerContext";
import { cityById } from "@/lib/cities";
import { currentWeekInSantiago, weekBoundsInSantiago, addWeeks, weekNumberSince, todayInSantiago } from "@/lib/date";
import { FAMILY_MODE_COOKIE, TODAY_FILTER_COOKIE, VIGENTES_FILTER_COOKIE } from "@/lib/cookies";
import { extractDomain, resolveCardImage } from "@/lib/image-source";
import { esCL } from "@/i18n/es-CL";
import EventDetailCard from "@/components/EventDetailCard";
import EventCityLink from "@/components/EventCityLink";
import EventPageTopNav from "@/components/EventPageTopNav";
import EventPageFooter from "@/components/EventPageFooter";
import InauguracionesSection from "@/components/InauguracionesSection";
import ExposicionesSection from "@/components/ExposicionesSection";

interface PageParams {
  id: string;
}

export async function generateStaticParams() {
  const { events } = await fetchApprovedEvents(getSupabaseClient());
  return events.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { id } = await params;
  const { events } = await fetchApprovedEvents(getSupabaseClient());
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

// Rediseño 2.0.0 — "list mode" added 2026-08-06: a visitor who clicked
// here from the home page's own city+week "Exposiciones actuales" list
// (not a search result, not a shared link out of context) now stays
// inside that list — a position row + prev/next above the date, the same
// SEMANA/city/week-nav selector Header.tsx's own hero uses (compact, in a
// sticky top bar here), and the same Inauguraciones/Exposiciones sliders
// the home page itself uses at the bottom, defaulted to list view.
// Determined purely from data, not a query param or referrer: this event
// either belongs to the CURRENT visitor's city+week "Exposiciones
// actuales" set or it doesn't — if it doesn't (arrived via search across
// every comuna, or the event belongs to a different city/week than the
// one currently selected), the page renders exactly as it always has,
// standalone.
//
// This forces the page to render dynamically per-request now (cookies()
// is a dynamic API) — generateStaticParams still enumerates every event
// id for the build's route manifest, but no page here is actually cached/
// revalidated anymore the way the old `revalidate = 3600` implied. Same
// posture the home page (app/page.tsx) already has; the tradeoff of
// per-request rendering for a personalized page is the same one already
// accepted there.
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<{ semana?: string }>;
}) {
  const { id } = await params;
  const { events, regions } = await fetchApprovedEvents(getSupabaseClient());
  const event = events.find((e) => e.id === id);
  if (!event) notFound();

  const domain = event.sourceUrl ? extractDomain(event.sourceUrl) : null;
  // The EVENT's own city (standalone mode's "go to this comuna" pill) —
  // distinct from the VIEWER's currently-selected city below, which list
  // mode needs instead.
  const eventCityId = resolveCityId(event);
  const eventCityName = displayNameForCity(event);

  const cookieStore = await cookies();
  const headerStore = await headers();
  const familyModeCookie = cookieStore.get(FAMILY_MODE_COOKIE)?.value;
  const familyMode = familyModeCookie === undefined ? true : Boolean(familyModeCookie);
  const todayFilterOn = Boolean(cookieStore.get(TODAY_FILTER_COOKIE)?.value);
  const vigentesFilterOn = Boolean(cookieStore.get(VIGENTES_FILTER_COOKIE)?.value);
  const today = todayInSantiago();
  // Same ?semana= convention as app/page.tsx — malformed/missing falls
  // back to the real current week. Reachable here via EventPageTopNav's
  // own prev/next links (through api/eventos/go-to-city, which carries
  // the target week forward into the redirect URL) or a directly-shared
  // link.
  const { semana } = await searchParams;
  const { start: rangeStart, end: rangeEnd } = /^\d{4}-\d{2}-\d{2}$/.test(semana ?? "") ? weekBoundsInSantiago(semana!) : currentWeekInSantiago();
  const weekNumber = weekNumberSince(rangeStart);

  const {
    cityId: viewerCityId,
    cityNames,
    cityCounts,
    actualCityId,
    hasPreciseLocation,
    activeInRange,
  } = await resolveCityPickerContext({ cookieStore, headerStore, allEvents: events, regions, rangeStart, rangeEnd, familyMode });

  const cityEventsInRange = filterByCity(activeInRange, viewerCityId);
  const split = splitInauguracionesYExpos(cityEventsInRange, rangeStart, rangeEnd);
  const inauguracionesForCity = todayFilterOn ? filterActiveInRange(split.inauguraciones, today, today) : split.inauguraciones;
  const exposActualesForCity = todayFilterOn ? filterActiveInRange(split.exposActuales, today, today) : split.exposActuales;
  const inauguraciones = vigentesFilterOn ? filterUpcomingInauguraciones(inauguracionesForCity, today) : inauguracionesForCity;
  const exposActuales = exposActualesForCity;

  // List mode is always scoped to "Exposiciones actuales" (the full,
  // inclusive set — Inauguraciones is a highlighted SUBSET that overlaps
  // it, per splitInauguracionesYExpos's own doc comment), never to
  // Inauguraciones itself — confirmed with the user 2026-08-06.
  const listIndex = exposActuales.findIndex((e) => e.id === event.id);
  const listMode = listIndex !== -1;
  const viewerCityName = cityById(viewerCityId, cityNames).name;
  // Week nav can't just change a query param in place like Header.tsx's
  // own links do (there's no calendar data on this page to re-render) —
  // redirects through the same api/eventos/go-to-city mechanism
  // EventPageCityPicker's own city switch already uses, city unchanged,
  // only `semana` moves.
  const prevWeekHref = `/api/eventos/go-to-city?cityId=${encodeURIComponent(viewerCityId)}&semana=${addWeeks(rangeStart, -1)}`;
  const nextWeekHref = `/api/eventos/go-to-city?cityId=${encodeURIComponent(viewerCityId)}&semana=${addWeeks(rangeStart, 1)}`;

  const topNav = listMode ? (
    <EventPageTopNav
      weekNumber={weekNumber}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      prevWeekHref={prevWeekHref}
      nextWeekHref={nextWeekHref}
      cityId={viewerCityId}
      cityName={viewerCityName}
      actualCityId={actualCityId}
      hasPreciseLocation={hasPreciseLocation}
      cityCounts={cityCounts}
      cityNames={cityNames}
      regions={regions}
    />
  ) : (
    <EventCityLink cityId={eventCityId} cityName={eventCityName} />
  );

  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      {/* `fixed`, not `sticky` — same reasoning as Header.tsx's own top
          nav (see that file's comment: sticky silently failed to pin
          there, verified in-browser). Content is duplicated into a real
          fixed bar plus an `invisible` clone right below reserving the
          identical space in normal flow — same technique Header.tsx uses
          (TopNavContent), necessary because list mode's own selector
          block (SEMANA/city/week-nav, EventPageTopNav.tsx) isn't a fixed
          height the way a single icon row would be. */}
      <div className="fixed top-0 inset-x-0 z-40 bg-surface-sage">
        <div className="max-w-[1280px] mx-auto flex items-start justify-between gap-2 py-[10px] md:py-[15px] px-[20px] md:px-[61px]">
          <Link href="/" className="font-lato font-black leading-none text-brand-magenta text-[28px]">
            {esCL.appName}
          </Link>
          {topNav}
        </div>
      </div>
      <div className="invisible" aria-hidden="true">
        <div className="max-w-[1280px] mx-auto flex items-start justify-between gap-2 py-[10px] md:py-[15px] px-[20px] md:px-[61px]">
          <Link href="/" className="font-lato font-black leading-none text-brand-magenta text-[28px]">
            {esCL.appName}
          </Link>
          {topNav}
        </div>
      </div>
      <div className="mb-[40px] md:mb-[60px]" aria-hidden="true" />

      <EventDetailCard
        event={event}
        domain={domain}
        listPosition={
          listMode
            ? {
                current: listIndex + 1,
                total: exposActuales.length,
                cityName: viewerCityName,
                prevHref: listIndex > 0 ? `/eventos/${exposActuales[listIndex - 1].id}?semana=${rangeStart}` : null,
                nextHref: listIndex < exposActuales.length - 1 ? `/eventos/${exposActuales[listIndex + 1].id}?semana=${rangeStart}` : null,
              }
            : undefined
        }
      />

      <Link
        href="/"
        className="mt-[40px] md:mt-[60px] inline-block font-fragment-mono text-[14px] uppercase text-text-primary underline"
      >
        {esCL.eventPageBackToHome} →
      </Link>

      {listMode && (
        <div className="mt-[60px] md:mt-[100px]">
          {/* Inauguraciones first, to give it emphasis here too — per the
              user 2026-08-06 — then the same Exposiciones list this
              event's own position row above navigates through, so the
              overview stays visible without leaving the page. Sticky
              offset overridden (stickyTopClass) — EventPageTopNav's own
              fixed bar is taller than Header.tsx's, whose height the
              default top-[50px]/top-[60px] was tuned for. */}
          <InauguracionesSection events={inauguraciones} defaultView="list" stickyTopClass="top-[110px] md:top-[120px]" />
          <ExposicionesSection events={exposActuales} defaultView="list" stickyTopClass="top-[110px] md:top-[120px]" />
        </div>
      )}

      <EventPageFooter />
    </main>
  );
}
