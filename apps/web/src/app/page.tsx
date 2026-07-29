import { cookies, headers } from "next/headers";
import { getSupabaseClient } from "@/lib/supabase-client";
import {
  fetchApprovedEvents,
  filterFamilyMode,
  filterByCity,
  filterActiveInRange,
  splitInauguracionesYExpos,
  countByCity,
  cityNamesFromEvents,
  thumbnailsByCity,
  findNextEvent,
  listArchiveMonths,
  type WindowMode,
} from "@/lib/events";
import { DEFAULT_CITY_ID, buildRegionMetaByCityId, resolveDefaultCityId, resolveGeoCityId } from "@/lib/cities";
import { todayInSantiago, currentWeekInSantiago, isCurrentOrUpcoming } from "@/lib/date";
import { CITY_COOKIE, FAMILY_MODE_COOKIE, WINDOW_MODE_COOKIE } from "@/lib/cookies";
import CalendarView from "@/components/CalendarView";

export default async function HomePage() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  // Absent cookie means family mode ON — a first-time visitor sees
  // filtered content by default; explicitly turning it off (empty-string
  // cookie value, set by CalendarView.tsx's toggleFamilyMode) is the only
  // way to see everything.
  const familyModeCookie = cookieStore.get(FAMILY_MODE_COOKIE)?.value;
  const familyMode = familyModeCookie === undefined ? true : Boolean(familyModeCookie);
  const today = todayInSantiago();
  const { start: weekStart, end: weekEnd } = currentWeekInSantiago();
  // Absent cookie -> "week": the whole point of the Semana mode is
  // planning ahead, so it's the default; Día is one click away via the
  // city picker's Hoy/Semanal toggle.
  const windowModeCookie = cookieStore.get(WINDOW_MODE_COOKIE)?.value;
  const windowMode: WindowMode = windowModeCookie === "day" ? "day" : "week";
  const { start: rangeStart, end: rangeEnd } = windowMode === "day" ? { start: today, end: today } : { start: weekStart, end: weekEnd };

  const { events: allEvents, regions } = await fetchApprovedEvents(getSupabaseClient());
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

  // Home shows only what's visitable within the current window (a single
  // day or the current Mon-Sun week, per windowMode) — nothing not yet
  // started, nothing already ended.
  const activeInRange = filterActiveInRange(visible, rangeStart, rangeEnd);
  // Computed for BOTH windows (not just the confirmed one) so the city
  // picker can preview Hoy/Semanal counts live while its own toggle is
  // still pending/unconfirmed — see CityPickerPanel's "Explorar" flow,
  // which only commits a mode change (cookie + refresh) once clicked.
  const cityCountsDay = countByCity(filterActiveInRange(visible, today, today), today, today);
  const cityCountsWeek = countByCity(filterActiveInRange(visible, weekStart, weekEnd), weekStart, weekEnd);
  const cityCounts = windowMode === "day" ? cityCountsDay : cityCountsWeek;
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
      : resolveDefaultCityId(geoCity, geoCountry, buildRegionMetaByCityId(regions), cityCounts);

  // Unlike `cityId` above, this is computed EVERY render, even once a
  // CITY_COOKIE already picked a different city — it's what feeds the city
  // picker's "Tu ubicación actual" quick-pick row (CityPickerPanel), which
  // needs to keep offering "jump back home" after the visitor has
  // wandered off to browse a different comuna, not just on the very first
  // visit. Uses resolveGeoCityId, NOT resolveDefaultCityId — this row
  // claims to report where the visitor actually IS, so it must never
  // substitute a region-mate city just because the visitor's own comuna
  // has zero events right now (real bug found 2026-07-29: showed
  // "Santiago" to a visitor in La Reina). null means no real signal
  // (outside Chile, no geo header, or an unrecognized comuna) — the row is
  // hidden entirely rather than guessing.
  const actualCityId = resolveGeoCityId(geoCity, geoCountry, buildRegionMetaByCityId(regions));

  const cityEventsInRange = filterByCity(activeInRange, cityId);
  const { inauguraciones, exposActuales } = splitInauguracionesYExpos(cityEventsInRange, rangeStart, rangeEnd);

  // Empty-state fallback looks beyond the current window within the
  // selected city, so it can say "the next one is on X" instead of just
  // "nothing."
  const nextEvent = findNextEvent(filterByCity(visible, cityId), today, rangeEnd);

  // "Revisá expos anteriores" link next to EXPOS ACTUALES — points at the
  // most recently archived month, computed from data already in memory
  // (no extra fetch). Omitted (null) rather than guessed when there's no
  // archived month yet, so it's never a link to a 404.
  const [latestArchiveMonth] = listArchiveMonths(allEvents, today);
  const archiveHref = latestArchiveMonth
    ? `/expos-anteriores/${latestArchiveMonth.year}/${String(latestArchiveMonth.month).padStart(2, "0")}`
    : null;

  return (
    <main className="min-h-screen w-full bg-white px-4 py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <CalendarView
        inauguraciones={inauguraciones}
        exposActuales={exposActuales}
        cityId={cityId}
        actualCityId={actualCityId}
        cityNames={cityNames}
        familyMode={familyMode}
        today={today}
        windowMode={windowMode}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        cityCounts={cityCounts}
        cityCountsDay={cityCountsDay}
        cityCountsWeek={cityCountsWeek}
        cityThumbnails={cityThumbnails}
        searchableEvents={searchableEvents}
        nextEvent={nextEvent}
        regions={regions}
        archiveHref={archiveHref}
      />
    </main>
  );
}
