"use client";

import { useRef, useState } from "react";
import { esCL } from "@/i18n/es-CL";
import { adminRegionNameByRegionId, buildRegionMetaByCityId, regionIdFromAdminRegionName } from "@/lib/cities";
import { shortRegionName } from "@/lib/regionNames";
import { REGION_COOKIE, FAMILY_MODE_COOKIE, GEO_CONSENT_COOKIE, PRECISE_CITY_COOKIE, setCookie, pushRecentRegionId } from "@/lib/cookies";
import { currentWeekInSantiago, fmtShort } from "@/lib/date";
import { requestPreciseCityId } from "@/lib/geolocation";
import type { EventRecord, RegionMeta } from "@/lib/events";
import type { CityCounts, RegionActivity } from "@/lib/event-utils";
import Header from "./Header";
import WeekHeading from "./WeekHeading";
import RegionNav from "./RegionNav";
import AgendaSection from "./AgendaSection";
import CarteleraSection from "./CarteleraSection";
import NewsletterSection from "./NewsletterSection";
import EspaciosSection from "./EspaciosSection";
import Footer from "./Footer";
import CityPickerPanel from "./CityPickerPanel";
import MenuDrawer from "./MenuDrawer";
import SearchPanel from "./SearchPanel";
import GeoLocationChangedBanner from "./GeoLocationChangedBanner";
import NewsletterStatusModal, { type NewsletterStatus } from "./NewsletterStatusModal";

interface CalendarViewProps {
  inauguraciones: EventRecord[];
  visitasGuiadas: EventRecord[];
  exposActuales: EventRecord[];
  regionId: string; // the site's own selection unit — see cities.ts's "Región-level selection"
  actualCityId: string | null; // IP-geolocated comuna, recomputed every render regardless of región — CityPickerPanel's "Tu ubicación actual" row; null when there's no real signal (outside Chile, no geo header)
  hasPreciseLocation: boolean; // true once a real geolocation reading has been granted — hides "Usar mi ubicación"
  cityNames: Record<string, string>; // real observed comuna names, id -> name — see cities.ts
  familyMode: boolean;
  todayFilterOn: boolean; // Filtros "Hoy" pill — narrows this city's lists to only today's active events
  today: string; // YYYY-MM-DD, computed server-side for SSR/CSR consistency
  rangeStart: string; // YYYY-MM-DD — the current week's Monday
  rangeEnd: string; // YYYY-MM-DD — the current week's Sunday
  weekNumber: number; // sequential since launch, see lib/date.ts — only gates the "previous week" chevron now
  prevWeekHref: string; // "/?semana=..." — real navigation, not a cookie (see page.tsx)
  nextWeekHref: string;
  cityCounts: Record<string, CityCounts>; // full-week counts, unaffected by Hoy/Vigentes — city picker
  regionActivity: Record<string, RegionActivity>; // distinct events per región — RegionNav
  searchableEvents: EventRecord[]; // active/upcoming, every comuna — SearchPanel's own scope
  nextEvent: EventRecord | null; // empty-state fallback, beyond the current week
  regions: RegionMeta[];
  newsletterStatus: NewsletterStatus | null; // from ?newsletter= — set by /newsletter/confirmar or /newsletter/baja's redirect
  // Called after a región or family-mode change, instead of
  // router.refresh() (2026-08-06) — this page is cache-eligible (see
  // app/page.tsx's own comment), so a plain refresh would re-serve the
  // same cached default instead of picking up the cookie just set.
  // HomeClient.tsx supplies the real implementation (re-fetch
  // /api/home-data and swap the view model in). No-op default: page.tsx's
  // Suspense fallback renders this component straight from a Server
  // Component, which can't pass a function prop; that fallback only
  // shows for the instant before hydration.
  onRefreshNeeded?: () => void;
  // Whether onRefreshNeeded's fetch is in flight — WeekHeading shows a
  // loading bar instead of looking "stuck" (real report, 2026-08-15).
  isRefreshing?: boolean;
}

// Home layout of 2026-10-12, ordered by what a visitor (mostly on a
// phone, arriving from Instagram/Facebook) needs first:
//   1. where and which week (WeekHeading) + every región in view (RegionNav)
//   2. what happens on which day this week (AgendaSection)
//   3. the newsletter ask, right where "I want this weekly" makes sense
//   4. what's running, closing-soon first (CarteleraSection)
// Replaces the hero + count rings + three paged sliders + Curatoría and
// "¿Tienes un espacio?" banners, which put the first event ~1.4 screens
// below the fold. The curatorial line moved into Header, the venue ask is
// a compact strip at the end (EspaciosSection), the AI note lives in the
// Footer.
export default function CalendarView({
  inauguraciones,
  visitasGuiadas,
  exposActuales,
  regionId,
  actualCityId,
  hasPreciseLocation,
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
  regionActivity,
  searchableEvents,
  nextEvent,
  regions,
  newsletterStatus,
  onRefreshNeeded = () => {},
  isRefreshing = false,
}: CalendarViewProps) {
  const comunaSearchReturnRef = useRef<HTMLElement | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerInitialView, setDrawerInitialView] = useState<"menu" | "contact">("menu");
  const [searchOpen, setSearchOpen] = useState(false);
  const [locating, setLocating] = useState(false);

  function openContactDrawer() {
    setDrawerInitialView("contact");
    setDrawerOpen(true);
  }

  const adminRegionName = adminRegionNameByRegionId(regions).get(regionId) ?? regionId;
  const regionName = shortRegionName(adminRegionName);
  const currentWeekStart = currentWeekInSantiago().start;
  const isCurrentWeek = rangeStart === currentWeekStart;

  // Records the región being LEFT (not the destination) into "Últimas
  // visitadas" — re-confirming the same región is never worth remembering.
  function goToRegion(nextRegionId: string) {
    if (nextRegionId !== regionId) pushRecentRegionId(regionId);
    setCookie(REGION_COOKIE, nextRegionId);
    setLocationOpen(false);
    window.scrollTo(0, 0);
    onRefreshNeeded();
  }

  // "Usar mi ubicación" in RegionNav — replaces the yellow consent banner
  // that used to sit above everything on a first visit (and pushed the
  // page down once it appeared). Same cookies the banner set: any outcome
  // records the answer so GeoLocationChangedBanner/the picker know it.
  function locateMe() {
    setLocating(true);
    requestPreciseCityId(
      regions,
      (cityId) => {
        setLocating(false);
        setCookie(GEO_CONSENT_COOKIE, "granted");
        setCookie(PRECISE_CITY_COOKIE, cityId);
        const detected = buildRegionMetaByCityId(regions).get(cityId)?.adminRegionName;
        if (detected) goToRegion(regionIdFromAdminRegionName(detected));
        else onRefreshNeeded();
      },
      () => {
        setLocating(false);
        setCookie(GEO_CONSENT_COOKIE, "denied");
      },
    );
  }

  function toggleFamilyMode() {
    setCookie(FAMILY_MODE_COOKIE, familyMode ? "" : "1");
    onRefreshNeeded();
  }

  const isEmpty = inauguraciones.length === 0 && visitasGuiadas.length === 0 && exposActuales.length === 0;

  return (
    <div className="w-full relative">
      <NewsletterStatusModal status={newsletterStatus} />
      <GeoLocationChangedBanner hasPreciseLocation={hasPreciseLocation} actualCityId={actualCityId} regions={regions} />

      <Header
        onOpenSearch={() => setSearchOpen(true)}
        onOpenMenu={() => {
          setDrawerInitialView("menu");
          setDrawerOpen(true);
        }}
      />

      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-[48px] lg:mt-[12px]">
        <RegionNav
          regions={regions}
          regionId={regionId}
          regionActivity={regionActivity}
          hasPreciseLocation={hasPreciseLocation}
          locating={locating}
          onSelectRegion={goToRegion}
          onUseMyLocation={locateMe}
          onOpenComunaSearch={() => {
            comunaSearchReturnRef.current = document.activeElement as HTMLElement | null;
            setLocationOpen(true);
          }}
        />

        <div className={`min-w-0 transition-opacity ${isRefreshing ? "opacity-50" : ""}`}>
          <WeekHeading
            regionName={regionName}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            isCurrentWeek={isCurrentWeek}
            currentWeekHref={`/?semana=${currentWeekStart}`}
            weekNumber={weekNumber}
            prevWeekHref={prevWeekHref}
            nextWeekHref={nextWeekHref}
            isRefreshing={isRefreshing}
          />

          {isEmpty ? (
            <div className="py-10">
              {nextEvent ? (
                <p className="font-geist text-[15px] text-text-primary">
                  {esCL.emptyWithNextEvent(
                    regionName,
                    todayFilterOn ? esCL.todaySuffix : esCL.thisWeekSuffix,
                    nextEvent.openingDatetime ? fmtShort(nextEvent.openingDatetime.slice(0, 10)) : fmtShort(nextEvent.runStartDate ?? today),
                    nextEvent.title,
                  )}
                </p>
              ) : (
                <>
                  <p className="font-geist text-[15px] text-text-primary mb-2">{esCL.emptyNoEventsYet(regionName)}</p>
                  <p className="font-geist text-[13px] text-text-secondary">{esCL.doYouKnowOne}</p>
                  <button type="button" onClick={openContactDrawer} className="mt-3 text-[13px] px-3 py-1.5 rounded-full bg-text-primary text-surface-sage cursor-pointer">
                    {esCL.tellUs}
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <AgendaSection
                inauguraciones={inauguraciones}
                visitasGuiadas={visitasGuiadas}
                regionName={regionName}
                today={today}
                isCurrentWeek={isCurrentWeek}
              />
              <NewsletterSection adminRegionName={adminRegionName} />
              <CarteleraSection events={exposActuales} today={today} />
            </>
          )}
          {isEmpty && <NewsletterSection adminRegionName={adminRegionName} />}
          <EspaciosSection />
        </div>
      </div>

      <div className="mt-[64px] -mx-[20px] md:-mx-[61px]">
        <Footer onContactClick={openContactDrawer} />
      </div>

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
          comunaSearchReturnRef.current?.focus();
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
