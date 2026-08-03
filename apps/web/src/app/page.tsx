import { cookies, headers } from "next/headers";
import { getSupabaseClient } from "@/lib/supabase-client";
import {
  fetchApprovedEvents,
  filterFamilyMode,
  filterByCity,
  filterActiveInRange,
  splitInauguracionesYExpos,
  filterUpcomingInauguraciones,
  countByCity,
  cityNamesFromEvents,
  thumbnailsByCity,
  findNextEvent,
  listArchiveMonths,
} from "@/lib/events";
import {
  DEFAULT_CITY_ID,
  buildRegionMetaByCityId,
  resolveDefaultCityId,
  resolveGeoCityId,
  nearestCityIdByCoords,
} from "@/lib/cities";
import {
  todayInSantiago,
  currentWeekInSantiago,
  weekBoundsInSantiago,
  addWeeks,
  weekNumberSince,
  isCurrentOrUpcoming,
} from "@/lib/date";
import {
  CITY_COOKIE,
  FAMILY_MODE_COOKIE,
  TODAY_FILTER_COOKIE,
  VIGENTES_FILTER_COOKIE,
  GEO_CONSENT_COOKIE,
  PRECISE_CITY_COOKIE,
  NEWSLETTER_PROMPT_COOKIE,
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
    suscribir?: string;
    semana?: string;
  }>;
}) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  // Landed here from /newsletter/confirmar or /newsletter/baja (both
  // redirect to `/?newsletter=<status>` after calling their Edge Function
  // server-side) — see NewsletterStatusModal.tsx.
  const { newsletter, suscribir, semana } = await searchParams;
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

  const { events: allEvents, regions } =
    await fetchApprovedEvents(getSupabaseClient());
  // Family-mode filtering happens here, server-side, before anything is
  // sent to the client — excluded events never reach the HTML/JS, which is
  // what actually satisfies "no flash of unblurred content" (overview.md).
  const visible = filterFamilyMode(allEvents, familyMode);

  // Real observed city names, not a fixed list — any comuna a real event
  // resolves to (see cities.ts) is a legitimate, navigable destination.
  // Built from ALL events (not just active-in-range), so a
  // directly-navigated city still shows its proper name even with zero
  // active events right now.
  const cityNames = cityNamesFromEvents(allEvents);

  // Home shows only what's visitable within the current week — nothing not
  // yet started, nothing already ended. The Filtros pills (Hoy, Vigentes)
  // never change this — they only narrow the SELECTED CITY's own lists
  // further down, not this citywide set.
  const activeInRange = filterActiveInRange(visible, rangeStart, rangeEnd);
  // Always full-week — CityCarousel/city picker counts are deliberately
  // unaffected by the Hoy/Vigentes pills (confirmed scope: those only
  // narrow the currently-viewed city's own lists).
  const cityCounts = countByCity(activeInRange, rangeStart, rangeEnd);
  // Preview thumbnails for the "Arte en todas partes" carousel — computed
  // over the same all-comunas activeInRange set countByCity already uses,
  // not the selected city's own narrowed event list.
  const cityThumbnails = thumbnailsByCity(activeInRange, 4);
  // SearchPanel's own scope: every active/upcoming event, every comuna —
  // deliberately NOT narrowed to rangeStart/rangeEnd or the selected city
  // (see the product discussion: a scoped-empty search result is
  // ambiguous — "doesn't exist" vs. "wrong filter"). Never includes past
  // (archived) events; that stays the Archive's own job.
  const searchableEvents = visible.filter((e) => isCurrentOrUpcoming(e, today));

  // A manual pick (CITY_COOKIE) always wins and is never re-resolved. With
  // no cookie yet, resolve fresh from Vercel's IP-geolocation headers every
  // render — own comuna (if it has events) -> a comuna in the same admin
  // región that does -> Santiago if outside Chile or nothing matched.
  // These headers don't exist on localhost (no-op there, falls through to
  // Santiago) — real geo-detection only happens on an actual Vercel deploy.
  const cityCookieValue = cookieStore.get(CITY_COOKIE)?.value;
  const geoCity = headerStore.get("x-vercel-ip-city") ?? undefined;
  const geoCountry = headerStore.get("x-vercel-ip-country") ?? undefined;
  const cityId =
    cityCookieValue !== undefined
      ? cityCookieValue in cityNames || cityCookieValue === DEFAULT_CITY_ID
        ? cityCookieValue
        : DEFAULT_CITY_ID
      : resolveDefaultCityId(
          geoCity,
          geoCountry,
          buildRegionMetaByCityId(regions),
          cityCounts,
        );

  // Unlike `cityId` above, this is computed EVERY render, even once a
  // CITY_COOKIE already picked a different city — it's what feeds the city
  // picker's "Tu ubicación actual" quick-pick row (CityPickerPanel), which
  // needs to keep offering "jump back home" after the visitor has
  // wandered off to browse a different comuna, not just on the very first
  // visit. Never substitutes a region-mate city just because the
  // visitor's own comuna has zero events right now (real bug found
  // 2026-07-29: showed "Santiago" to a visitor in La Reina) — null means
  // no real signal (outside Chile, no geo header, or an unrecognized
  // comuna) and the row is hidden entirely rather than guessing.
  //
  // Prefers Vercel's lat/long headers over its city-name header when
  // both are present: `x-vercel-ip-city` only resolves to city-level
  // granularity for Greater Santiago (can't distinguish La Reina from
  // Santiago), but the coordinates are a finer-grained estimate — see
  // nearestCityIdByCoords's own doc comment (cities.ts) for the distance
  // sanity check that keeps a bad/missing coordinate reading from ever
  // outranking the name match.
  const geoLatHeader = headerStore.get("x-vercel-ip-latitude");
  const geoLngHeader = headerStore.get("x-vercel-ip-longitude");
  const geoLat = geoLatHeader ? Number(geoLatHeader) : NaN;
  const geoLng = geoLngHeader ? Number(geoLngHeader) : NaN;
  const hasGeoCoords = Number.isFinite(geoLat) && Number.isFinite(geoLng);
  // PRECISE_CITY_COOKIE (a real, granted geolocation reading — banner or
  // the picker's own button) always outranks both of the above: it's
  // durable and strictly more precise than any per-request IP estimate.
  // Real bug found 2026-07-30: without this short-circuit, "Tu ubicación
  // actual" kept reverting to the coarse IP-based city on every new
  // render/navigation even after the visitor had already granted a
  // precise reading once.
  const preciseCityCookie = cookieStore.get(PRECISE_CITY_COOKIE)?.value;
  const hasPreciseLocation = preciseCityCookie !== undefined;
  const actualCityId =
    preciseCityCookie ??
    (hasGeoCoords ? nearestCityIdByCoords(geoLat, geoLng, regions) : null) ??
    resolveGeoCityId(geoCity, geoCountry, buildRegionMetaByCityId(regions));

  // GeoConsentBanner.tsx: shown at most once ever, the very first time a
  // visitor hasn't yet answered — every subsequent render (including
  // after they answer, since answering sets this cookie and refreshes)
  // has it hidden.
  const showGeoConsentPrompt =
    cookieStore.get(GEO_CONSENT_COOKIE) === undefined;

  // NewsletterEntryModal: same "ask at most once, ever" pattern — but only
  // as an unprompted auto-open. The Footer's own "Suscríbete" link can
  // still open the same modal any time, regardless of this cookie — from
  // a page that doesn't render the modal itself (eventos/[id]), that link
  // navigates here with ?suscribir=1 instead, which forces it open too.
  const showNewsletterPrompt =
    cookieStore.get(NEWSLETTER_PROMPT_COOKIE) === undefined ||
    suscribir === "1";

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

  // "Revisá expos anteriores" link next to EXPOS ACTUALES — points at the
  // most recently archived month, computed from data already in memory
  // (no extra fetch). Omitted (null) rather than guessed when there's no
  // archived month yet, so it's never a link to a 404.
  const [latestArchiveMonth] = listArchiveMonths(allEvents, today);
  const archiveHref = latestArchiveMonth
    ? `/expos-anteriores/${latestArchiveMonth.year}/${String(latestArchiveMonth.month).padStart(2, "0")}`
    : null;

  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <CalendarView
        inauguraciones={inauguraciones}
        exposActuales={exposActuales}
        cityId={cityId}
        actualCityId={actualCityId}
        hasPreciseLocation={hasPreciseLocation}
        showGeoConsentPrompt={showGeoConsentPrompt}
        showNewsletterPrompt={showNewsletterPrompt}
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
        archiveHref={archiveHref}
        newsletterStatus={newsletterStatus}
      />
    </main>
  );
}
