"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { esCL } from "@/i18n/es-CL";
import { cityById, OTHER_CITY } from "@/lib/cities";
import {
  CITY_COOKIE,
  FAMILY_MODE_COOKIE,
  TODAY_FILTER_COOKIE,
  VIGENTES_FILTER_COOKIE,
  NEWSLETTER_PROMPT_COOKIE,
  setCookie,
  pushRecentCityId,
} from "@/lib/cookies";
import { fmtShort } from "@/lib/date";
import type { CityCounts, EventRecord, RegionMeta } from "@/lib/events";
import Header from "./Header";
import FiltersSection from "./FiltersSection";
import InauguracionCard from "./InauguracionCard";
import ExpoCard from "./ExpoCard";
import CuratoriaBanner from "./CuratoriaBanner";
import CityCarousel from "./CityCarousel";
import Footer from "./Footer";
import CityPickerPanel from "./CityPickerPanel";
import MenuDrawer from "./MenuDrawer";
import SearchPanel from "./SearchPanel";
import GeoConsentBanner from "./GeoConsentBanner";
import GeoLocationChangedBanner from "./GeoLocationChangedBanner";
import NewsletterStatusModal, { type NewsletterStatus } from "./NewsletterStatusModal";
import NewsletterEntryModal from "./NewsletterEntryModal";

interface CalendarViewProps {
  inauguraciones: EventRecord[];
  exposActuales: EventRecord[];
  cityId: string;
  actualCityId: string | null; // IP-geolocated comuna, recomputed every render regardless of cityId — CityPickerPanel's "Tu ubicación actual" row; null when there's no real signal (outside Chile, no geo header)
  hasPreciseLocation: boolean; // true once a real geolocation reading (banner or picker button) has been granted — hides the picker's redundant "Usar mi ubicación exacta" button
  showGeoConsentPrompt: boolean; // true only when the visitor has never answered GeoConsentBanner's prompt
  showNewsletterPrompt: boolean; // true only when the visitor has never seen NewsletterEntryModal's auto-prompt
  cityNames: Record<string, string>; // real observed comuna names, id -> name — see cities.ts
  familyMode: boolean;
  todayFilterOn: boolean; // Filtros "Hoy" pill — narrows this city's lists to only today's active events
  vigentesFilterOn: boolean; // Filtros "Vigentes" pill — hides inauguraciones whose opening date already passed this week
  today: string; // YYYY-MM-DD, computed server-side for SSR/CSR consistency
  rangeStart: string; // YYYY-MM-DD — the current week's Monday
  rangeEnd: string; // YYYY-MM-DD — the current week's Sunday
  weekNumber: number; // "SEMANA N°X" — sequential since launch, see lib/date.ts
  prevWeekHref: string; // "/?semana=..." — real navigation, not a cookie (see page.tsx)
  nextWeekHref: string;
  cityCounts: Record<string, CityCounts>; // full-week counts, unaffected by Hoy/Vigentes — CityCarousel/city picker
  cityThumbnails: Record<string, EventRecord[]>; // up to 4 preview events per comuna — CityCarousel
  searchableEvents: EventRecord[]; // active/upcoming, every comuna — SearchPanel's own scope
  nextEvent: EventRecord | null; // empty-state fallback, beyond the current week
  regions: RegionMeta[]; // for the city picker's región grouping
  archiveHref: string | null; // "Expos anteriores" row target in MenuDrawer — null when no month is archived yet
  newsletterStatus: NewsletterStatus | null; // from ?newsletter= — set by /newsletter/confirmar or /newsletter/baja's redirect
}

export default function CalendarView({
  inauguraciones,
  exposActuales,
  cityId,
  actualCityId,
  hasPreciseLocation,
  showGeoConsentPrompt,
  showNewsletterPrompt,
  cityNames,
  familyMode,
  todayFilterOn,
  vigentesFilterOn,
  today,
  rangeStart,
  rangeEnd,
  weekNumber,
  prevWeekHref,
  nextWeekHref,
  cityCounts,
  cityThumbnails,
  searchableEvents,
  nextEvent,
  regions,
  archiveHref,
  newsletterStatus,
}: CalendarViewProps) {
  const router = useRouter();
  const cityPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Auto-opens once (showNewsletterPrompt, from the cookie check in
  // page.tsx) but stays independently reachable afterward via the
  // Footer's own "Suscríbete" link — see openNewsletterEntry/
  // closeNewsletterEntry below. Never auto-opens on top of
  // NewsletterStatusModal — a visitor arriving via a confirm/baja email
  // link (newsletterStatus set) already gets that modal; stacking the
  // entry prompt over it would bury the actual result.
  const [newsletterEntryOpen, setNewsletterEntryOpen] = useState(showNewsletterPrompt && !newsletterStatus);

  const city = cityById(cityId, cityNames);

  // Records the city being LEFT (not the destination) into "Últimas
  // visitadas" — a self-visit (re-confirming the same city) and "otro"
  // (not a real memorable place) are never worth remembering.
  function recordDeparture(nextCityId: string) {
    if (nextCityId !== cityId && cityId !== OTHER_CITY.id) pushRecentCityId(cityId);
  }

  // Commits + navigates immediately — used by both the carousel and the
  // city picker (clicking a row, or pressing Enter on one), mirroring
  // CityCarousel's own instant-navigate pattern. No more pending-selection
  // + separate "Explorar" confirm step.
  function goToCity(nextCityId: string) {
    recordDeparture(nextCityId);
    setCookie(CITY_COOKIE, nextCityId);
    setLocationOpen(false);
    window.scrollTo(0, 0);
    router.refresh();
  }

  function toggleFamilyMode() {
    setCookie(FAMILY_MODE_COOKIE, familyMode ? "" : "1");
    router.refresh();
  }

  // Hoy and Vigentes are mutually exclusive — turning Hoy on already
  // narrows everything to today, which makes Vigentes' "hide already-passed
  // openings this week" redundant (today's openings are never in the
  // past), so enabling either one clears the other.
  function toggleTodayFilter() {
    const turningOn = !todayFilterOn;
    setCookie(TODAY_FILTER_COOKIE, turningOn ? "1" : "");
    if (turningOn) setCookie(VIGENTES_FILTER_COOKIE, "");
    router.refresh();
  }

  function toggleVigentesFilter() {
    const turningOn = !vigentesFilterOn;
    setCookie(VIGENTES_FILTER_COOKIE, turningOn ? "1" : "");
    if (turningOn) setCookie(TODAY_FILTER_COOKIE, "");
    router.refresh();
  }

  const isEmpty = inauguraciones.length === 0 && exposActuales.length === 0;

  // Same "answered = never ask again unprompted" semantics as
  // GeoConsentBanner's decline() — closing (subscribed or not) sets the
  // cookie either way. Reopening later via the Footer link never touches
  // this cookie, so it doesn't re-arm the auto-prompt.
  function closeNewsletterEntry() {
    setCookie(NEWSLETTER_PROMPT_COOKIE, "seen");
    setNewsletterEntryOpen(false);
  }

  function openNewsletterEntry() {
    setNewsletterEntryOpen(true);
  }

  return (
    <div className="w-full relative">
      <NewsletterStatusModal status={newsletterStatus} />
      <NewsletterEntryModal open={newsletterEntryOpen} onClose={closeNewsletterEntry} />
      <GeoConsentBanner show={showGeoConsentPrompt} regions={regions} />
      <GeoLocationChangedBanner
        hasPreciseLocation={hasPreciseLocation}
        actualCityId={actualCityId}
        cityNames={cityNames}
        regions={regions}
      />

      <Header
        city={city}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        weekNumber={weekNumber}
        prevWeekHref={prevWeekHref}
        nextWeekHref={nextWeekHref}
        onOpenCityPicker={() => setLocationOpen(true)}
        cityPickerTriggerRef={cityPickerTriggerRef}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenMenu={() => setDrawerOpen(true)}
      />

      <FiltersSection
        familyMode={familyMode}
        todayFilterOn={todayFilterOn}
        vigentesFilterOn={vigentesFilterOn}
        onToggleFamilyMode={toggleFamilyMode}
        onToggleTodayFilter={toggleTodayFilter}
        onToggleVigentesFilter={toggleVigentesFilter}
      />

      {/* Value-prop tagline — previously only lived in <meta description>
          and the footer, nothing stated it above the fold (2026-07-28 UX
          audit finding). Placed here, not its own banner: this is the gap
          between Filtros and the first section heading, mobile's largest
          unused stretch of whitespace, so it also tightens that up instead
          of adding a new one. */}
      <p className="mt-2 text-xs text-muted-gray">{esCL.footer.tagline}</p>

      {isEmpty ? (
        <div className="py-10">
          {nextEvent ? (
            <p className="text-sm text-heading-gray">
              {esCL.emptyWithNextEvent(
                city.name,
                todayFilterOn ? esCL.todaySuffix : esCL.thisWeekSuffix,
                nextEvent.openingDatetime ? fmtShort(nextEvent.openingDatetime.slice(0, 10)) : fmtShort(nextEvent.runStartDate ?? today),
                nextEvent.title,
              )}
            </p>
          ) : (
            <>
              <p className="text-sm text-heading-gray mb-2">{esCL.emptyNoEventsYet(city.name)}</p>
              <p className="text-xs text-muted-gray mb-3">{esCL.doYouKnowOne}</p>
              <button className="text-xs px-3 py-1.5 rounded-full bg-city-pill-bg text-city-pill-fg">{esCL.tellUs}</button>
            </>
          )}
        </div>
      ) : (
        <>
          {inauguraciones.length > 0 && (
            <section className="mt-6">
              <h2 className="text-3xl md:text-[41px] font-black tracking-wide text-heading-gray mb-6">{esCL.sectionInauguraciones}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-[118px]">
                {inauguraciones.map((e) => (
                  <InauguracionCard key={e.id} event={e} hideTodayBadge={todayFilterOn} />
                ))}
              </div>
            </section>
          )}

          <div className="w-full flex flex-wrap justify-center">
            <CuratoriaBanner />
          </div>

          {exposActuales.length > 0 && (
            <section className="mt-16">
              <h2 className="text-3xl md:text-[41px] font-semibold tracking-wide text-heading-gray mb-6">{esCL.sectionExposActuales}</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {exposActuales.map((e) => (
                  <ExpoCard key={e.id} event={e} hideTodayBadge={todayFilterOn} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <CityCarousel
        cityCounts={cityCounts}
        cityNames={cityNames}
        cityThumbnails={cityThumbnails}
        regions={regions}
        excludeCityId={cityId}
        onSelectCity={goToCity}
      />

      <Footer onOpenNewsletter={openNewsletterEntry} />

      <CityPickerPanel
        open={locationOpen}
        cityId={cityId}
        actualCityId={actualCityId}
        hasPreciseLocation={hasPreciseLocation}
        cityCounts={cityCounts}
        cityNames={cityNames}
        regions={regions}
        onClose={() => {
          setLocationOpen(false);
          cityPickerTriggerRef.current?.focus();
        }}
        onSelectCity={goToCity}
      />

      <MenuDrawer open={drawerOpen} archiveHref={archiveHref} onClose={() => setDrawerOpen(false)} />

      <SearchPanel open={searchOpen} events={searchableEvents} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
