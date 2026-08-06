"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { esCL } from "@/i18n/es-CL";
import { buildRegionMetaByCityId, citiesWithEvents, groupCitiesByRegion, matchesQuery, cityById, cityIdFromRegionName, OTHER_CITY, type City } from "@/lib/cities";
import { shortRegionName } from "@/lib/regionNames";
import { ZONES, zoneKeyForRegion, zoneByKey, type ZoneKey } from "@/lib/zones";
import { getRecentCityIds, setCookie, PRECISE_CITY_COOKIE } from "@/lib/cookies";
import { requestPreciseCityId } from "@/lib/geolocation";
import { sumCounts, type CityCounts, type RegionMeta } from "@/lib/events";

interface CityPickerPanelProps {
  open: boolean;
  cityId: string; // the currently CONFIRMED city
  actualCityId: string | null; // geolocated comuna — feeds "Tu ubicación actual"; null when there's no real geo signal
  hasPreciseLocation: boolean; // true once a real geolocation reading is already known — hides the "usar ubicación exacta" prompt
  cityCounts: Record<string, CityCounts>;
  cityNames: Record<string, string>;
  regions: RegionMeta[];
  onClose: () => void;
  // Clicking a comuna (anywhere — step 3, search results, or a bottom
  // shortcut) commits and navigates immediately, same instant pattern the
  // rest of the app already uses — confirmed with the user 2026-08-04,
  // no separate "confirm" step despite the Figma mock showing a
  // CONFIRMAR SELECCIÓN button.
  onSelectCity: (cityId: string) => void;
}

const ZERO_COUNTS: CityCounts = { inauguraciones: 0, exposActuales: 0 };
const SEARCH_DEBOUNCE_MS = 200;
const MAX_RECENT_SHORTCUTS = 2;

type Step = "zona" | "region" | "comuna";

function countsFor(cities: City[], cityCounts: Record<string, CityCounts>): CityCounts {
  return sumCounts(cities.map((c) => cityCounts[c.id] ?? ZERO_COUNTS));
}

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

// A single selectable row shared by the zona/región/comuna steps and
// search results — bordered + normal weight by default, filled dark with
// bigger/bolder text when it's the visitor's own current comuna's zona/
// región/comuna (same "you are here" treatment Figma uses for CENTRAL /
// SANTIAGO / PROVIDENCIA across the three mocks).
function OptionRow({
  label,
  counts,
  showChevron,
  current,
  disabled = false,
  onClick,
}: {
  label: string;
  counts?: CityCounts;
  showChevron: boolean;
  current: boolean;
  // Zonas only, for now (2026-08-06) — a zone with nothing this week
  // stays visible but unselectable, rather than disappearing like an
  // empty región/comuna does. Removing a whole zone from the map would
  // read as "this part of Chile doesn't exist," not "nothing here right
  // now" — the distinction régiones/comunas don't need since there are
  // dozens of them and losing one from a list reads as pruning, not
  // erasure.
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-between gap-[12px] p-[16px] rounded-input text-left ${
        disabled ? "cursor-default opacity-40" : "cursor-pointer"
      } ${current ? "bg-text-primary" : "border border-border-default"}`}
    >
      <span
        className={`font-lato whitespace-nowrap ${current ? "font-extrabold text-[22px] text-surface-sage-dark" : "font-bold text-[16px] text-text-primary"}`}
      >
        {label}
      </span>
      <div className="flex items-center gap-[16px] shrink-0">
        {counts && <Badges counts={counts} />}
        {showChevron && !disabled && (
          // eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision
          <img src={current ? "/icons/chevron-right-selected.svg" : "/icons/chevron-right-default.svg"} alt="" width={16} height={16} />
        )}
      </div>
    </button>
  );
}

// Compact, border-only shortcut row — "Tu ubicación actual"/"Últimas
// visitadas" always use this style (never the dark "current" fill
// OptionRow uses), since they sit outside the zona/región/comuna
// drill-down as instant shortcuts, not part of the step being browsed.
function ShortcutRow({ city, counts, onClick }: { city: City; counts: CityCounts; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-[12px] border border-text-primary rounded-input px-[10px] py-[10px] text-left cursor-pointer"
    >
      <span className="font-lato text-[14px] text-text-primary whitespace-nowrap">{city.name.toUpperCase()}</span>
      <Badges counts={counts} />
    </button>
  );
}

// Rediseño 2.0.0 — location selector rebuilt as a 3-step wizard (Zona ->
// Región -> Comuna: caldearte-web-selector-paso-{1,2,3}-v2.0.0),
// replacing the old single-panel collapsible país/región/comuna tree.
// Chile-only for now — a second real country would need its own zona
// scheme (or none), not worth generalizing before there's real data for
// one (see zones.ts's own comment). Desktop-only pixel values for now;
// mobile mocks weren't selected yet, so small screens get a simple
// stacked fallback rather than a second pixel-matched layout.
export default function CityPickerPanel({
  open,
  cityId,
  actualCityId,
  hasPreciseLocation,
  cityCounts,
  cityNames,
  regions,
  onClose,
  onSelectCity,
}: CityPickerPanelProps) {
  const [step, setStep] = useState<Step>("zona");
  const [selectedZoneKey, setSelectedZoneKey] = useState<ZoneKey | null>(null);
  const [selectedRegionName, setSelectedRegionName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [recentCityIds, setRecentCityIds] = useState<string[]>([]);
  const [locatingState, setLocatingState] = useState<"idle" | "locating" | "error">("idle");
  // Same-session freshening of actualCityId, display-only — see
  // GeoLocationChangedBanner's own silent re-check for the durable half.
  const [freshActualCityId, setFreshActualCityId] = useState(actualCityId);
  const router = useRouter();

  const metaByCityId = useMemo(() => buildRegionMetaByCityId(regions), [regions]);

  // Resets to the wizard's first step + clears search whenever the panel
  // transitions to open — adjusting state during render (React's own
  // documented pattern for this), not an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep("zona");
      setSelectedZoneKey(null);
      setSelectedRegionName(null);
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
      setRecentCityIds(getRecentCityIds());
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

  // Zonas always stay visible (unlike regiones/comunas, which disappear
  // entirely when empty) — just disabled when none of their regiones have
  // anything this week. Computed from the full `regions` list, not
  // `allCities`, since a zone needs to know about every comuna it could
  // ever contain, not just the ones currently passing citiesWithEvents'
  // own filter.
  const zonesWithEvents = useMemo(() => {
    const withEvents = new Set<ZoneKey>();
    for (const region of regions) {
      if (!region.adminRegionName) continue;
      const zoneKey = zoneKeyForRegion(region.adminRegionName);
      if (!zoneKey || withEvents.has(zoneKey)) continue;
      const counts = cityCounts[cityIdFromRegionName(region.name)];
      if ((counts?.inauguraciones ?? 0) > 0 || (counts?.exposActuales ?? 0) > 0) withEvents.add(zoneKey);
    }
    return withEvents;
  }, [regions, cityCounts]);

  const trimmedQuery = filterQuery.trim();
  const isSearching = trimmedQuery !== "";

  // Search is a flat comuna shortcut, not part of the step flow — same
  // instant pattern as the bottom shortcuts. Clarified with the user
  // 2026-08-04: cards here are comunas (styled like step 3's rows), not
  // events.
  const searchResults = useMemo(() => {
    if (!trimmedQuery) return [];
    return allCities.filter((c) => {
      if (matchesQuery(c.name, trimmedQuery)) return true;
      const adminRegionName = metaByCityId.get(c.id)?.adminRegionName;
      return adminRegionName ? matchesQuery(adminRegionName, trimmedQuery) : false;
    });
  }, [allCities, trimmedQuery, metaByCityId]);

  const chileRegions = useMemo(() => groupCitiesByRegion(allCities, metaByCityId)[0]?.regions ?? [], [allCities, metaByCityId]);

  const currentMeta = metaByCityId.get(cityId);
  const currentZoneKey = currentMeta?.adminRegionName ? zoneKeyForRegion(currentMeta.adminRegionName) : null;

  const regionsInSelectedZone = useMemo(
    () => (selectedZoneKey ? chileRegions.filter((r) => zoneKeyForRegion(r.adminRegionName) === selectedZoneKey) : []),
    [chileRegions, selectedZoneKey],
  );

  const selectedRegionGroup = useMemo(
    () => chileRegions.find((r) => r.adminRegionName === selectedRegionName) ?? null,
    [chileRegions, selectedRegionName],
  );

  const currentLocationCity: City | null =
    !isSearching && freshActualCityId && freshActualCityId !== cityId && freshActualCityId !== OTHER_CITY.id
      ? cityById(freshActualCityId, cityNames)
      : null;
  const recentCities: City[] = useMemo(
    () =>
      isSearching
        ? []
        : recentCityIds
            .filter((id) => id !== cityId && id !== freshActualCityId && id !== OTHER_CITY.id)
            .slice(0, MAX_RECENT_SHORTCUTS)
            .map((id) => cityById(id, cityNames)),
    [isSearching, recentCityIds, cityId, freshActualCityId, cityNames],
  );

  function selectCity(id: string) {
    onSelectCity(id);
  }

  function handleBack() {
    if (step === "comuna") setStep("region");
    else if (step === "region") setStep("zona");
    else onClose();
  }

  function handleZoneClick(key: ZoneKey) {
    setSelectedZoneKey(key);
    setStep("region");
  }

  function handleRegionClick(adminRegionName: string) {
    setSelectedRegionName(adminRegionName);
    setStep("comuna");
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

  const zoneLabel = selectedZoneKey ? zoneByKey(selectedZoneKey).label : "";
  const regionShortName = selectedRegionName ? shortRegionName(selectedRegionName) : "";

  // Desktop only — mobile shows just the back arrow, no breadcrumb text
  // (per the user 2026-08-04).
  const breadcrumbDesktop =
    step === "comuna" && selectedZoneKey
      ? esCL.citySelector.zonaRegionBreadcrumb(zoneLabel, regionShortName)
      : step === "region" && selectedZoneKey
        ? esCL.citySelector.zonaBreadcrumb(zoneLabel)
        : null;

  const headingLines =
    step === "zona"
      ? esCL.citySelector.eligeZonaLines
      : step === "region"
        ? esCL.citySelector.eligeRegionLines
        : esCL.citySelector.eligeComunaLines;
  const stepNumber = step === "zona" ? 1 : step === "region" ? 2 : 3;

  // Tied to the visitor's own current región (the one shown highlighted
  // in the step-2 list), not `selectedRegionName` — that navigation state
  // only gets set once a región is actually clicked (advancing to step
  // 3), so it's never set while step 2 itself is still on screen.
  const currentRegionShownHere = regionsInSelectedZone.some((r) => r.adminRegionName === currentMeta?.adminRegionName);
  const regionFact = step === "region" && currentRegionShownHere && currentMeta?.adminRegionName ? esCL.regionFacts[currentMeta.adminRegionName] : undefined;

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
          <div className="flex items-center gap-[20px]">
            <button
              type="button"
              onClick={handleBack}
              aria-label={step === "zona" ? esCL.closeCityPicker : esCL.citySelector.back}
              className="cursor-pointer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img src="/icons/selector-back-arrow.svg" alt="" width={140} height={19} />
            </button>
            {/* Desktop only, per the user 2026-08-04: mobile shows just the
                back arrow, no breadcrumb text. */}
            {breadcrumbDesktop && (
              <button
                type="button"
                onClick={handleBack}
                className="hidden md:block font-lato font-semibold text-[20px] text-brand-magenta whitespace-nowrap cursor-pointer"
              >
                {breadcrumbDesktop}
              </button>
            )}
          </div>
          <p className="font-lato text-[40px] md:text-[64px] text-brand-magenta whitespace-nowrap">{esCL.citySelector.country.toUpperCase()}</p>
        </div>

        <div className="flex-1 flex flex-col md:flex-row md:items-start gap-[40px] md:gap-[120px]">
          <div className="flex flex-col gap-[10px] shrink-0">
            <h1 className="font-lato font-extrabold leading-none text-brand-magenta text-[56px] md:text-[96px]">
              {headingLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h1>
            <p className="font-fragment-mono font-bold text-[14px] text-brand-magenta">{esCL.citySelector.stepLabel(stepNumber)}</p>
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
                  searchResults.map((c) => (
                    <OptionRow
                      key={c.id}
                      label={c.name.toUpperCase()}
                      counts={cityCounts[c.id] ?? ZERO_COUNTS}
                      showChevron={false}
                      current={c.id === cityId}
                      onClick={() => selectCity(c.id)}
                    />
                  ))
                )}
              </div>
            ) : step === "zona" ? (
              <div className="flex flex-col gap-[8px]">
                <p className="font-fragment-mono font-bold text-[14px] text-text-primary">{esCL.citySelector.zonasLabel}</p>
                {ZONES.map((zone) => (
                  <OptionRow
                    key={zone.key}
                    label={zone.label.toUpperCase()}
                    showChevron
                    current={zone.key === currentZoneKey}
                    disabled={!zonesWithEvents.has(zone.key)}
                    onClick={() => handleZoneClick(zone.key)}
                  />
                ))}
              </div>
            ) : step === "region" ? (
              <div className="flex flex-col gap-[8px]">
                <p className="font-fragment-mono font-bold text-[14px] text-text-primary">{esCL.citySelector.regionesEnZona(zoneLabel)}</p>
                {regionsInSelectedZone.map((region) => (
                  <OptionRow
                    key={region.adminRegionName}
                    label={shortRegionName(region.adminRegionName).toUpperCase()}
                    counts={countsFor(region.cities, cityCounts)}
                    showChevron
                    current={region.adminRegionName === currentMeta?.adminRegionName}
                    onClick={() => handleRegionClick(region.adminRegionName)}
                  />
                ))}
                {regionFact && (
                  <div className="bg-[#ebedee] border-l-4 border-brand-magenta rounded-[8px] p-[16px] flex flex-col gap-[10px] mt-[8px]">
                    <p className="font-fragment-mono font-bold text-[12px] text-brand-magenta">{esCL.citySelector.sabiasQue}</p>
                    <p className="font-geist text-[13px] text-text-primary">{regionFact}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-[8px]">
                <p className="font-fragment-mono font-bold text-[14px] text-text-primary">
                  {esCL.citySelector.comunasDe(selectedRegionGroup ? shortRegionName(selectedRegionGroup.adminRegionName) : "")}
                </p>
                {/* Scrollable so every comuna fits, per the user's explicit
                    request 2026-08-04 (Región Metropolitana alone has far
                    more comunas than fit in one screen). */}
                <div className="md:border md:border-text-primary md:p-[8px] flex flex-col gap-[4px] max-h-[400px] overflow-y-auto">
                  {(selectedRegionGroup?.cities ?? []).map((city) => (
                    <OptionRow
                      key={city.id}
                      label={city.name.toUpperCase()}
                      counts={cityCounts[city.id] ?? ZERO_COUNTS}
                      showChevron={false}
                      current={city.id === cityId}
                      onClick={() => selectCity(city.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {!isSearching && (currentLocationCity || recentCities.length > 0) && (
          <div className="mt-[60px] flex flex-col md:flex-row gap-[24px] md:gap-[80px]">
            {currentLocationCity && (
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
                  city={currentLocationCity}
                  counts={cityCounts[currentLocationCity.id] ?? ZERO_COUNTS}
                  onClick={() => selectCity(currentLocationCity.id)}
                />
                {locatingState === "error" && <p className="text-[10px] text-red-600">{esCL.cityPickerExactLocationError}</p>}
              </div>
            )}
            {recentCities.length > 0 && (
              <div className="flex flex-col gap-[6px] flex-1">
                <p className="font-fragment-mono font-bold text-[10px] text-text-muted whitespace-nowrap">
                  {esCL.cityPickerRecentlyVisited.toUpperCase()}
                </p>
                <div className="flex flex-col md:flex-row gap-[8px]">
                  {recentCities.map((c) => (
                    <div key={c.id} className="md:w-[258px]">
                      <ShortcutRow city={c} counts={cityCounts[c.id] ?? ZERO_COUNTS} onClick={() => selectCity(c.id)} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
