import { cookies, headers } from "next/headers";
import {
  fetchApprovedEvents,
  filterFamilyMode,
  filterByCity,
  filterActiveInRange,
  splitInauguracionesYExpos,
  filterUpcomingInauguraciones,
  findNextEvent,
} from "@/lib/events";
import { resolveCityPickerContext } from "@/lib/cityPickerContext";
import {
  todayInSantiago,
  currentWeekInSantiago,
  weekBoundsInSantiago,
  addWeeks,
  weekNumberSince,
  isCurrentOrUpcoming,
} from "@/lib/date";
import {
  FAMILY_MODE_COOKIE,
  TODAY_FILTER_COOKIE,
  VIGENTES_FILTER_COOKIE,
  GEO_CONSENT_COOKIE,
} from "@/lib/cookies";
import CalendarView from "@/components/CalendarView";
import type { NewsletterStatus } from "@/components/NewsletterStatusModal";

const NEWSLETTER_STATUSES: NewsletterStatus[] = [
  "confirmed",
  "already_confirmed",
  "unsubscribed",
  "already_unsubscribed",
  "invalid",
  "error",
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    newsletter?: string;
    semana?: string;
  }>;
}) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  // Landed here from /newsletter/confirmar or /newsletter/baja (both
  // redirect to `/?newsletter=<status>` after calling their Edge Function
  // server-side) — see NewsletterStatusModal.tsx.
  const { newsletter, semana } = await searchParams;
  const newsletterStatus: NewsletterStatus | null =
    NEWSLETTER_STATUSES.includes(newsletter as NewsletterStatus)
      ? (newsletter as NewsletterStatus)
      : null;
  // Absent cookie means family mode ON — a first-time visitor sees
  // filtered content by default; explicitly turning it off (empty-string
  // cookie value, set by CalendarView.tsx's toggleFamilyMode) is the only
  // way to see everything.
  const familyModeCookie = cookieStore.get(FAMILY_MODE_COOKIE)?.value;
  const familyMode =
    familyModeCookie === undefined ? true : Boolean(familyModeCookie);
  // Filtros pills — both absent-cookie-means-off, same pattern as
  // FAMILY_MODE_COOKIE's inverse. Everything always operates on the
  // current Monday-Sunday week; these two only narrow what's DISPLAYED
  // for the currently-selected city, never the week/carousel counts below.
  const todayFilterOn = Boolean(cookieStore.get(TODAY_FILTER_COOKIE)?.value);
  const vigentesFilterOn = Boolean(
    cookieStore.get(VIGENTES_FILTER_COOKIE)?.value,
  );
  const today = todayInSantiago();
  // Week navigation lives in the URL (?semana=YYYY-MM-DD), not a cookie —
  // unlike city/filters, "which week" is inherently a point-in-time value:
  // a cookie would silently keep showing a past/future week on a visitor's
  // NEXT, unrelated visit days later. A query param is also what makes a
  // specific week shareable/bookmarkable, matching the archive's own
  // date-in-URL precedent (/expos-anteriores/[year]/[month]). Any
  // malformed or non-Monday value falls back to today's real week rather
  // than erroring — weekBoundsInSantiago normalizes to that date's own
  // Monday-Sunday bounds regardless of which weekday was passed in.
  const { start: rangeStart, end: rangeEnd } = /^\d{4}-\d{2}-\d{2}$/.test(
    semana ?? "",
  )
    ? weekBoundsInSantiago(semana!)
    : currentWeekInSantiago();
  const weekNumber = weekNumberSince(rangeStart);
  const prevWeekHref = `/?semana=${addWeeks(rangeStart, -1)}`;
  const nextWeekHref = `/?semana=${addWeeks(rangeStart, 1)}`;

  const { events: allEvents, regions } = await fetchApprovedEvents();
  // Family-mode filtering happens here, server-side, before anything is
  // sent to the client — excluded events never reach the HTML/JS, which is
  // what actually satisfies "no flash of unblurred content" (overview.md).
  const visible = filterFamilyMode(allEvents, familyMode);

  // SearchPanel's own scope: every active/upcoming event, every comuna —
  // deliberately NOT narrowed to rangeStart/rangeEnd or the selected city
  // (see the product discussion: a scoped-empty search result is
  // ambiguous — "doesn't exist" vs. "wrong filter"). Never includes past
  // (archived) events; that stays the Archive's own job.
  const searchableEvents = visible.filter((e) => isCurrentOrUpcoming(e, today));

  // Shared with the event detail page (lib/cityPickerContext.ts) —
  // extracted 2026-08-06 once /eventos/[id] needed the exact same "which
  // city, from cookie or IP-geo fallback" + CityPickerPanel sidebar data
  // (counts/thumbnails), so the two pages can't silently drift on how a
  // city gets resolved. See that function's own comments for the
  // reasoning behind each piece (region-mate fallback, precise-location
  // precedence, etc.) — unchanged here, just relocated.
  const { cityId, cityNames, cityCounts, cityThumbnails, actualCityId, hasPreciseLocation, activeInRange } = await resolveCityPickerContext({
    cookieStore,
    headerStore,
    allEvents,
    regions,
    rangeStart,
    rangeEnd,
    familyMode,
  });

  // GeoConsentBanner.tsx: shown at most once ever, the very first time a
  // visitor hasn't yet answered — every subsequent render (including
  // after they answer, since answering sets this cookie and refreshes)
  // has it hidden.
  const showGeoConsentPrompt =
    cookieStore.get(GEO_CONSENT_COOKIE) === undefined;

  const cityEventsInRange = filterByCity(activeInRange, cityId);
  const split = splitInauguracionesYExpos(
    cityEventsInRange,
    rangeStart,
    rangeEnd,
  );
  // "Hoy" filter: narrows THIS city's lists down to only today's active
  // events — applied after the split, scoped to the selected city only
  // (never the carousel/citywide counts above).
  const inauguracionesForCity = todayFilterOn
    ? filterActiveInRange(split.inauguraciones, today, today)
    : split.inauguraciones;
  const exposActualesForCity = todayFilterOn
    ? filterActiveInRange(split.exposActuales, today, today)
    : split.exposActuales;
  // "Vigentes" filter: hides inauguraciones whose opening date already
  // passed this week — inauguraciones only, never exposActuales (an
  // exhibition's run is still "vigente" regardless of when it opened).
  const inauguraciones = vigentesFilterOn
    ? filterUpcomingInauguraciones(inauguracionesForCity, today)
    : inauguracionesForCity;
  const exposActuales = exposActualesForCity;

  // Empty-state fallback looks beyond the current week within the selected
  // city, so it can say "the next one is on X" instead of just "nothing."
  const nextEvent = findNextEvent(
    filterByCity(visible, cityId),
    today,
    rangeEnd,
  );

  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <CalendarView
        inauguraciones={inauguraciones}
        exposActuales={exposActuales}
        cityId={cityId}
        actualCityId={actualCityId}
        hasPreciseLocation={hasPreciseLocation}
        showGeoConsentPrompt={showGeoConsentPrompt}
        cityNames={cityNames}
        familyMode={familyMode}
        todayFilterOn={todayFilterOn}
        vigentesFilterOn={vigentesFilterOn}
        today={today}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        weekNumber={weekNumber}
        prevWeekHref={prevWeekHref}
        nextWeekHref={nextWeekHref}
        cityCounts={cityCounts}
        cityThumbnails={cityThumbnails}
        searchableEvents={searchableEvents}
        nextEvent={nextEvent}
        regions={regions}
        newsletterStatus={newsletterStatus}
      />
    </main>
  );
}
