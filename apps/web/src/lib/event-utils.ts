// Pure, client-safe event utilities — filtering/sorting/grouping over an
// already-fetched EventRecord[] array, no DB access. Split out of
// events.ts on 2026-08-18: this file (and everything it imports) must
// never import getSupabaseClient/unstable_cache — that's exactly what
// dragged the full @supabase/supabase-js SDK (~78KB gzip) into every
// anonymous visitor's home-page bundle, via SearchPanel.tsx's import of
// searchEvents. events.ts keeps the DB-fetching surface
// (fetchApprovedEvents) and stays server-only; this file is safe for any
// client component to import.
import { cityIdFromRegionName, deriveCityId, OTHER_CITY, matchesQuery } from "./cities";
import { activeRange, anchorDateOnly, dateOnlyFromIso, isCurrentOrUpcoming, rangesOverlap } from "./date";
import type { EventRecord, RegionMeta } from "./events";

// Prefers the curator's own region match (exact, resolved at write time)
// over the frontend's freeform_location guess — the guess only covers rows
// from before region_id existed, or whose location text didn't match any
// seeded region. cityIdFromRegionName always succeeds (no whitelist to
// fall outside of — see cities.ts), so regionName wins whenever present.
// Exported for the event detail page (apps/web/src/app/eventos/[id]/page.tsx)
// — the "back to this comuna" link needs the exact same id a click on this
// event elsewhere in the app would already resolve to, not a fresh guess.
export function resolveCityId(event: EventRecord): string {
  if (event.regionName) return cityIdFromRegionName(event.regionName);
  return deriveCityId(event.freeformLocation);
}

export function displayNameForCity(event: EventRecord): string {
  if (event.regionName) return event.regionName;
  const segments = event.freeformLocation.split(",").map((s) => s.trim());
  return segments[segments.length - 1] || event.freeformLocation;
}

// id -> display name, built from real observed events (not a static
// list) — every city that has ever had at least one event (not just
// active-today) gets a proper name here, so directly navigating to a
// city via cookie still shows its real name even when it currently has
// zero active events. First name seen for a given id wins; in practice
// all events resolving to the same id share the same regionName anyway
// (both derive from the exact same seeded `regions.name`).
export function cityNamesFromEvents(events: EventRecord[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const e of events) {
    const id = resolveCityId(e);
    if (id === OTHER_CITY.id) continue;
    if (!(id in names)) names[id] = displayNameForCity(e);
  }
  return names;
}

export function filterFamilyMode(events: EventRecord[], familyModeOn: boolean): EventRecord[] {
  return familyModeOn ? events.filter((e) => e.sensitivityTags.length === 0) : events;
}

export function filterByCity(events: EventRecord[], cityId: string): EventRecord[] {
  return events.filter((e) => resolveCityId(e) === cityId);
}

// Región-level counterpart (2026-08-12) — the site's actual selection/
// filtering unit now (see cities.ts's own "Región-level selection"
// section). Resolves each event's own comuna (resolveCityId) up to its
// admin región via the same metaByCityId map cities.ts's
// buildRegionMetaByCityId already builds from `regions` — no new query.
export function resolveAdminRegionName(event: EventRecord, metaByCityId: Map<string, RegionMeta>): string | null {
  return metaByCityId.get(resolveCityId(event))?.adminRegionName ?? null;
}

export function filterByRegion(events: EventRecord[], adminRegionName: string, metaByCityId: Map<string, RegionMeta>): EventRecord[] {
  return events.filter((e) => resolveAdminRegionName(e, metaByCityId) === adminRegionName);
}

export function eventsActiveInRange(events: EventRecord[], start: string, end: string): EventRecord[] {
  return events.filter((e) => {
    const range = activeRange(e);
    return range !== null && rangesOverlap(range.start, range.end, start, end);
  });
}

// The home page shows only what's visitable within the current window —
// nothing not yet started, nothing already ended (stricter than
// isCurrentOrUpcoming's month-level retention check, which is still used
// by findNextEvent's lookahead below). The window is always the current
// Monday-Sunday week, computed once in page.tsx — the Filtros pills (Hoy,
// Vigentes) narrow what's DISPLAYED from that week, they don't change the
// window itself. This is a thin wrapper because eventsActiveInRange is
// already generic over arbitrary ranges.
export function filterActiveInRange(events: EventRecord[], start: string, end: string): EventRecord[] {
  return eventsActiveInRange(events, start, end);
}

// Newest opening/start first — an exhibition that just opened outranks one
// that's been running for weeks.
export function sortByAnchorDesc(events: EventRecord[]): EventRecord[] {
  return [...events].sort((a, b) => {
    const aAnchor = anchorDateOnly(a) ?? "";
    const bAnchor = anchorDateOnly(b) ?? "";
    if (aAnchor === bAnchor) return 0;
    return aAnchor > bAnchor ? -1 : 1;
  });
}

// Soonest-closing first — Expos Actuales' own order (per the user
// 2026-08-04): what's about to close outranks what still has weeks left,
// the opposite priority from Inauguraciones' "newest opening first".
// Falls back to the anchor date when there's no confirmed runEndDate
// (mirrors fmtUntilDate/isClosingSoon's own fallback); an event with
// neither sorts last — an unknown end date is never "closing soonest".
export function sortByRunEndAsc(events: EventRecord[]): EventRecord[] {
  return [...events].sort((a, b) => {
    const aEnd = a.runEndDate ?? anchorDateOnly(a) ?? "9999-12-31";
    const bEnd = b.runEndDate ?? anchorDateOnly(b) ?? "9999-12-31";
    if (aEnd === bEnd) return 0;
    return aEnd < bEnd ? -1 : 1;
  });
}

export interface InauguracionesYExpos {
  inauguraciones: EventRecord[];
  exposActuales: EventRecord[];
}

// Intentionally OVERLAPPING, not mutually exclusive: an event with a
// confirmed opening within [start, end] is highlighted in "Inauguraciones"
// AND still shown in "Expos Actuales" — a visitor shouldn't have to guess
// which section a today-opening exhibition landed in. `inauguraciones` is
// the subset whose opening falls in the window. `exposActuales` is every
// event in the (already range-filtered) input that has a REAL run range
// (both runStartDate and runEndDate) — real bug, found 2026-08-12: an
// event with only a confirmed openingDatetime and no run range (e.g.
// "KOS: Entre la oscuridad...", Aninat Galería) rendered correctly under
// Inauguraciones, but ALSO showed up under Exposiciones Actuales with
// untilDateLine falling back to its own opening date as if that were the
// closing date too — "Hasta el 13 de Agosto" on an exhibition that opens
// the 13th, implying (wrongly) that it closes the same day it opens. An
// inauguración alone is a real, complete thing to show under
// Inauguraciones; showing it as an "actual" exhibition with a knowable
// closing date, sortable by that date, requires actually knowing both
// ends of the run — caller must already have narrowed `events` to the
// active window (filterActiveInRange) — this only splits/highlights/
// filters exposActuales' own completeness requirement, nothing else.
export function splitInauguracionesYExpos(events: EventRecord[], start: string, end: string): InauguracionesYExpos {
  const inauguraciones = events.filter((e) => {
    if (e.openingDatetime === null) return false;
    const openingDate = dateOnlyFromIso(e.openingDatetime);
    return openingDate >= start && openingDate <= end;
  });
  const exposActuales = events.filter((e) => e.runStartDate !== null && e.runEndDate !== null);
  return {
    inauguraciones: sortByAnchorDesc(inauguraciones),
    exposActuales: sortByRunEndAsc(exposActuales),
  };
}

// "Vigentes" filter (FiltersSection pill): hides inauguraciones whose
// opening date has already passed within the current week — e.g. viewing
// on Wednesday hides Monday/Tuesday's inauguraciones, keeps
// Wednesday-onward. Only ever applied to the currently-viewed city's own
// inauguraciones list (page.tsx) — never to the citywide/carousel counts
// (countByCity), which stay showing the full week's unfiltered numbers.
export function filterUpcomingInauguraciones(inauguraciones: EventRecord[], todayStr: string): EventRecord[] {
  return inauguraciones.filter((e) => e.openingDatetime !== null && dateOnlyFromIso(e.openingDatetime) >= todayStr);
}

export interface CityCounts {
  inauguraciones: number;
  exposActuales: number;
}

// Per-city counts for the "Arte en todas partes" carousel — run over the
// full (not city-filtered) active-in-range + family-mode-filtered set. Only
// ever creates an entry for a city with at least one real event in the
// current window — not seeded from any fixed list — so citiesWithEvents
// (cities.ts) naturally offers exactly "the cities with something to show",
// whichever real comunas those turn out to be. Overlap-counted, matching
// splitInauguracionesYExpos: an opening-in-range event increments BOTH
// tallies, since it's rendered in both sections. exposActuales only counts
// events with a real run range (both runStartDate and runEndDate) — same
// completeness requirement as splitInauguracionesYExpos' own exposActuales,
// so a picker badge ("N expos") always matches the length of the list it
// promises.
export function countByCity(events: EventRecord[], start: string, end: string): Record<string, CityCounts> {
  const counts: Record<string, CityCounts> = {};
  for (const e of events) {
    const cityId = resolveCityId(e);
    if (cityId === OTHER_CITY.id) continue; // "otro" isn't shown in the carousel
    if (!(cityId in counts)) counts[cityId] = { inauguraciones: 0, exposActuales: 0 };
    if (e.runStartDate !== null && e.runEndDate !== null) counts[cityId].exposActuales += 1;
    const openingDate = e.openingDatetime !== null ? dateOnlyFromIso(e.openingDatetime) : null;
    if (openingDate !== null && openingDate >= start && openingDate <= end) {
      counts[cityId].inauguraciones += 1;
    }
  }
  return counts;
}

// One place that adds up {inauguraciones, exposActuales} pairs — used for
// both the región-level and Chile-level totals in the city picker, so a
// región's count is just sumCounts of its comunas' CityCounts, and the
// country total is sumCounts of every visible comuna's.
export function sumCounts(counts: CityCounts[]): CityCounts {
  return counts.reduce(
    (acc, c) => ({ inauguraciones: acc.inauguraciones + c.inauguraciones, exposActuales: acc.exposActuales + c.exposActuales }),
    { inauguraciones: 0, exposActuales: 0 },
  );
}

// Per-city preview thumbnails for the "Arte en todas partes" carousel — up
// to `maxPerCity` events, newest/soonest anchor date first (same
// sortByAnchorDesc ordering already used for inauguraciones/exposActuales
// display). Only ever keys a city that actually has a qualifying event —
// same "built from real data, not a fixed list" shape as countByCity.
export function thumbnailsByCity(events: EventRecord[], maxPerCity = 4): Record<string, EventRecord[]> {
  const byCity: Record<string, EventRecord[]> = {};
  for (const e of sortByAnchorDesc(events)) {
    const cityId = resolveCityId(e);
    if (cityId === OTHER_CITY.id) continue;
    if (!(cityId in byCity)) byCity[cityId] = [];
    if (byCity[cityId].length < maxPerCity) byCity[cityId].push(e);
  }
  return byCity;
}

// Cascading empty-state support: the earliest current-or-upcoming event
// (month-level, not window-exact) that falls AFTER the current window ends
// — so an empty section/page can say "the next one is on X" instead of
// just "nothing." Threshold is `> windowEnd` (always the current week's
// Sunday), not `>= todayStr` — this is the empty-window fallback, so
// "next" must mean "after what we already tried to show."
export function findNextEvent(events: EventRecord[], todayStr: string, windowEnd: string): EventRecord | null {
  const upcoming = events
    .filter((e) => isCurrentOrUpcoming(e, todayStr))
    .map((e) => ({ e, anchor: anchorDateOnly(e) }))
    .filter((x): x is { e: EventRecord; anchor: string } => x.anchor !== null && x.anchor > windowEnd)
    .sort((a, b) => (a.anchor > b.anchor ? 1 : a.anchor < b.anchor ? -1 : 0));
  return upcoming[0]?.e ?? null;
}

// Free-text search over title/artist/placeName — accent-insensitive via
// cities.ts's matchesQuery, same normalization the city picker's search
// box already relies on.
export function searchEvents(events: EventRecord[], query: string): EventRecord[] {
  const trimmed = query.trim();
  if (!trimmed) return events;
  return events.filter(
    (e) => matchesQuery(e.title, trimmed) || (e.artist !== null && matchesQuery(e.artist, trimmed)) || (e.placeName !== null && matchesQuery(e.placeName, trimmed)),
  );
}

export function filterByPlaceName(events: EventRecord[], query: string): EventRecord[] {
  const trimmed = query.trim();
  if (!trimmed) return events;
  return events.filter((e) => e.placeName !== null && matchesQuery(e.placeName, trimmed));
}

// `description` is curation-extracted text from the source (Haiku's own
// system prompt says "extrae... descripción", not "resume/reescribe") —
// close to a verbatim excerpt, not our own summary. Never shown in full on
// an individually shareable/indexable page (see /eventos/[id]) — always
// truncated, with the source link right there for the rest.
export function truncateDescription(description: string | null, maxLength = 220): string | null {
  if (!description) return null;
  if (description.length <= maxLength) return description;
  return description.slice(0, maxLength).trimEnd() + "…";
}
