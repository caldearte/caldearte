"use client";

import { useState } from "react";
import { esCL } from "@/i18n/es-CL";
import { adminRegionNameByRegionId, buildRegionMetaByCityId, regionIdFromAdminRegionName } from "@/lib/cities";
import { shortRegionName } from "@/lib/regionNames";
import { REGION_COOKIE, FAMILY_MODE_COOKIE, GEO_CONSENT_COOKIE, PRECISE_CITY_COOKIE, setCookie, pushRecentRegionId } from "@/lib/cookies";
import { currentWeekInSantiago, fmtShort } from "@/lib/date";
import { requestPreciseCityId } from "@/lib/geolocation";
import type { EventRecord, RegionMeta } from "@/lib/events";
import type { RegionActivity } from "@/lib/event-utils";
import Header from "./Header";
import WeekHeading from "./WeekHeading";
import RegionDropdown from "./RegionDropdown";
import AgendaSection from "./AgendaSection";
import CarteleraSection from "./CarteleraSection";
import CuratoriaBanner from "./CuratoriaBanner";
import NewsletterSection from "./NewsletterSection";
import EspaciosSection from "./EspaciosSection";
import Footer from "./Footer";
import MenuDrawer from "./MenuDrawer";
import SearchPanel from "./SearchPanel";
import GeoLocationChangedBanner from "./GeoLocationChangedBanner";
import NewsletterStatusModal, { type NewsletterStatus } from "./NewsletterStatusModal";

interface CalendarViewProps {
  inauguraciones: EventRecord[];
  visitasGuiadas: EventRecord[];
  exposActuales: EventRecord[];
  regionId: string; // the site's own selection unit — see cities.ts's "Región-level selection"
  actualCityId: string | null; // IP-geolocated comuna, recomputed every render regardless of región — GeoLocationChangedBanner's comparison point; null when there's no real signal (outside Chile, no geo header)
  hasPreciseLocation: boolean; // true once a real geolocation reading has been granted — hides "Usar mi ubicación"
  familyMode: boolean;
  todayFilterOn: boolean; // Filtros "Hoy" pill — narrows this city's lists to only today's active events
  today: string; // YYYY-MM-DD, computed server-side for SSR/CSR consistency
  rangeStart: string; // YYYY-MM-DD — the current week's Monday
  regionActivity: Record<string, RegionActivity>; // distinct events per región — RegionDropdown
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
//   1. which week and where: "[Esta semana ⌄] en [Santiago ⌄]"
//      (WeekHeading — both words are dropdowns)
//   2. the week's inauguraciones + visitas guiadas as flyer-style cards
//      (AgendaSection) — the most highlighted thing on the page
//   3. the Curatoría banner, then what's running (CarteleraSection)
//   4. the venue ask (EspaciosSection) and the newsletter side by side
// Replaces the hero + count rings + three paged sliders, which put the
// first event ~1.4 screens below the fold. CuratoriaBanner is unchanged
// on purpose (Daniel, 2026-10-12).
export default function CalendarView({
  inauguraciones,
  visitasGuiadas,
  exposActuales,
  regionId,
  actualCityId,
  hasPreciseLocation,
  familyMode,
  todayFilterOn,
  today,
  rangeStart,
  regionActivity,
  searchableEvents,
  nextEvent,
  regions,
  newsletterStatus,
  onRefreshNeeded = () => {},
  isRefreshing = false,
}: CalendarViewProps) {
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
    window.scrollTo(0, 0);
    onRefreshNeeded();
  }

  // "Usar mi ubicación" in RegionDropdown — replaces the yellow consent banner
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
        bottomBorder={false}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenMenu={() => {
          setDrawerInitialView("menu");
          setDrawerOpen(true);
        }}
      />

      <WeekHeading
        regionControl={
          <RegionDropdown
            regionName={regionName}
            regions={regions}
            regionId={regionId}
            regionActivity={regionActivity}
            hasPreciseLocation={hasPreciseLocation}
            locating={locating}
            onSelectRegion={goToRegion}
            onUseMyLocation={locateMe}
          />
        }
        rangeStart={rangeStart}
        currentWeekStart={currentWeekStart}
        isRefreshing={isRefreshing}
      />

      <div className={`transition-opacity ${isRefreshing ? "opacity-50" : ""}`}>
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
            {/* Lots of air around the banner (Daniel, 2026-10-13) — it
                separates the week's agenda from the cartelera: 120px above
                and below on a phone, 160px on desktop (above, this margin
                plus the banner's own mt-16; below, this margin, which the
                cartelera's mt-[48px] collapses into). */}
            <div id="curatoria" data-sticky-section="curatoria" className="scroll-mt-[200px] w-full flex flex-wrap justify-center mt-[56px] md:mt-[96px] mb-[120px] md:mb-[160px]">
              <CuratoriaBanner />
            </div>
            <CarteleraSection events={exposActuales} today={today} />
          </>
        )}
      </div>

      {/* The venue ask and the visitor ask side by side from lg up, touching,
          same height and type scale — two faces of one coin (Daniel,
          2026-10-13); stacked on smaller screens. */}
      <div className="mt-[48px] md:mt-[80px] mb-[48px] md:mb-[80px] grid grid-cols-1 lg:grid-cols-2 items-stretch">
        <EspaciosSection />
        <NewsletterSection adminRegionName={adminRegionName} />
      </div>

      <Footer onContactClick={openContactDrawer} />

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
