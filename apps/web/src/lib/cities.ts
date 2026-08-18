// City derivation: `events.region_id` (resolved by the curator at write
// time — see apps/curator/src/lib/locations.ts's matchRegionId) gives an
// exact region name for rows that have it; events.ts resolves that name
// against a city id here. Older/unmatched rows have no region_id, so we
// fall back to the original heuristic: take freeform_location's trailing
// comma-segment (same technique as the curator's own Chile/foreign-country
// check).
//
// No hardcoded whitelist: city ids are derived by slugifying whatever real
// comuna name reaches this file — never looked up against a fixed list.
// Real production gap (found 2026-07-17): a static ~15-entry KNOWN_CITIES
// array used to gate BOTH which cities were navigable AND which counted in
// countByCity — any event tagged to one of the (now 346, previously
// unseeded) other Chilean comunas silently fell into "otro" and was
// invisible everywhere in the UI, even though the curator had already
// correctly resolved and validated its region_id. Since the curator's own
// matchRegionId only ever assigns region_id against a name already present
// in the seeded `regions` table (all 346 official comunas as of
// 2026-07-17, see docs/region-discovery.md), any regionName reaching this
// file is already a real, validated Chilean comuna — trusting it directly
// is safe, no separate frontend whitelist needed.

import { sumCounts, type CityCounts } from "./event-utils";
import type { RegionMeta } from "./events";

export interface City {
  id: string;
  name: string;
}

export const OTHER_CITY: City = { id: "otro", name: "Otro" };

export const DEFAULT_CITY_ID = "santiago";

// Fallback display names only — NOT a gate on which cities are navigable.
// Used only when a city has no event of its own right now to derive a
// properly-cased/accented name from (e.g. DEFAULT_CITY_ID on a fresh empty
// DB). Real observed data (cityNamesFromEvents) always takes priority over
// this when both are available.
const SEED_CITY_NAMES: Record<string, string> = {
  santiago: "Santiago",
  valparaiso: "Valparaíso",
  concepcion: "Concepción",
  antofagasta: "Antofagasta",
  arica: "Arica",
};

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalize(text: string): string {
  return stripAccents(text.toLowerCase()).trim();
}

// Accent/case-insensitive substring match — same normalization slugify
// already uses, exported so the city picker's search box filters
// consistently with how ids themselves are derived (typing "valparaiso"
// matches "Valparaíso" either way).
export function matchesQuery(text: string, query: string): boolean {
  return normalize(text).includes(normalize(query));
}

// A stable, deterministic id for any comuna/city name — spaces and
// punctuation become hyphens, e.g. "Puerto Varas" -> "puerto-varas",
// "Cabo de Hornos" -> "cabo-de-hornos".
export function slugify(name: string): string {
  return normalize(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A region name straight from `regions.name` (via events.region_id) is
// already the exact, curator-validated comuna — always navigable, no
// whitelist to fall outside of.
export function cityIdFromRegionName(regionName: string): string {
  return slugify(regionName);
}

// Fallback for rows with no region_id (pre-migration rows, or a location
// whose text didn't match any seeded comuna at write time) — same
// trailing-comma-segment heuristic as before, no longer restricted to a
// hardcoded whitelist.
export function deriveCityId(freeformLocation: string): string {
  const segments = freeformLocation.split(",").map((s) => s.trim());
  const lastSegment = segments[segments.length - 1];
  return lastSegment ? slugify(lastSegment) : OTHER_CITY.id;
}

// `cityNames` is real data observed from actual events (built by
// events.ts's cityNamesFromEvents) — SEED_CITY_NAMES is only a fallback
// for a city with zero events of its own right now, and `id` itself is
// the last resort (an unrecognized/never-seen id still renders as
// *something* readable rather than crashing).
export function cityById(id: string, cityNames: Record<string, string>): City {
  if (id === OTHER_CITY.id) return OTHER_CITY;
  return { id, name: cityNames[id] ?? SEED_CITY_NAMES[id] ?? id };
}

function hasEvents(counts: CityCounts | undefined): boolean {
  return (counts?.inauguraciones ?? 0) > 0 || (counts?.exposActuales ?? 0) > 0;
}

// "Muestra lo que hay": a city with nothing to show today isn't a real
// destination — filtered out of both the city picker and the "Arte en
// todas partes" carousel, no exception for the currently-selected city
// either (real bug, found 2026-08-06: after removing every Antofagasta
// event, its own now-empty entry kept lingering in the picker via the
// previous alwaysIncludeCityId safety net — removed). The safety net this
// used to need is now handled upstream instead: región selection
// (cityPickerContext.ts) is validated against the real 16-región list
// (allAdminRegions), not against "has events right now" — same posture
// this file's own comuna-level resolution already had before región
// became the site's own selection unit.
//
// Built entirely from `cityCounts`' own keys, not a static list —
// `countByCity` (events.ts) only ever creates an entry for a city that
// has at least one real event right now, so this naturally offers
// exactly "the cities with something to show", whichever those are.
export function citiesWithEvents(
  cityCounts: Record<string, CityCounts>,
  cityNames: Record<string, string>,
  options: { excludeCityId?: string } = {},
): City[] {
  return Object.keys(cityCounts)
    .filter((id) => id !== options.excludeCityId)
    .filter((id) => hasEvents(cityCounts[id]))
    .map((id) => cityById(id, cityNames))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// Default-city resolution for a first-time visitor (no región cookie yet),
// from Vercel's IP geolocation — still comuna-level internally, since IP
// geo only ever resolves to one comuna; cityPickerContext.ts is the one
// that then derives that comuna's own admin región for actual selection.
// Runs in page.tsx (a server component that
// already has live `regions`/`cityCounts` data), NOT the edge proxy —
// there's no whitelist here, any of the 346 real seeded comunas is a
// valid match, same "trust the real data" philosophy as the rest of this
// file. Real production gap this replaces (found 2026-07-17): the
// previous edge-only version (`matchCityByGeoName`, since removed) only
// recognized a fixed 5-city allowlist and had no country check at all —
// a visitor in any of the other ~341 comunas, or genuinely outside Chile,
// both silently landed on Santiago with no distinction between the two.
//
// Three tiers, in order: (1) outside Chile -> Santiago immediately, no
// point matching a city string that isn't Chilean; (2) own comuna, if
// it's real AND has events right now; (3) any other comuna in the same
// admin región that has events right now ("una cercana de la misma
// región"); (4) Santiago, if nothing above matched.
export function resolveDefaultCityId(
  geoCity: string | undefined,
  geoCountry: string | undefined,
  metaByCityId: Map<string, RegionMeta>,
  cityCounts: Record<string, CityCounts>,
): string {
  if (geoCountry && geoCountry !== "CL") return DEFAULT_CITY_ID;
  if (!geoCity) return DEFAULT_CITY_ID;

  const ownId = slugify(geoCity);
  const ownMeta = metaByCityId.get(ownId);
  if (ownMeta && hasEvents(cityCounts[ownId])) return ownId;

  if (ownMeta?.adminRegionName) {
    const regionMate = [...metaByCityId.entries()].find(
      ([id, meta]) => meta.adminRegionName === ownMeta.adminRegionName && hasEvents(cityCounts[id]),
    );
    if (regionMate) return regionMate[0];
  }

  return DEFAULT_CITY_ID;
}

// The city picker's "Tu ubicación actual" row needs the visitor's TRUE own
// comuna, not resolveDefaultCityId's "nearby active city" substitute — real
// bug found 2026-07-29: a visitor in La Reina (which had zero events at the
// time) was shown "Tu ubicación actual: Santiago", because
// resolveDefaultCityId's own region-mate fallback (tier 3 above) silently
// swapped in a different comuna. That fallback is correct FOR ITS PURPOSE
// (picking a reasonable default city to show), but wrong for a row that
// claims to report where the visitor actually is. No hasEvents gate and no
// substitution here — returns the real comuna id if recognized, else null
// (outside Chile, no geo header, or an unrecognized comuna name) so the
// picker can hide the row entirely rather than guess.
export function resolveGeoCityId(
  geoCity: string | undefined,
  geoCountry: string | undefined,
  metaByCityId: Map<string, RegionMeta>,
): string | null {
  if (geoCountry !== "CL" || !geoCity) return null;
  const ownId = slugify(geoCity);
  return metaByCityId.has(ownId) ? ownId : null;
}

const EARTH_RADIUS_KM = 6371;

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// IP-geolocation's estimated coordinate is commonly off by a few to
// several dozen km in dense urban areas (real gap found 2026-07-30:
// `resolveGeoCityId`'s name-only match couldn't tell La Reina from
// Santiago, since Vercel's `x-vercel-ip-city` only resolves to city-level
// for Greater Santiago — see docs discussion in this PR). Coordinates are
// finer-grained than that discrete label, so matching against each
// comuna's centroid (supabase/migrations/20260730005132_backfill_region_coordinates.sql)
// is a real precision improvement — but a match beyond MAX_PLAUSIBLE_DISTANCE_KM
// is more likely a bad/missing reading than a genuine signal, so it
// returns null (caller falls back to the coarser name match) rather than
// confidently naming a comuna that's implausibly far from the estimate.
const MAX_PLAUSIBLE_DISTANCE_KM = 50;

// Shared by both the automatic server-side path (Vercel's
// x-vercel-ip-latitude/longitude headers, page.tsx) and the opt-in
// client-side path (the browser's own Geolocation API, CityPickerPanel) —
// same "given a point, which comuna centroid is closest" logic either way.
export function nearestCityIdByCoords(lat: number, lng: number, regions: RegionMeta[]): string | null {
  let closest: { id: string; distanceKm: number } | null = null;
  for (const region of regions) {
    if (region.lat === null || region.lng === null) continue;
    const distanceKm = haversineDistanceKm(lat, lng, region.lat, region.lng);
    if (!closest || distanceKm < closest.distanceKm) {
      closest = { id: slugify(region.name), distanceKm };
    }
  }
  if (!closest || closest.distanceKm > MAX_PLAUSIBLE_DISTANCE_KM) return null;
  return closest.id;
}

// Narrows citiesWithEvents' output for the "Arte en todas partes" carousel
// (real gap found 2026-07-20: with all 346 comunas seeded, the horizontal
// scroll got too long). Same "misma región -> aledaña" idea
// resolveDefaultCityId already uses for one comuna, generalized to N:
// start at the current city's own admin región, then widen outward by
// `adminRegionOrder` distance (1, 2, 3...) until at least `min` comunas
// qualify — geographically nearest regions fill in first. If that pool is
// bigger than `max` (the common case for Región Metropolitana, which
// alone usually has far more than 10 active comunas), keep only the `max`
// with the most combined events (inauguraciones + exposActuales), so a
// region-rich día doesn't just reproduce the original "too long" problem
// one región at a time. Final display order is always alphabetical — the
// count only decides which comunas make the cut, never the order they're
// shown in. No known admin región for the current city (ungrouped comuna)
// -> no narrowing at all, same safe fallback groupCitiesByRegion already
// uses for that case.
export function narrowCitiesByRegion(
  cities: City[],
  metaByCityId: Map<string, RegionMeta>,
  currentCityId: string,
  cityCounts: Record<string, CityCounts>,
  { min = 6, max = 10 }: { min?: number; max?: number } = {},
): City[] {
  const currentOrder = metaByCityId.get(currentCityId)?.adminRegionOrder;
  if (currentOrder === null || currentOrder === undefined) return cities;

  let distance = 0;
  let selected: City[] = [];
  // 16 = Chile's total admin región count, a safe upper bound on how far
  // this ever needs to widen.
  while (selected.length < min && distance <= 16) {
    selected = cities.filter((c) => {
      const order = metaByCityId.get(c.id)?.adminRegionOrder;
      return order !== null && order !== undefined && Math.abs(order - currentOrder) <= distance;
    });
    distance += 1;
  }

  if (selected.length > max) {
    const totalCount = (c: City) => {
      const counts = cityCounts[c.id];
      return (counts?.inauguraciones ?? 0) + (counts?.exposActuales ?? 0);
    };
    selected = [...selected].sort((a, b) => totalCount(b) - totalCount(a)).slice(0, max);
  }

  return [...selected].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// Keyed by the same slugified id every City already uses (cityIdFromRegionName),
// so it joins directly against citiesWithEvents' output with no extra
// lookup step.
export function buildRegionMetaByCityId(regions: RegionMeta[]): Map<string, RegionMeta> {
  return new Map(regions.map((r) => [slugify(r.name), r]));
}

// --- Región-level selection (2026-08-12) --------------------------------
// The site's location selector/filter used to operate on a single comuna
// (a "City" above); it now operates on the comuna's own admin región
// instead (16 real Chilean regions), since two comunas in the same región
// are realistically visitable the same day — see docs/roadmap or the PR
// description for the full rationale. A comuna's own name is still shown
// next to each event's venue (see useEventCardActions.ts's cityName), but
// SELECTION now happens at this coarser level everywhere in the app.

export interface AdminRegion {
  adminRegionName: string;
  adminRegionOrder: number;
  adminRegionNumeral: string | null;
}

export function regionIdFromAdminRegionName(adminRegionName: string): string {
  return slugify(adminRegionName);
}

// All 16 real regions, always — deduped from the FULL `regions` table (346
// comuna rows, each carrying its own admin_region_name), sorted north to
// south. Deliberately independent of which comunas currently have events
// (unlike citiesWithEvents' own comuna-level list) — a región some of
// whose comunas are between exhibitions right now should still be a valid,
// visible destination in the picker, just with a zero/low count badge.
export function allAdminRegions(regions: RegionMeta[]): AdminRegion[] {
  const byName = new Map<string, AdminRegion>();
  for (const r of regions) {
    if (r.adminRegionName === null || r.adminRegionOrder === null) continue;
    if (!byName.has(r.adminRegionName)) {
      byName.set(r.adminRegionName, {
        adminRegionName: r.adminRegionName,
        adminRegionOrder: r.adminRegionOrder,
        adminRegionNumeral: r.adminRegionNumeral,
      });
    }
  }
  return [...byName.values()].sort((a, b) => a.adminRegionOrder - b.adminRegionOrder);
}

// regionId (cookie/URL value) -> the real admin_region_name string that
// filterByRegion/resolveAdminRegionName actually compare against.
export function adminRegionNameByRegionId(regions: RegionMeta[]): Map<string, string> {
  return new Map(allAdminRegions(regions).map((r) => [regionIdFromAdminRegionName(r.adminRegionName), r.adminRegionName]));
}

// Per-región badge counts for the picker — sums each región's own
// comunas' already-computed cityCounts (countByCity, events.ts). A comuna
// with no entry in cityCounts (zero events right now) contributes nothing,
// same as it already does for citiesWithEvents.
export function countByRegion(cityCounts: Record<string, CityCounts>, regions: RegionMeta[]): Record<string, CityCounts> {
  const byRegion = new Map<string, CityCounts[]>();
  for (const r of regions) {
    if (r.adminRegionName === null) continue;
    const counts = cityCounts[slugify(r.name)];
    if (!counts) continue;
    const regionId = regionIdFromAdminRegionName(r.adminRegionName);
    const bucket = byRegion.get(regionId);
    if (bucket) bucket.push(counts);
    else byRegion.set(regionId, [counts]);
  }
  const result: Record<string, CityCounts> = {};
  for (const [regionId, list] of byRegion) result[regionId] = sumCounts(list);
  return result;
}

export interface AdminRegionGroup {
  adminRegionName: string;
  adminRegionOrder: number;
  adminRegionNumeral: string | null;
  cities: City[];
}

export interface CountryGroup {
  country: string;
  regions: AdminRegionGroup[]; // sorted by adminRegionOrder, ascending (north to south in Chile)
  ungrouped: City[]; // comunas with no admin_region_name yet — see the migration's header comment
}

// City picker grouping: country -> macro-región (geographically ordered)
// -> comuna (alphabetical). Built ONLY from the `cities` array passed in
// (already "has events"-filtered, e.g. citiesWithEvents' output) — a
// región with zero qualifying comunas simply never gets an entry, which
// is exactly "only show regions with comunas that have events", for free,
// with no separate filtering pass. Grouping first by `country` (a real
// column already on every row) is the multi-country scalability hook:
// a second country's comunas fall into their own CountryGroup automatically,
// no code change needed when that day comes.
export function groupCitiesByRegion(cities: City[], metaByCityId: Map<string, RegionMeta>): CountryGroup[] {
  const byCountry = new Map<string, CountryGroup>();

  for (const city of cities) {
    const meta = metaByCityId.get(city.id);
    const country = meta?.country ?? "otro";
    if (!byCountry.has(country)) byCountry.set(country, { country, regions: [], ungrouped: [] });
    const group = byCountry.get(country)!;

    if (!meta || meta.adminRegionName === null || meta.adminRegionOrder === null) {
      group.ungrouped.push(city);
      continue;
    }

    let region = group.regions.find((r) => r.adminRegionName === meta.adminRegionName);
    if (!region) {
      region = {
        adminRegionName: meta.adminRegionName,
        adminRegionOrder: meta.adminRegionOrder,
        adminRegionNumeral: meta.adminRegionNumeral,
        cities: [],
      };
      group.regions.push(region);
    }
    region.cities.push(city);
  }

  for (const group of byCountry.values()) {
    group.regions.sort((a, b) => a.adminRegionOrder - b.adminRegionOrder);
    for (const region of group.regions) {
      region.cities.sort((a, b) => a.name.localeCompare(b.name, "es"));
    }
    group.ungrouped.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  return [...byCountry.values()];
}
