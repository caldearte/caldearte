import {
  filterFamilyMode,
  filterActiveInRange,
  countByCity,
  cityNamesFromEvents,
  thumbnailsByCity,
  type EventRecord,
  type RegionMeta,
  type CityCounts,
} from "@/lib/events";
import { DEFAULT_CITY_ID, buildRegionMetaByCityId, resolveDefaultCityId, resolveGeoCityId, nearestCityIdByCoords } from "@/lib/cities";
import { CITY_COOKIE, PRECISE_CITY_COOKIE } from "@/lib/cookies";

// Narrow structural subset of next/headers' cookies() return type — real
// cookies() satisfies this, but so does a plain object, which is what
// lets page.tsx (2026-08-06, made cache-eligible to fix a Fast Origin
// Transfer spike — see homeViewModel.ts) call this with an "empty" reader
// for its cached default render, no Next.js cookies()/headers() call
// involved at all.
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

export const EMPTY_COOKIE_READER: CookieReader = { get: () => undefined };

export interface CityPickerContext {
  cityId: string;
  cityNames: Record<string, string>;
  cityCounts: Record<string, CityCounts>;
  cityThumbnails: Record<string, EventRecord[]>;
  actualCityId: string | null;
  hasPreciseLocation: boolean;
  // Family-mode-filtered, active-in-[rangeStart,rangeEnd] — the same base
  // set both the home page's own per-city lists (filterByCity) and the
  // event page's list-mode context are further narrowed from.
  activeInRange: EventRecord[];
}

// Extracted from app/page.tsx (2026-08-06) once the event detail page
// needed the exact same "which city, from cookie or IP-geo fallback" +
// city-picker sidebar data (counts/thumbnails for CityPickerPanel) — a
// second real caller, not speculative reuse. Keeping this in one place
// means the two pages can't silently drift on how a city gets resolved.
export async function resolveCityPickerContext({
  cookieStore,
  headerStore,
  allEvents,
  regions,
  rangeStart,
  rangeEnd,
  familyMode,
}: {
  cookieStore: CookieReader;
  headerStore: Headers;
  allEvents: EventRecord[];
  regions: RegionMeta[];
  rangeStart: string;
  rangeEnd: string;
  familyMode: boolean;
}): Promise<CityPickerContext> {
  const visible = filterFamilyMode(allEvents, familyMode);
  const cityNames = cityNamesFromEvents(allEvents);
  const activeInRange = filterActiveInRange(visible, rangeStart, rangeEnd);
  const cityCounts = countByCity(activeInRange, rangeStart, rangeEnd);
  const cityThumbnails = thumbnailsByCity(activeInRange, 4);
  const metaByCityId = buildRegionMetaByCityId(regions);

  const cityCookieValue = cookieStore.get(CITY_COOKIE)?.value;
  const geoCity = headerStore.get("x-vercel-ip-city") ?? undefined;
  const geoCountry = headerStore.get("x-vercel-ip-country") ?? undefined;
  // Validated against the real comuna list (`regions`, all 346 seeded
  // comunas regardless of events), not `cityNames` — real bug, found
  // 2026-08-06: cityNames only has an entry for a comuna with at least one
  // event RIGHT NOW, so a comuna that still has a valid CITY_COOKIE but
  // currently zero events (e.g. right after removing its last event) used
  // to silently bounce to DEFAULT_CITY_ID on every page load, not just
  // when re-selecting it in the picker.
  const cityId =
    cityCookieValue !== undefined
      ? metaByCityId.has(cityCookieValue) || cityCookieValue === DEFAULT_CITY_ID
        ? cityCookieValue
        : DEFAULT_CITY_ID
      : resolveDefaultCityId(geoCity, geoCountry, metaByCityId, cityCounts);

  const geoLatHeader = headerStore.get("x-vercel-ip-latitude");
  const geoLngHeader = headerStore.get("x-vercel-ip-longitude");
  const geoLat = geoLatHeader ? Number(geoLatHeader) : NaN;
  const geoLng = geoLngHeader ? Number(geoLngHeader) : NaN;
  const hasGeoCoords = Number.isFinite(geoLat) && Number.isFinite(geoLng);
  const preciseCityCookie = cookieStore.get(PRECISE_CITY_COOKIE)?.value;
  const hasPreciseLocation = preciseCityCookie !== undefined;
  const actualCityId =
    preciseCityCookie ??
    (hasGeoCoords ? nearestCityIdByCoords(geoLat, geoLng, regions) : null) ??
    resolveGeoCityId(geoCity, geoCountry, metaByCityId);

  return { cityId, cityNames, cityCounts, cityThumbnails, actualCityId, hasPreciseLocation, activeInRange };
}
