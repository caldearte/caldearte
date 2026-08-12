"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { esCL } from "@/i18n/es-CL";
import {
  buildRegionMetaByCityId,
  citiesWithEvents,
  matchesQuery,
  allAdminRegions,
  adminRegionNameByRegionId,
  regionIdFromAdminRegionName,
  countByRegion,
  type AdminRegion,
} from "@/lib/cities";
import { shortRegionName } from "@/lib/regionNames";
import { getRecentRegionIds, setCookie, PRECISE_CITY_COOKIE } from "@/lib/cookies";
import { requestPreciseCityId } from "@/lib/geolocation";
import { type CityCounts, type RegionMeta } from "@/lib/events";

interface CityPickerPanelProps {
  open: boolean;
  regionId: string; // the currently CONFIRMED región
  // Geolocated COMUNA — región selection is derived from it (its own
  // admin región), same as everywhere else in the app. null when there's
  // no real geo signal at all.
  actualCityId: string | null;
  hasPreciseLocation: boolean; // true once a real geolocation reading is already known — hides the "usar ubicación exacta" prompt
  cityCounts: Record<string, CityCounts>;
  cityNames: Record<string, string>;
  regions: RegionMeta[];
  onClose: () => void;
  // Clicking a región (the list, a search result, or a bottom shortcut)
  // commits and navigates immediately, same instant pattern the rest of
  // the app already uses — confirmed with the user 2026-08-04, no
  // separate "confirm" step despite the Figma mock showing a CONFIRMAR
  // SELECCIÓN button.
  onSelectRegion: (regionId: string) => void;
}

const ZERO_COUNTS: CityCounts = { inauguraciones: 0, exposActuales: 0 };
const SEARCH_DEBOUNCE_MS = 200;
const MAX_RECENT_SHORTCUTS = 2;

// Magenta "N inaug" + dark "N expos", each only shown when > 0 — same
// badge pair used throughout the redesign's cards.
function Badges({ counts }: { counts: CityCounts }) {
  if (counts.inauguraciones === 0 && counts.exposActuales === 0) return null;
  return (
    <div className="flex gap-[6px] items-center shrink-0">
      {counts.inauguraciones > 0 && (
        <span className="bg-brand-magenta text-white font-fragment-mono font-bold text-[10px] rounded-badge px-[8px] py-[4px] whitespace-nowrap">
          {counts.inauguraciones} inaug
        </span>
      )}
      {counts.exposActuales > 0 && (
        <span className="bg-text-primary text-surface-sage font-fragment-mono font-bold text-[10px] rounded-badge px-[8px] py-[4px] whitespace-nowrap">
          {counts.exposActuales} expos
        </span>
      )}
    </div>
  );
}

// A single selectable row — bordered + normal weight by default, filled
// dark with bigger/bolder text when it's the visitor's own current región
// (same "you are here" treatment Figma uses).
function OptionRow({
  label,
  counts,
  current,
  onClick,
}: {
  label: string;
  counts?: CityCounts;
  current: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-[12px] p-[16px] rounded-input text-left cursor-pointer ${
        current ? "bg-text-primary" : "border border-border-default"
      }`}
    >
      <span
        className={`font-lato whitespace-nowrap ${current ? "font-extrabold text-[22px] text-surface-sage-dark" : "font-bold text-[16px] text-text-primary"}`}
      >
        {label}
      </span>
      {counts && <Badges counts={counts} />}
    </button>
  );
}

// Compact, border-only shortcut row — "Tu ubicación actual"/"Últimas
// visitadas" always use this style (never the dark "current" fill
// OptionRow uses), since they sit outside the región list as instant
// shortcuts, not part of the list being browsed.
function ShortcutRow({ label, counts, onClick }: { label: string; counts: CityCounts; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-[12px] border border-text-primary rounded-input px-[10px] py-[10px] text-left cursor-pointer"
    >
      <span className="font-lato text-[14px] text-text-primary whitespace-nowrap">{label}</span>
      <Badges counts={counts} />
    </button>
  );
}

// Rediseño 2.0.0 — location selector, single step (2026-08-12: simplified
// from a 3-step Zona -> Región -> Comuna wizard down to one flat,
// scrollable list of Chile's 16 real regions — selecting a región IS the
// whole flow now, no comuna drill-down). Selection everywhere in the app
// now operates at región granularity (see cities.ts's own "Región-level
// selection" section) — a comuna's own name still shows next to each
// event's venue (useEventCardActions.ts's cityName), just not as the
// thing being picked here. Search still matches comuna names too (typing
// "Vitacura" finds and selects Región Metropolitana), per the user's own
// confirmed choice 2026-08-12. Chile-only for now — a second real country
// isn't in scope yet. Desktop-only pixel values for now; mobile mocks
// weren't selected yet, so small screens get a simple stacked fallback
// rather than a second pixel-matched layout.
export default function CityPickerPanel({
  open,
  regionId,
  actualCityId,
  hasPreciseLocation,
  cityCounts,
  cityNames,
  regions,
  onClose,
  onSelectRegion,
}: CityPickerPanelProps) {
  const [query, setQuery] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [recentRegionIds, setRecentRegionIds] = useState<string[]>([]);
  const [locatingState, setLocatingState] = useState<"idle" | "locating" | "error">("idle");
  // Same-session freshening of actualCityId, display-only — see
  // GeoLocationChangedBanner's own silent re-check for the durable half.
  const [freshActualCityId, setFreshActualCityId] = useState(actualCityId);
  const router = useRouter();

  const metaByCityId = useMemo(() => buildRegionMetaByCityId(regions), [regions]);
  const regionCounts = useMemo(() => countByRegion(cityCounts, regions), [cityCounts, regions]);
  const regionNameById = useMemo(() => adminRegionNameByRegionId(regions), [regions]);
  const chileRegions = useMemo(() => allAdminRegions(regions), [regions]);

  // Resets search + geo-freshening whenever the panel transitions to
  // open — adjusting state during render (React's own documented pattern
  // for this), not an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setFilterQuery("");
      setLocatingState("idle");
      setFreshActualCityId(actualCityId);
      if (hasPreciseLocation) {
        requestPreciseCityId(regions, (id) => {
          setFreshActualCityId(id);
          setCookie(PRECISE_CITY_COOKIE, id);
        });
      }
      setRecentRegionIds(getRecentRegionIds());
    }
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // A document-level listener, not the dialog's own onKeyDown — Escape
  // needs to close this regardless of which element currently has DOM
  // focus. React's onKeyDown only fires for events that bubble up FROM
  // whatever's focused, and nothing here moves focus into the dialog on
  // open, so a keydown fired while focus is still on the trigger button
  // (outside the dialog) never reached the old per-element handler — real
  // bug found 2026-08-04.
  useEffect(() => {
    if (!open) return;
    function onDocumentKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    const timer = setTimeout(() => setFilterQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const allCities = useMemo(() => citiesWithEvents(cityCounts, cityNames), [cityCounts, cityNames]);

  const trimmedQuery = filterQuery.trim();
  const isSearching = trimmedQuery !== "";

  // Matches a región's own name directly, OR any comuna's name (resolved
  // up to its parent región) — confirmed with the user 2026-08-12:
  // typing "Vitacura" should still find and select Región Metropolitana.
  const searchResults = useMemo(() => {
    if (!trimmedQuery) return [];
    const matched = new Map<string, AdminRegion>();
    for (const region of chileRegions) {
      if (matchesQuery(region.adminRegionName, trimmedQuery)) {
        matched.set(regionIdFromAdminRegionName(region.adminRegionName), region);
      }
    }
    for (const city of allCities) {
      if (!matchesQuery(city.name, trimmedQuery)) continue;
      const adminRegionName = metaByCityId.get(city.id)?.adminRegionName;
      if (!adminRegionName) continue;
      const rid = regionIdFromAdminRegionName(adminRegionName);
      if (matched.has(rid)) continue;
      const region = chileRegions.find((r) => r.adminRegionName === adminRegionName);
      if (region) matched.set(rid, region);
    }
    return [...matched.values()].sort((a, b) => a.adminRegionOrder - b.adminRegionOrder);
  }, [trimmedQuery, chileRegions, allCities, metaByCityId]);

  const currentAdminRegionName = regionNameById.get(regionId) ?? null;

  const actualAdminRegionName = freshActualCityId ? (metaByCityId.get(freshActualCityId)?.adminRegionName ?? null) : null;
  const actualRegionId = actualAdminRegionName ? regionIdFromAdminRegionName(actualAdminRegionName) : null;
  const currentLocationRegion: AdminRegion | null =
    !isSearching && actualRegionId && actualRegionId !== regionId
      ? (chileRegions.find((r) => regionIdFromAdminRegionName(r.adminRegionName) === actualRegionId) ?? null)
      : null;

  const recentRegions: AdminRegion[] = useMemo(
    () =>
      isSearching
        ? []
        : recentRegionIds
            .filter((id) => id !== regionId && id !== actualRegionId)
            .slice(0, MAX_RECENT_SHORTCUTS)
            .map((id) => chileRegions.find((r) => regionIdFromAdminRegionName(r.adminRegionName) === id))
            .filter((r): r is AdminRegion => r !== undefined),
    [isSearching, recentRegionIds, regionId, actualRegionId, chileRegions],
  );

  function selectRegion(id: string) {
    onSelectRegion(id);
  }

  // Opt-in only — never called automatically. A denial or lack of support
  // is a normal, expected outcome, not an error to alarm over.
  function handleUseExactLocation() {
    setLocatingState("locating");
    requestPreciseCityId(
      regions,
      (id) => {
        setCookie(PRECISE_CITY_COOKIE, id);
        setFreshActualCityId(id);
        setLocatingState("idle");
        router.refresh();
      },
      () => setLocatingState("error"),
    );
  }

  const regionFact = !isSearching && currentAdminRegionName ? esCL.regionFacts[currentAdminRegionName] : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={esCL.cityPickerAriaLabel}
      // `inert` (not just visual hiding) pulls the whole modal out of the
      // tab order and accessibility tree while closed.
      inert={!open}
      className={`fixed inset-0 z-40 bg-surface-sage overflow-y-auto transition-opacity duration-150 ${
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="max-w-[1160px] mx-auto px-5 md:px-0 py-[40px] md:py-[60px] min-h-full flex flex-col">
        <div className="flex items-center justify-between mb-[40px] md:mb-[60px]">
          <button type="button" onClick={onClose} aria-label={esCL.closeCityPicker} className="cursor-pointer">
            {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
            <img src="/icons/selector-back-arrow.svg" alt="" width={140} height={19} />
          </button>
          <p className="font-lato text-[40px] md:text-[64px] text-brand-magenta whitespace-nowrap">{esCL.citySelector.country.toUpperCase()}</p>
        </div>

        <div className="flex-1 flex flex-col md:flex-row md:items-start gap-[40px] md:gap-[120px]">
          <div className="flex flex-col gap-[10px] shrink-0">
            <h1 className="font-lato font-extrabold leading-none text-brand-magenta text-[56px] md:text-[96px]">
              {esCL.citySelector.eligeRegionLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h1>
          </div>

          <div className="w-full md:w-[319px] flex flex-col gap-[16px]">
            <div className="relative">
              <input
                type="text"
                role="searchbox"
                aria-label={esCL.citySearchAriaLabel}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={esCL.citySearchPlaceholder}
                className="w-full bg-surface-white rounded-input pl-[46px] pr-[16px] py-[16px] font-geist text-[16px] text-text-primary placeholder:text-icon-default focus:outline-none"
              />
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img src="/icons/selector-search.svg" alt="" width={18} height={18} className="absolute left-[16px] top-1/2 -translate-y-1/2" />
            </div>

            {isSearching ? (
              <div className="flex flex-col gap-[8px]">
                {searchResults.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-6">{esCL.noCityResults}</p>
                ) : (
                  searchResults.map((region) => {
                    const rid = regionIdFromAdminRegionName(region.adminRegionName);
                    return (
                      <OptionRow
                        key={rid}
                        label={shortRegionName(region.adminRegionName).toUpperCase()}
                        counts={regionCounts[rid] ?? ZERO_COUNTS}
                        current={rid === regionId}
                        onClick={() => selectRegion(rid)}
                      />
                    );
                  })
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-[8px]">
                <p className="font-fragment-mono font-bold text-[14px] text-text-primary">{esCL.citySelector.regionsLabel}</p>
                {/* Scrollable so every región fits — same pattern the old
                    step-3 comuna list used, per the user's explicit
                    request 2026-08-04/2026-08-12 (16 regiones don't all
                    fit on one mobile screen). */}
                <div className="md:border md:border-text-primary md:p-[8px] flex flex-col gap-[4px] max-h-[400px] overflow-y-auto">
                  {chileRegions.map((region) => {
                    const rid = regionIdFromAdminRegionName(region.adminRegionName);
                    return (
                      <OptionRow
                        key={rid}
                        label={shortRegionName(region.adminRegionName).toUpperCase()}
                        counts={regionCounts[rid] ?? ZERO_COUNTS}
                        current={rid === regionId}
                        onClick={() => selectRegion(rid)}
                      />
                    );
                  })}
                </div>
                {regionFact && (
                  <div className="bg-[#ebedee] border-l-4 border-brand-magenta rounded-[8px] p-[16px] flex flex-col gap-[10px] mt-[8px]">
                    <p className="font-fragment-mono font-bold text-[12px] text-brand-magenta">{esCL.citySelector.sabiasQue}</p>
                    <p className="font-geist text-[13px] text-text-primary">{regionFact}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {!isSearching && (currentLocationRegion || recentRegions.length > 0) && (
          <div className="mt-[60px] flex flex-col md:flex-row gap-[24px] md:gap-[80px]">
            {currentLocationRegion && (
              <div className="flex flex-col gap-[6px] w-full md:w-[258px]">
                <div className="flex items-center justify-between gap-[8px]">
                  <p className="font-fragment-mono font-bold text-[10px] text-text-muted whitespace-nowrap">
                    {esCL.cityPickerCurrentLocation.toUpperCase()}
                  </p>
                  {!hasPreciseLocation && (
                    <button
                      type="button"
                      onClick={handleUseExactLocation}
                      disabled={locatingState === "locating"}
                      className="text-[10px] underline text-text-muted shrink-0 cursor-pointer disabled:cursor-default disabled:opacity-60"
                    >
                      {locatingState === "locating" ? esCL.cityPickerLocatingExact : esCL.cityPickerShareLocationButton}
                    </button>
                  )}
                </div>
                <ShortcutRow
                  label={shortRegionName(currentLocationRegion.adminRegionName).toUpperCase()}
                  counts={regionCounts[regionIdFromAdminRegionName(currentLocationRegion.adminRegionName)] ?? ZERO_COUNTS}
                  onClick={() => selectRegion(regionIdFromAdminRegionName(currentLocationRegion.adminRegionName))}
                />
                {locatingState === "error" && <p className="text-[10px] text-red-600">{esCL.cityPickerExactLocationError}</p>}
              </div>
            )}
            {recentRegions.length > 0 && (
              <div className="flex flex-col gap-[6px] flex-1">
                <p className="font-fragment-mono font-bold text-[10px] text-text-muted whitespace-nowrap">
                  {esCL.cityPickerRecentlyVisited.toUpperCase()}
                </p>
                <div className="flex flex-col md:flex-row gap-[8px]">
                  {recentRegions.map((r) => {
                    const rid = regionIdFromAdminRegionName(r.adminRegionName);
                    return (
                      <div key={rid} className="md:w-[258px]">
                        <ShortcutRow label={shortRegionName(r.adminRegionName).toUpperCase()} counts={regionCounts[rid] ?? ZERO_COUNTS} onClick={() => selectRegion(rid)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
