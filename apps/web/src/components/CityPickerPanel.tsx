"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { esCL } from "@/i18n/es-CL";
import {
  buildRegionMetaByCityId,
  citiesWithEvents,
  groupCitiesByRegion,
  matchesQuery,
  cityById,
  OTHER_CITY,
  type City,
  type CountryGroup,
} from "@/lib/cities";
import { getRecentCityIds, setCookie, PRECISE_CITY_COOKIE } from "@/lib/cookies";
import { requestPreciseCityId } from "@/lib/geolocation";
import { sumCounts, type CityCounts, type RegionMeta, type WindowMode } from "@/lib/events";

interface CityPickerPanelProps {
  open: boolean;
  cityId: string; // the CONFIRMED city — seeds pendingCityId whenever the panel opens
  actualCityId: string | null; // geolocated comuna (page.tsx, already prefers a real granted reading over the coarse IP estimate) — feeds the "Tu ubicación actual" quick-pick row; null when there's no real geo signal
  hasPreciseLocation: boolean; // true once a real geolocation reading is already known — hides "Usar mi ubicación exacta" (redundant to ask again)
  cityCountsDay: Record<string, CityCounts>;
  cityCountsWeek: Record<string, CityCounts>;
  cityNames: Record<string, string>;
  regions: RegionMeta[];
  windowMode: WindowMode; // the CONFIRMED mode — seeds pendingWindowMode whenever the panel opens
  onClose: () => void;
  onExplore: (cityId: string, windowMode: WindowMode) => void;
}

// Purely local selection — does NOT close the panel or touch cookies.
// Both this and picking a city are "pending" until Explorar commits them
// together; closing via the X/Escape discards whatever was picked here.
function WindowModeToggle({ mode, onSelect }: { mode: WindowMode; onSelect: (mode: WindowMode) => void }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={() => onSelect("day")}
        className={`text-sm rounded-full px-4 py-1.5 transition-colors ${
          mode === "day" ? "bg-heading-gray text-white" : "bg-picker-subtle text-muted-gray"
        }`}
      >
        {esCL.windowModeDay}
      </button>
      <button
        onClick={() => onSelect("week")}
        className={`text-sm rounded-full px-4 py-1.5 transition-colors ${
          mode === "week" ? "bg-heading-gray text-white" : "bg-picker-subtle text-muted-gray"
        }`}
      >
        {esCL.windowModeWeek}
      </button>
    </div>
  );
}

const ZERO_COUNTS: CityCounts = { inauguraciones: 0, exposActuales: 0 };
const SEARCH_DEBOUNCE_MS = 200;

function countsFor(cities: City[], cityCounts: Record<string, CityCounts>): CityCounts {
  return sumCounts(cities.map((c) => cityCounts[c.id] ?? ZERO_COUNTS));
}

// Regions are grouped first by país (see cities.ts), so a región's key
// needs the país in it too — otherwise a same-named región in a future
// second country would collide with Chile's.
function regionKey(country: string, adminRegionName: string): string {
  return `${country}::${adminRegionName}`;
}

// The "Chile" country header is collapsible too, same chevron as a región
// row — real gap found 2026-07-29: the user's original ask was "tu
// ubicación, últimas visitadas, Chile como hermanas... todas con chevron
// de colapsables", and the first pass only made the two quick-picks and
// the individual regiones collapsible, missing the country level itself.
function countryKey(country: string): string {
  return `country::${country}`;
}

function cityOptionId(cityId: string): string {
  return `city-option-${cityId}`;
}

function regionOptionId(key: string): string {
  return `region-option-${key}`;
}

// Quick-pick sections (below) are collapsible siblings of the "Chile"
// group, not a separate widget — same expand/collapse machinery
// (expandedRegions/toggleRegion/isRegionExpanded) via these two keys, in
// their own "quickpick::" namespace so they can never collide with a real
// región's `regionKey`.
const CURRENT_LOCATION_KEY = "quickpick::current-location";
const RECENT_CITIES_KEY = "quickpick::recent";

type NavEntry = { type: "region"; key: string } | { type: "city"; city: City };

interface CityRowProps {
  city: City;
  counts: CityCounts;
  selected: boolean;
  active: boolean;
  onSelect: (city: City) => void;
  onHover: () => void;
}

function CityRow({ city, counts, selected, active, onSelect, onHover }: CityRowProps) {
  return (
    <button
      id={cityOptionId(city.id)}
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(city)}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-2 pl-[52px] pr-3 py-2.5 rounded-lg text-left transition-colors ${
        selected ? "bg-heading-gray" : active ? "bg-stone-100" : "hover:bg-stone-50"
      }`}
    >
      <span className={`flex-grow text-sm ${selected ? "font-semibold text-white" : "text-heading-gray"}`}>{city.name}</span>
      {counts.exposActuales > 0 && (
        <span
          className={`text-[11px] font-medium rounded px-2 py-0.5 shrink-0 ${
            selected ? "bg-white/15 text-white" : "bg-picker-subtle text-muted-gray"
          }`}
        >
          {counts.exposActuales} expos
        </span>
      )}
      {counts.inauguraciones > 0 && (
        <span
          className={`text-[11px] font-medium rounded px-2 py-0.5 shrink-0 ${
            selected ? "bg-white/15 text-white" : "bg-picker-badge-inaug-bg text-picker-badge-inaug-fg"
          }`}
        >
          {counts.inauguraciones} inaug
        </span>
      )}
    </button>
  );
}

// Same stroke-based style as the existing card icons (EventCardBase.tsx's
// DirectionsGlyph et al.): 16x16, viewBox 24, currentColor, round caps —
// so these read as part of the same icon family, not a one-off import.
function LocationPinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M12 21s7-6.13 7-11.5A7 7 0 0 0 5 9.5C5 14.87 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.25" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// Clock-with-backwards-arrow "history" glyph — same convention Google
// Maps/most apps use for "recent" lists, distinct from a plain clock so it
// doesn't read as an opening-time indicator (already used elsewhere in
// the app for that).
function RecentHistoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M3 11a9 9 0 1 1 2.6 6.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 5v5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8v4.5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A collapsible section header — used both for a real admin región (with
// its roman-numeral badge) and for the two quick-pick sections above the
// región list (with a small icon instead — a location pin / history glyph
// — so they read as shortcuts rather than a third geographic level). One
// shared component so both look and behave identically: same chevron,
// same expand/collapse click target, same keyboard-nav row.
interface SectionRowProps {
  title: string;
  numeral?: string | null;
  icon?: ReactNode;
  navKey: string;
  expanded: boolean;
  active: boolean;
  totalCount: number;
  onToggle: () => void;
  onHover: () => void;
}

function SectionRow({ title, numeral, icon, navKey, expanded, active, totalCount, onToggle, onHover }: SectionRowProps) {
  return (
    <button
      id={regionOptionId(navKey)}
      aria-expanded={expanded}
      onClick={onToggle}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-2.5 px-3 py-3.5 text-left rounded-lg transition-colors ${
        active ? "bg-stone-100" : "hover:bg-stone-50"
      }`}
    >
      <span className="text-[11px] text-picker-placeholder w-3 shrink-0">{expanded ? "▾" : "▸"}</span>
      {numeral && (
        <span className="text-[10px] font-semibold text-muted-gray bg-picker-subtle rounded px-1.5 py-0.5 shrink-0">{numeral}</span>
      )}
      {icon && <span className="text-muted-gray shrink-0">{icon}</span>}
      <span className="flex-grow text-sm font-medium text-heading-gray">{title}</span>
      <span className="text-[13px] text-picker-placeholder">{totalCount}</span>
    </button>
  );
}

export default function CityPickerPanel({
  open,
  cityId,
  actualCityId,
  hasPreciseLocation,
  cityCountsDay,
  cityCountsWeek,
  cityNames,
  regions,
  windowMode,
  onClose,
  onExplore,
}: CityPickerPanelProps) {
  const [query, setQuery] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [pendingCityId, setPendingCityId] = useState(cityId);
  const [pendingWindowMode, setPendingWindowMode] = useState(windowMode);
  const [recentCityIds, setRecentCityIds] = useState<string[]>([]);
  const [locatingState, setLocatingState] = useState<"idle" | "locating" | "error">("idle");
  // A same-session freshening of `actualCityId`, scoped to display only —
  // never persisted itself (the silent check below does that via the
  // cookie, same as GeoLocationChangedBanner). Real ask 2026-07-30: "si
  // consultamos la ubicación silenciosamente si abre el selector para
  // reflejar correctamente la comuna de mi ubicación actual" — opening the
  // picker should show the truth even if the visitor moved since the
  // server last rendered, without waiting for a full page reload.
  const [freshActualCityId, setFreshActualCityId] = useState(actualCityId);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const exploreButtonRef = useRef<HTMLButtonElement>(null);
  // Real bug found 2026-07-29: every row previously scrolled itself into
  // view via an inline callback ref whenever it was "active" — but that ref
  // is a new function identity every render, so React re-invoked it on
  // EVERY render, not just when a row newly became active. Combined with
  // onHover also setting activeIndex, moving the mouse during a manual
  // scroll kept re-triggering scrollIntoView, fighting the user's own
  // scroll ("recalcula y marea con el scroll"). Now scrollIntoView only
  // runs from the effect below, and only after an actual keyboard nav —
  // mouse hover still highlights a row but never yanks the scroll position,
  // since the user's cursor is already right there.
  const isKeyboardNavRef = useRef(false);

  const metaByCityId = useMemo(() => buildRegionMetaByCityId(regions), [regions]);
  const cityCounts = pendingWindowMode === "day" ? cityCountsDay : cityCountsWeek;

  // Reset search + expand state + pending picks whenever the modal
  // transitions to open — computed during render (React's documented
  // pattern for resetting state in response to a prop change), not inside
  // an effect, which would cause an extra cascading render. The
  // currently-CONFIRMED comuna's región starts expanded, everything else
  // starts collapsed; pendingCityId/pendingWindowMode reset to whatever is
  // currently confirmed, discarding any unconfirmed pick from a prior
  // open-then-closed-via-X session.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setFilterQuery("");
      setActiveIndex(0);
      setPendingCityId(cityId);
      setPendingWindowMode(windowMode);
      setLocatingState("idle");
      setFreshActualCityId(actualCityId);
      // Silent — no prompt fires, since hasPreciseLocation only becomes
      // true after a real reading was already granted once. A resolved,
      // different comuna just updates this open's display; the cookie
      // write keeps future renders (and GeoLocationChangedBanner's own
      // comparison) in sync too.
      if (hasPreciseLocation) {
        requestPreciseCityId(regions, (id) => {
          setFreshActualCityId(id);
          setCookie(PRECISE_CITY_COOKIE, id);
        });
      }
      // Read fresh each open, not just once on mount — a visit recorded
      // since the last time this panel was open (e.g. via CityCarousel,
      // which never mounts/opens this panel at all) should still show up.
      setRecentCityIds(getRecentCityIds());
      const selectedMeta = metaByCityId.get(cityId);
      // Quick-pick sections AND every country header start expanded too —
      // collapsing any of them is a manual per-open choice, not a default
      // (see the user's own framing: "todas con chevron de colapsables" —
      // collapsible, not collapsed). Countries come straight from
      // `regions` (not the not-yet-computed `groups`) since there's only
      // ever a handful of them.
      const allCountries = new Set(regions.map((r) => r.country));
      setExpandedRegions(
        new Set([
          CURRENT_LOCATION_KEY,
          RECENT_CITIES_KEY,
          ...[...allCountries].map(countryKey),
          ...(selectedMeta?.adminRegionName ? [regionKey(selectedMeta.country, selectedMeta.adminRegionName)] : []),
        ]),
      );
    }
  }

  // Focusing the DOM input and locking body scroll are real
  // external-system side effects, so they stay in effects (unlike the
  // state resets above).
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Debounced filter: `query` echoes the input instantly (so typing feels
  // immediate), `filterQuery` — what actually drives filtering below —
  // lags 200ms behind the last keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setFilterQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // "Muestra lo que hay", same as before — only comunas with events, plus
  // the pending pick so it never vanishes mid-selection (e.g. it has
  // events in Semanal but not Día, and the user is still toggling around).
  const allCities = useMemo(
    () => citiesWithEvents(cityCounts, cityNames, { alwaysIncludeCityId: pendingCityId }),
    [cityCounts, cityNames, pendingCityId],
  );

  const trimmedQuery = filterQuery.trim();
  const isSearching = trimmedQuery !== "";

  const filteredCities = useMemo(() => {
    if (!trimmedQuery) return allCities;
    return allCities.filter((c) => {
      if (matchesQuery(c.name, trimmedQuery)) return true;
      const adminRegionName = metaByCityId.get(c.id)?.adminRegionName;
      return adminRegionName ? matchesQuery(adminRegionName, trimmedQuery) : false;
    });
  }, [allCities, trimmedQuery, metaByCityId]);

  // A región/país only appears here if it has at least one comuna left
  // after the events + search filters above — no separate pass needed.
  const groups: CountryGroup[] = useMemo(() => groupCitiesByRegion(filteredCities, metaByCityId), [filteredCities, metaByCityId]);

  // Quick-pick sections, listed above the "Chile" group as ordinary
  // collapsible siblings (not sticky/pinned — a sticky version felt wrong
  // in practice, see the user's 2026-07-29 follow-up) — "save the time of
  // finding where you are" (the user's own original framing). Hidden
  // while actively searching: the intent has already shifted to "find a
  // specific place", not "jump back to somewhere familiar", and hiding
  // them sidesteps ever needing to de-duplicate against the filtered
  // results below (a quick-pick city still also appears in its normal
  // alphabetical spot in the full región list — that's fine, same
  // "shortcut + still browsable normally" pattern ride-hailing/delivery
  // apps already use for exactly this).
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
            .map((id) => cityById(id, cityNames)),
    [isSearching, recentCityIds, cityId, freshActualCityId, cityNames],
  );
  const recentCitiesCounts = useMemo(() => countsFor(recentCities, cityCounts), [recentCities, cityCounts]);

  // While actively searching, every región left standing (i.e. containing
  // a match) shows fully expanded regardless of manual toggle state — "si
  // el texto matchea una comuna, mostrar la comuna y su región
  // (expandida)". Clearing the search reverts to whatever the user
  // manually toggled.
  function isRegionExpanded(key: string): boolean {
    return isSearching || expandedRegions.has(key);
  }

  // One flat, display-order list — región rows interleaved with their
  // comunas only when expanded — drives keyboard navigation regardless of
  // how many regions/comunas are actually visible right now.
  const navEntries = useMemo(() => {
    const entries: NavEntry[] = [];
    if (currentLocationCity) {
      entries.push({ type: "region", key: CURRENT_LOCATION_KEY });
      if (isSearching || expandedRegions.has(CURRENT_LOCATION_KEY)) entries.push({ type: "city", city: currentLocationCity });
    }
    if (recentCities.length > 0) {
      entries.push({ type: "region", key: RECENT_CITIES_KEY });
      if (isSearching || expandedRegions.has(RECENT_CITIES_KEY)) {
        for (const city of recentCities) entries.push({ type: "city", city });
      }
    }
    for (const group of groups) {
      const cKey = countryKey(group.country);
      entries.push({ type: "region", key: cKey });
      if (isSearching || expandedRegions.has(cKey)) {
        for (const region of group.regions) {
          const key = regionKey(group.country, region.adminRegionName);
          entries.push({ type: "region", key });
          if (isSearching || expandedRegions.has(key)) {
            for (const city of region.cities) entries.push({ type: "city", city });
          }
        }
        for (const city of group.ungrouped) entries.push({ type: "city", city });
      }
    }
    return entries;
  }, [groups, expandedRegions, isSearching, currentLocationCity, recentCities]);

  const navIndexByKey = useMemo(() => {
    const map = new Map<string, number>();
    navEntries.forEach((entry, i) => map.set(entry.type === "region" ? `region:${entry.key}` : `city:${entry.city.id}`, i));
    return map;
  }, [navEntries]);

  // Same render-time reset pattern as the open-transition above: a new
  // (debounced) query means a new result set, so the highlighted row
  // snaps back to the top of it.
  const [prevFilterQuery, setPrevFilterQuery] = useState(filterQuery);
  if (filterQuery !== prevFilterQuery) {
    setPrevFilterQuery(filterQuery);
    setActiveIndex(0);
  }

  const activeEntry = navEntries[activeIndex];

  // Only scrolls when activeIndex changed via the keyboard (see
  // isKeyboardNavRef's comment above) — looks up the DOM node by id rather
  // than a per-row ref, so this runs exactly once per real navigation step.
  useEffect(() => {
    if (!isKeyboardNavRef.current) return;
    isKeyboardNavRef.current = false;
    const id = !activeEntry ? undefined : activeEntry.type === "region" ? regionOptionId(activeEntry.key) : cityOptionId(activeEntry.city.id);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  function toggleRegion(key: string) {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Opt-in only — never called automatically. Triggers the browser's own
  // native permission prompt; a denial or lack of support is a normal,
  // expected outcome (most visitors won't grant this), not an error to
  // alarm over — surfaced as a small inline note, never a blocking modal.
  function handleUseExactLocation() {
    setLocatingState("locating");
    requestPreciseCityId(
      regions,
      (id) => {
        // Durable, not local-only state — real bug found 2026-07-30: a
        // local-only override was lost the moment the visitor navigated
        // to a different city and came back. Persisting it here means
        // page.tsx's own actualCityId already reflects this on future
        // opens too — but router.refresh() doesn't remount THIS already-
        // open panel, so freshActualCityId also needs a direct update, or
        // the currently-open picker keeps showing its stale pre-grant
        // value (real bug found 2026-07-30, second one: the row didn't
        // appear at all right after granting, until closed and reopened).
        setCookie(PRECISE_CITY_COOKIE, id);
        setFreshActualCityId(id);
        setLocatingState("idle");
        router.refresh();
      },
      () => setLocatingState("error"),
    );
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      isKeyboardNavRef.current = true;
      setActiveIndex((i) => Math.min(i + 1, navEntries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      isKeyboardNavRef.current = true;
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!activeEntry) return;
      // Marks the pick as pending only — never closes the panel. Only
      // Explorar (button, or Enter while it's focused) commits.
      if (activeEntry.type === "region") toggleRegion(activeEntry.key);
      else setPendingCityId(activeEntry.city.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      // Lightweight focus trap: three real DOM tab stops (input, Explorar,
      // close button) — every región/comuna row is virtually highlighted
      // via aria-activedescendant, never actually DOM-focused, same
      // combobox pattern as the arrow-key navigation above.
      e.preventDefault();
      exploreButtonRef.current?.focus();
    }
  }

  function handleExploreKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) inputRef.current?.focus();
      else closeButtonRef.current?.focus();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  function handleCloseKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) exploreButtonRef.current?.focus();
      else inputRef.current?.focus();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  const activeDescendantId = activeEntry
    ? activeEntry.type === "region"
      ? regionOptionId(activeEntry.key)
      : cityOptionId(activeEntry.city.id)
    : undefined;

  // Real bug found 2026-07-29: this used to gate the whole "Chile" section
  // (see below), but navEntries only contains cities from EXPANDED
  // sections — so collapsing the last-expanded quick-pick made this false
  // and hid the entire región list, not just the row the user collapsed
  // ("al colapsar 'Últimas visitadas' desaparece Chile"). Only meaningful
  // while actively searching (where every matching región auto-expands, so
  // this really does mean "no matches"); collapsing a row during normal
  // browsing must never affect it.
  const hasAnyCityResult = navEntries.some((e) => e.type === "city");
  const showNoResults = isSearching ? !hasAnyCityResult : groups.length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={esCL.cityPickerAriaLabel}
      // `inert` (not just visual hiding) pulls the whole modal out of the
      // tab order and accessibility tree while closed — it's always
      // mounted (so the opacity transition can play), but a closed modal
      // must never be reachable by Tab or a screen reader.
      inert={!open}
      className={`fixed inset-0 z-40 bg-white flex flex-col transition-opacity duration-150 ${
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="relative shrink-0 pt-12 pb-5 px-4">
        <button
          ref={closeButtonRef}
          onClick={onClose}
          onKeyDown={handleCloseKeyDown}
          aria-label={esCL.closeCityPicker}
          className="absolute top-6 right-6 text-[18px] text-muted-gray"
        >
          ✕
        </button>
        <div className="max-w-[680px] mx-auto flex items-center justify-between gap-4 mb-6">
          <h2 className="text-[24px] md:text-[32px] font-bold text-heading-gray">{esCL.chooseCity}</h2>
          <WindowModeToggle mode={pendingWindowMode} onSelect={setPendingWindowMode} />
        </div>
        <div className="max-w-[680px] mx-auto">
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            aria-label={esCL.citySearchAriaLabel}
            aria-controls="city-picker-listbox"
            aria-activedescendant={activeDescendantId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={esCL.citySearchPlaceholder}
            className="w-full text-[15px] px-4 py-3 rounded-xl bg-picker-subtle border border-picker-border text-heading-gray placeholder:text-picker-placeholder focus:outline-none"
          />
          {!hasPreciseLocation && (
            <div className="mt-3">
              <button
                onClick={handleUseExactLocation}
                disabled={locatingState === "locating"}
                className="w-full flex items-center gap-3 bg-picker-subtle border border-picker-border rounded-xl px-4 py-3 text-left hover:bg-stone-100 transition-colors disabled:opacity-60"
              >
                <LocationPinIcon />
                <span className="flex-grow text-sm font-medium text-heading-gray">
                  {locatingState === "locating" ? esCL.cityPickerLocatingExact : esCL.cityPickerUseExactLocation}
                </span>
              </button>
              {locatingState === "error" && <p className="mt-1 text-[11px] text-red-600">{esCL.cityPickerExactLocationError}</p>}
            </div>
          )}
        </div>
      </div>

      <div id="city-picker-listbox" role="listbox" aria-label={esCL.chooseCity} className="flex-grow overflow-y-auto px-4 pb-10">
        <div className="max-w-[680px] mx-auto">
          {currentLocationCity && (
            <div className="border-b border-picker-border/30">
              <SectionRow
                title={esCL.cityPickerCurrentLocation}
                icon={<LocationPinIcon />}
                navKey={CURRENT_LOCATION_KEY}
                expanded={isRegionExpanded(CURRENT_LOCATION_KEY)}
                active={activeEntry?.type === "region" && activeEntry.key === CURRENT_LOCATION_KEY}
                totalCount={(cityCounts[currentLocationCity.id] ?? ZERO_COUNTS).inauguraciones + (cityCounts[currentLocationCity.id] ?? ZERO_COUNTS).exposActuales}
                onToggle={() => toggleRegion(CURRENT_LOCATION_KEY)}
                onHover={() => setActiveIndex(navIndexByKey.get(`region:${CURRENT_LOCATION_KEY}`) ?? 0)}
              />
              {isRegionExpanded(CURRENT_LOCATION_KEY) && (
                <div role="listbox" aria-labelledby={regionOptionId(CURRENT_LOCATION_KEY)}>
                  <CityRow
                    city={currentLocationCity}
                    counts={cityCounts[currentLocationCity.id] ?? ZERO_COUNTS}
                    selected={currentLocationCity.id === pendingCityId}
                    active={activeEntry?.type === "city" && activeEntry.city.id === currentLocationCity.id}
                    onSelect={(c) => setPendingCityId(c.id)}
                    onHover={() => setActiveIndex(navIndexByKey.get(`city:${currentLocationCity.id}`) ?? 0)}
                  />
                </div>
              )}
            </div>
          )}
          {recentCities.length > 0 && (
            <div className="border-b border-picker-border/30">
              <SectionRow
                title={esCL.cityPickerRecentlyVisited}
                icon={<RecentHistoryIcon />}
                navKey={RECENT_CITIES_KEY}
                expanded={isRegionExpanded(RECENT_CITIES_KEY)}
                active={activeEntry?.type === "region" && activeEntry.key === RECENT_CITIES_KEY}
                totalCount={recentCitiesCounts.inauguraciones + recentCitiesCounts.exposActuales}
                onToggle={() => toggleRegion(RECENT_CITIES_KEY)}
                onHover={() => setActiveIndex(navIndexByKey.get(`region:${RECENT_CITIES_KEY}`) ?? 0)}
              />
              {isRegionExpanded(RECENT_CITIES_KEY) && (
                <div role="listbox" aria-labelledby={regionOptionId(RECENT_CITIES_KEY)}>
                  {recentCities.map((c) => (
                    <CityRow
                      key={c.id}
                      city={c}
                      counts={cityCounts[c.id] ?? ZERO_COUNTS}
                      selected={c.id === pendingCityId}
                      active={activeEntry?.type === "city" && activeEntry.city.id === c.id}
                      onSelect={(city) => setPendingCityId(city.id)}
                      onHover={() => setActiveIndex(navIndexByKey.get(`city:${c.id}`) ?? 0)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {showNoResults ? (
            <p className="text-sm text-muted-gray text-center py-10">{esCL.noCityResults}</p>
          ) : (
            groups.map((group) => {
              const countryCities = [...group.regions.flatMap((r) => r.cities), ...group.ungrouped];
              const countryCounts = countsFor(countryCities, cityCounts);
              const countryPhrase = esCL.cityStats(countryCounts.inauguraciones, countryCounts.exposActuales);
              const cKey = countryKey(group.country);
              const countryExpanded = isRegionExpanded(cKey);
              return (
                <div key={group.country}>
                  <button
                    id={regionOptionId(cKey)}
                    aria-expanded={countryExpanded}
                    onClick={() => toggleRegion(cKey)}
                    onMouseEnter={() => setActiveIndex(navIndexByKey.get(`region:${cKey}`) ?? 0)}
                    className={`w-full flex items-center gap-2 py-2 border-b border-picker-border/60 text-left transition-colors ${
                      activeEntry?.type === "region" && activeEntry.key === cKey ? "bg-stone-100" : "hover:bg-stone-50"
                    }`}
                  >
                    <span className="text-[11px] text-picker-placeholder w-3 shrink-0">{countryExpanded ? "▾" : "▸"}</span>
                    <span className="flex-grow text-sm font-semibold text-heading-gray">{group.country}</span>
                    {countryPhrase && <span className="text-[13px] text-muted-gray">{countryPhrase}</span>}
                  </button>
                  {countryExpanded && (
                    <>
                      {group.regions.map((region) => {
                        const key = regionKey(group.country, region.adminRegionName);
                        const expanded = isRegionExpanded(key);
                        const total = countsFor(region.cities, cityCounts);
                        return (
                          <div key={key} className="border-b border-picker-border/30">
                            <SectionRow
                              title={region.adminRegionName}
                              numeral={region.adminRegionNumeral}
                              navKey={key}
                              expanded={expanded}
                              active={activeEntry?.type === "region" && activeEntry.key === key}
                              totalCount={total.inauguraciones + total.exposActuales}
                              onToggle={() => toggleRegion(key)}
                              onHover={() => setActiveIndex(navIndexByKey.get(`region:${key}`) ?? 0)}
                            />
                            {expanded && (
                              <div role="listbox" aria-labelledby={regionOptionId(key)}>
                                {region.cities.map((city) => (
                                  <CityRow
                                    key={city.id}
                                    city={city}
                                    counts={cityCounts[city.id] ?? ZERO_COUNTS}
                                    selected={city.id === pendingCityId}
                                    active={activeEntry?.type === "city" && activeEntry.city.id === city.id}
                                    onSelect={(c) => setPendingCityId(c.id)}
                                    onHover={() => setActiveIndex(navIndexByKey.get(`city:${city.id}`) ?? 0)}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {group.ungrouped.length > 0 && (
                        <div>
                          {group.ungrouped.map((city) => (
                            <CityRow
                              key={city.id}
                              city={city}
                              counts={cityCounts[city.id] ?? ZERO_COUNTS}
                              selected={city.id === pendingCityId}
                              active={activeEntry?.type === "city" && activeEntry.city.id === city.id}
                              onSelect={(c) => setPendingCityId(c.id)}
                              onHover={() => setActiveIndex(navIndexByKey.get(`city:${city.id}`) ?? 0)}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-picker-border px-6 pt-3.5 pb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="hidden md:flex items-center gap-6 text-[11px] text-picker-placeholder">
          <span>{esCL.cityPickerHints.navigate}</span>
          <span>{esCL.cityPickerHints.select}</span>
          <span>{esCL.cityPickerHints.close}</span>
        </div>
        <button
          ref={exploreButtonRef}
          onClick={() => onExplore(pendingCityId, pendingWindowMode)}
          onKeyDown={handleExploreKeyDown}
          className="col-start-2 inline-flex items-center gap-2 bg-heading-gray text-white rounded-lg px-5 py-2.5 text-sm font-semibold"
        >
          {esCL.explorar} →
        </button>
      </div>
    </div>
  );
}
