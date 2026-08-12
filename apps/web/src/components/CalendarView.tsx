"use client";

import { useRef, useState } from "react";
import { esCL } from "@/i18n/es-CL";
import { adminRegionNameByRegionId } from "@/lib/cities";
import { shortRegionName } from "@/lib/regionNames";
import { REGION_COOKIE, FAMILY_MODE_COOKIE, setCookie, pushRecentRegionId } from "@/lib/cookies";
import { fmtShort } from "@/lib/date";
import type { CityCounts, EventRecord, RegionMeta } from "@/lib/events";
import Header from "./Header";
import InauguracionesSection from "./InauguracionesSection";
import ExposicionesSection from "./ExposicionesSection";
import CuratoriaBanner from "./CuratoriaBanner";
import NewsletterSection from "./NewsletterSection";
import Footer from "./Footer";
import CityPickerPanel from "./CityPickerPanel";
import MenuDrawer from "./MenuDrawer";
import SearchPanel from "./SearchPanel";
import GeoConsentBanner from "./GeoConsentBanner";
import GeoLocationChangedBanner from "./GeoLocationChangedBanner";
import NewsletterStatusModal, { type NewsletterStatus } from "./NewsletterStatusModal";

interface CalendarViewProps {
  inauguraciones: EventRecord[];
  exposActuales: EventRecord[];
  regionId: string; // the site's own selection unit — see cities.ts's "Región-level selection"
  actualCityId: string | null; // IP-geolocated comuna, recomputed every render regardless of región — CityPickerPanel's "Tu ubicación actual" row; null when there's no real signal (outside Chile, no geo header)
  hasPreciseLocation: boolean; // true once a real geolocation reading (banner or picker button) has been granted — hides the picker's redundant "Usar mi ubicación exacta" button
  showGeoConsentPrompt: boolean; // true only when the visitor has never answered GeoConsentBanner's prompt
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
  newsletterStatus: NewsletterStatus | null; // from ?newsletter= — set by /newsletter/confirmar or /newsletter/baja's redirect
  // Called after a city or family-mode change, instead of router.refresh()
  // (2026-08-06) — this page is cache-eligible now (see app/page.tsx's own
  // comment), so a plain refresh would just re-serve the same cached
  // default instead of picking up the cookie that was just set.
  // HomeClient.tsx supplies the real implementation (re-fetch
  // /api/home-data and swap the view model in). Optional, defaulting to a
  // no-op — page.tsx's own Suspense fallback renders this component
  // directly from a Server Component, which can't pass a function prop
  // across that boundary; that fallback is only ever shown for the
  // instant before client hydration takes over, so a no-op there is safe.
  onRefreshNeeded?: () => void;
}

export default function CalendarView({
  inauguraciones,
  exposActuales,
  regionId,
  actualCityId,
  hasPreciseLocation,
  showGeoConsentPrompt,
  cityNames,
  familyMode,
  todayFilterOn,
  today,
  rangeStart,
  rangeEnd,
  weekNumber,
  prevWeekHref,
  nextWeekHref,
  cityCounts,
  searchableEvents,
  nextEvent,
  regions,
  newsletterStatus,
  onRefreshNeeded = () => {},
}: CalendarViewProps) {
  const cityPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerInitialView, setDrawerInitialView] = useState<"menu" | "contact">("menu");
  const [searchOpen, setSearchOpen] = useState(false);

  // Footer's "Contacto" link — opens the same MenuDrawer straight into its
  // contact view, instead of navigating to the now-removed /contacto page.
  function openContactDrawer() {
    setDrawerInitialView("contact");
    setDrawerOpen(true);
  }

  const regionName = shortRegionName(adminRegionNameByRegionId(regions).get(regionId) ?? regionId);

  // Records the región being LEFT (not the destination) into "Últimas
  // visitadas" — re-confirming the same región is never worth remembering.
  function recordDeparture(nextRegionId: string) {
    if (nextRegionId !== regionId) pushRecentRegionId(regionId);
  }

  // Commits + navigates immediately — used by the city picker (clicking a
  // row, or pressing Enter on one). No pending-selection + separate
  // "Explorar" confirm step.
  function goToRegion(nextRegionId: string) {
    recordDeparture(nextRegionId);
    setCookie(REGION_COOKIE, nextRegionId);
    setLocationOpen(false);
    window.scrollTo(0, 0);
    onRefreshNeeded();
  }

  function toggleFamilyMode() {
    setCookie(FAMILY_MODE_COOKIE, familyMode ? "" : "1");
    onRefreshNeeded();
  }

  const isEmpty = inauguraciones.length === 0 && exposActuales.length === 0;

  return (
    <div className="w-full relative">
      <NewsletterStatusModal status={newsletterStatus} />
      <GeoConsentBanner show={showGeoConsentPrompt} regions={regions} />
      <GeoLocationChangedBanner
        hasPreciseLocation={hasPreciseLocation}
        actualCityId={actualCityId}
        regions={regions}
      />

      <Header
        regionName={regionName}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        weekNumber={weekNumber}
        prevWeekHref={prevWeekHref}
        nextWeekHref={nextWeekHref}
        onOpenCityPicker={() => setLocationOpen(true)}
        cityPickerTriggerRef={cityPickerTriggerRef}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenMenu={() => {
          setDrawerInitialView("menu");
          setDrawerOpen(true);
        }}
      />

      {isEmpty ? (
        <div className="py-10">
          {nextEvent ? (
            <p className="text-sm text-heading-gray">
              {esCL.emptyWithNextEvent(
                regionName,
                todayFilterOn ? esCL.todaySuffix : esCL.thisWeekSuffix,
                nextEvent.openingDatetime ? fmtShort(nextEvent.openingDatetime.slice(0, 10)) : fmtShort(nextEvent.runStartDate ?? today),
                nextEvent.title,
              )}
            </p>
          ) : (
            <>
              <p className="text-sm text-heading-gray mb-2">{esCL.emptyNoEventsYet(regionName)}</p>
              <p className="text-xs text-muted-gray mb-3">{esCL.doYouKnowOne}</p>
              <button className="text-xs px-3 py-1.5 rounded-full bg-city-pill-bg text-city-pill-fg">{esCL.tellUs}</button>
            </>
          )}
        </div>
      ) : (
        <>
          <InauguracionesSection events={inauguraciones} hideTodayBadge={todayFilterOn} />

          {/* CuratoriaBanner sits between Inauguraciones and Exposiciones
              only when Inauguraciones actually renders (it returns null
              with zero events this week). Otherwise it moves down to sit
              between Exposiciones and the "texto AI" line below, so it's
              never floating right under the Header with nothing above it. */}
          {inauguraciones.length > 0 && (
            <div className="w-full flex flex-wrap justify-center">
              <CuratoriaBanner />
            </div>
          )}

          <ExposicionesSection events={exposActuales} hideTodayBadge={todayFilterOn} />

          {inauguraciones.length === 0 && (
            <div className="w-full flex flex-wrap justify-center">
              <CuratoriaBanner />
            </div>
          )}
        </>
      )}

      {/* "Arte en todas partes" (CityCarousel) removed from the home for
          now, 2026-08-04 — "Explora todo Chile" (región/comuna table) is
          slated to replace it per the redesign plan; not deleting
          CityCarousel.tsx itself since that replacement is a near-term
          next step, not an indefinite removal. cityCounts/cityThumbnails
          stay wired through unchanged — CityPickerPanel below still
          needs them regardless of whether this carousel renders. */}

      {/* "texto AI" (174:2985) — its own short section between Exposiciones
          and the newsletter form, not part of either. Large gap above
          (echoing Exposiciones' own bottom spacing), tight against the
          form below. */}
      <p className="mt-[60px] md:mt-[120px] mb-4 text-center text-[1rem] font-fragment-mono text-text-primary">{esCL.aiDisclaimer}</p>

      <NewsletterSection />

      <Footer onContactClick={openContactDrawer} />

      <CityPickerPanel
        open={locationOpen}
        regionId={regionId}
        actualCityId={actualCityId}
        hasPreciseLocation={hasPreciseLocation}
        cityCounts={cityCounts}
        cityNames={cityNames}
        regions={regions}
        onClose={() => {
          setLocationOpen(false);
          cityPickerTriggerRef.current?.focus();
        }}
        onSelectRegion={goToRegion}
      />

      <MenuDrawer
        open={drawerOpen}
        familyMode={familyMode}
        onToggleFamilyMode={toggleFamilyMode}
        onClose={() => setDrawerOpen(false)}
        initialView={drawerInitialView}
      />

      <SearchPanel open={searchOpen} events={searchableEvents} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
