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
import {
  buildRegionMetaByCityId,
  resolveDefaultCityId,
  resolveGeoCityId,
  nearestCityIdByCoords,
  adminRegionNameByRegionId,
  regionIdFromAdminRegionName,
} from "@/lib/cities";
import { REGION_COOKIE, PRECISE_CITY_COOKIE } from "@/lib/cookies";

// Last-resort fallback if a comuna somehow has no admin_region_name yet
// (shouldn't happen in practice — DEFAULT_CITY_ID's own comuna, "santiago",
// is always seeded with this exact región) — same posture as
// regionNames.ts/the old zones.ts, which also hardcode the 16 canonical
// admin_region_name strings.
const DEFAULT_ADMIN_REGION_NAME = "Región Metropolitana de Santiago";

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
  // The site's actual selection unit — a región slug (see cities.ts's
  // regionIdFromAdminRegionName). `cityId`/`cityNames`/`cityCounts`/
  // `cityThumbnails` below stay comuna-level: still needed to derive each
  // event's own comuna label on cards, and to resolve régionId itself.
  regionId: string;
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

  const geoCity = headerStore.get("x-vercel-ip-city") ?? undefined;
  const geoCountry = headerStore.get("x-vercel-ip-country") ?? undefined;
  // Still resolved — needed to derive each event's own comuna label on
  // cards, and as the geo-fallback path for régionId below. No longer the
  // site's own selection unit (see régionId), so not read from a cookie
  // anymore.
  const cityId = resolveDefaultCityId(geoCity, geoCountry, metaByCityId, cityCounts);

  const regionNameById = adminRegionNameByRegionId(regions);
  const regionCookieValue = cookieStore.get(REGION_COOKIE)?.value;
  // regionId: REGION_COOKIE if it's a real, recognized región -> else the
  // admin región of wherever cityId resolved to (IP-geo comuna or
  // DEFAULT_CITY_ID) -> else a hardcoded last resort.
  const regionId =
    regionCookieValue !== undefined && regionNameById.has(regionCookieValue)
      ? regionCookieValue
      : regionIdFromAdminRegionName(metaByCityId.get(cityId)?.adminRegionName ?? DEFAULT_ADMIN_REGION_NAME);

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

  return { regionId, cityId, cityNames, cityCounts, cityThumbnails, actualCityId, hasPreciseLocation, activeInRange };
}
