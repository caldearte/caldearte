import { unstable_cache } from "next/cache";
import type { Database } from "@caldearte/shared-types";
import { getSupabaseClient } from "./supabase-client";
import type { EventDates } from "./date";

export interface EventRecord extends EventDates {
  id: string;
  title: string;
  artist: string | null;
  description: string | null;
  freeformLocation: string;
  placeName: string | null;
  // Real street address, when known — NEVER displayed (the site's short
  // "Venue, Comuna" convention is unchanged, see freeformLocation/placeName
  // above); used only to build a more accurate "Cómo llegar" Google Maps
  // link (useEventCardActions.ts's mapsQuery). Added 2026-09-05 after two
  // real users were sent to the wrong physical location by a Maps
  // text-search on placeName + comuna alone (Galería Malva/Casa Portugal,
  // LINIA Galería — see supabase/migrations/20260905120000_add_event_address.sql).
  address: string | null;
  regionName: string | null;
  imageUrl: string | null;
  sensitivityTags: string[];
  sourceUrl: string | null;
  // false only when openingDatetime is a real, confirmed-date-but-unknown-
  // hour placeholder (midnight Santiago time) — see
  // apps/curator/src/lib/opening-time.ts's OpeningTimeResult. Meaningless
  // when openingDatetime is null. EventCardBase uses this to avoid
  // displaying a fabricated hour.
  openingTimeConfirmed: boolean;
  // 3 interaction categories (Daniel, 2026-08-29) — see
  // apps/curator/src/lib/curation-policy.ts's EVENT_TYPE_POLICY for the
  // full editorial definitions. Drives which of CalendarView's 3 sections
  // an event surfaces under (InauguracionesSection/VisitasGuiadasSection/
  // ExposicionesSection, see event-utils.ts's splitByInteractionType).
  eventType: "inauguracion" | "visita_guiada" | "exposicion";
}

// Postgres views don't propagate the underlying table's NOT NULL
// constraints, so the generated type marks every column nullable — these
// are genuinely guaranteed non-null on the real `events` table (id/title
// from their column definitions, freeform_location per
// supabase/migrations/20260713180000_retire_venues_and_event_crawler.sql,
// sensitivity_tags defaults to '{}' and is declared not null,
// opening_time_confirmed defaults to true and is declared not null).
type EventRow = Omit<
  Database["public"]["Views"]["events_public"]["Row"],
  "id" | "title" | "freeform_location" | "sensitivity_tags" | "opening_time_confirmed" | "event_type"
> & {
  id: string;
  title: string;
  freeform_location: string;
  sensitivity_tags: string[];
  opening_time_confirmed: boolean;
  event_type: "inauguracion" | "visita_guiada" | "exposicion";
};

// Same nullable-view-type caveat — id/name/country are genuinely not null
// on the real `regions` table.
type RegionRow = Omit<Database["public"]["Views"]["regions_public"]["Row"], "id" | "name" | "country"> & {
  id: string;
  name: string;
  country: string;
};

function toEventRecord(row: EventRow, regionNameById: Map<string, string>): EventRecord {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    description: row.description,
    freeformLocation: row.freeform_location,
    placeName: row.place_name,
    address: row.address,
    regionName: row.region_id ? (regionNameById.get(row.region_id) ?? null) : null,
    imageUrl: row.image_url,
    openingDatetime: row.opening_datetime,
    runStartDate: row.run_start_date,
    runEndDate: row.run_end_date,
    sensitivityTags: row.sensitivity_tags,
    sourceUrl: row.source_url,
    openingTimeConfirmed: row.opening_time_confirmed,
    eventType: row.event_type,
  };
}

// One row per comuna (see cities.ts's header comment on the `regions`
// table's naming) — admin_region_name/admin_region_order are the Chilean
// administrative macro-region (I-XVI, Región Metropolitana) and its
// geographic north-to-south rank (RM sits at position 7, between V
// Valparaíso and VI O'Higgins — its real geographic slot, NOT its roman
// numeral); admin_region_numeral is the separate, non-geographic official
// numbering shown as a pill in the city picker ("II", "V", "RM", "XV"...).
// All three nullable so a future country's comunas can be seeded before
// this data exists for them (see groupCitiesByRegion in cities.ts for the
// fallback this enables). lat/lng are the comuna's approximate populated-
// center coordinates (not survey-precise boundaries) — used by cities.ts's
// nearestCityIdByCoords for coordinate-based geo matching (see
// supabase/migrations/20260730005132_backfill_region_coordinates.sql).
// Nullable because a handful of comunas (any newly seeded before a
// coordinate backfill runs) may not have them yet.
export interface RegionMeta {
  id: string;
  name: string;
  country: string;
  adminRegionName: string | null;
  adminRegionOrder: number | null;
  adminRegionNumeral: string | null;
  lat: number | null;
  lng: number | null;
}

// Reads go through events_public/regions_public, not the base tables
// directly — see supabase/migrations/20260717050000_restrict_public_columns_via_views.sql.
// anon has no grant at all on the base `events`/`regions` tables anymore;
// the views bake in the curation_status='approved' filter and expose only
// the columns the frontend actually needs, keeping internal pipeline
// columns (curation_reasoning, regions.status/exclusion_reason/etc.) out
// of what's queryable via the (necessarily public) anon key. `regions` is
// fetched in full (not just the subset referenced by events) so the city
// picker can group EVERY comuna with events by its macro-región, not only
// ones that happen to also appear in regionNameById.
//
// Doesn't depend on the visitor's city/week cookie — only the filtering
// callers do afterwards — so it's wrapped in unstable_cache (was 60s,
// bumped to 600s 2026-08-28 — see the matching comment on
// `revalidate` in app/page.tsx, same real incident) instead of
// re-hitting Supabase on every request. Every page that reads events
// (home, /eventos/[id], sitemap, go-to-city) shares this one cache entry.
// No client argument — always the same anon
// singleton (getSupabaseClient()), keeping this cacheable without needing
// to serialize a client object into the cache key.
async function fetchApprovedEventsFromDb(): Promise<{ events: EventRecord[]; regions: RegionMeta[] }> {
  const client = getSupabaseClient();
  const [eventsRes, regionsRes] = await Promise.all([
    client.from("events_public").select("*"),
    client.from("regions_public").select("*"),
  ]);
  if (eventsRes.error) {
    throw new Error(`Failed to fetch events: ${eventsRes.error.message}`);
  }
  if (regionsRes.error) {
    throw new Error(`Failed to fetch regions: ${regionsRes.error.message}`);
  }
  // Same nullable-view-type caveat as EventRow above — id/name/country are
  // genuinely not null on the real `regions` table.
  const regionRows = (regionsRes.data ?? []) as RegionRow[];
  const regionNameById = new Map(regionRows.map((r) => [r.id, r.name]));
  const regions: RegionMeta[] = regionRows.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    adminRegionName: r.admin_region_name,
    adminRegionOrder: r.admin_region_order,
    adminRegionNumeral: r.admin_region_numeral,
    lat: r.lat,
    lng: r.lng,
  }));
  const eventRows = (eventsRes.data ?? []) as EventRow[];
  return { events: eventRows.map((row) => toEventRecord(row, regionNameById)), regions };
}

// Tagged so an admin mutation (Quitar / marcar sensible) can force-refresh
// this cache on demand via revalidateTag instead of waiting out the full
// 600s window — see api/admin/remove-event and api/admin/toggle-sensitive,
// which call revalidateTag(APPROVED_EVENTS_CACHE_TAG) after a successful
// write. Real gap found in a 2026-08-30 architecture review: with no
// on-demand revalidation anywhere, a moderator's removal of a sensitive/
// wrong event could stay publicly visible for up to ~20 minutes (this
// cache's own 600s plus the page's independent revalidate=600).
export const APPROVED_EVENTS_CACHE_TAG = "approved-events";

export const fetchApprovedEvents = unstable_cache(fetchApprovedEventsFromDb, ["approved-events-and-regions"], {
  revalidate: 600,
  tags: [APPROVED_EVENTS_CACHE_TAG],
});
