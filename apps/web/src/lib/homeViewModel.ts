import { fetchApprovedEvents } from "@/lib/events";
import type { EventRecord, RegionMeta } from "@/lib/events";
import {
  filterFamilyMode,
  filterByRegion,
  filterActiveInRange,
  splitInauguracionesYExpos,
  filterUpcomingInauguraciones,
  filterUpcomingVisitasGuiadas,
  findNextEvent,
  type CityCounts,
} from "@/lib/event-utils";
import { buildRegionMetaByCityId, adminRegionNameByRegionId } from "@/lib/cities";
import { resolveCityPickerContext, type CookieReader } from "@/lib/cityPickerContext";
import { todayInSantiago, currentWeekInSantiago, weekBoundsInSantiago, addWeeks, weekNumberSince, isCurrentOrUpcoming } from "@/lib/date";
import { FAMILY_MODE_COOKIE, TODAY_FILTER_COOKIE, VIGENTES_FILTER_COOKIE, GEO_CONSENT_COOKIE } from "@/lib/cookies";
import type { NewsletterStatus } from "@/components/NewsletterStatusModal";

const NEWSLETTER_STATUSES: NewsletterStatus[] = ["confirmed", "already_confirmed", "unsubscribed", "already_unsubscribed", "invalid", "error"];

export interface HomeViewModel {
  inauguraciones: EventRecord[];
  visitasGuiadas: EventRecord[];
  exposActuales: EventRecord[];
  // The site's own selection unit — see cities.ts's "Región-level
  // selection" section. cityId/cityNames below stay comuna-level, only
  // for deriving each event's own comuna label and for geo resolution.
  regionId: string;
  cityId: string;
  actualCityId: string | null;
  hasPreciseLocation: boolean;
  showGeoConsentPrompt: boolean;
  cityNames: Record<string, string>;
  familyMode: boolean;
  todayFilterOn: boolean;
  vigentesFilterOn: boolean;
  today: string;
  rangeStart: string;
  rangeEnd: string;
  weekNumber: number;
  prevWeekHref: string;
  nextWeekHref: string;
  cityCounts: Record<string, CityCounts>;
  // Chile-wide totals for the SAME week + Hoy/Vigentes filter state as
  // inauguraciones/exposActuales above — the "de X" comparison next to
  // the región's own count in Header's ring indicators. Deliberately NOT
  // cityCounts' own full-week (filter-unaffected) totals summed — that
  // would compare a filtered región count against an unfiltered national
  // one, an apples-to-oranges ratio.
  chileInauguracionesCount: number;
  chileVisitasGuiadasCount: number;
  chileExposActualesCount: number;
  cityThumbnails: Record<string, EventRecord[]>;
  searchableEvents: EventRecord[];
  nextEvent: EventRecord | null;
  regions: RegionMeta[];
  newsletterStatus: NewsletterStatus | null;
}

// The home page's full view, extracted from app/page.tsx (2026-08-06) so
// it can be computed twice with different inputs: once with an EMPTY
// cookie/header reader for a cacheable default (page.tsx itself, which
// must not call cookies()/headers()/searchParams to stay cache-eligible —
// see that file's own comment), and once with the visitor's REAL cookies
// via /api/home-data, called client-side (HomeClient.tsx) only when the
// visitor's actual preferences differ from the default. This two-tier
// split is the fix for a real Fast Origin Transfer spike (2026-08-06):
// reading cookies() in a Server Component forces Next.js to render that
// page fresh on every single request, which was costing real transfer at
// real traffic volume — see docs/architecture.md.
export async function computeHomeViewModel({
  cookieStore,
  headerStore,
  semana,
  newsletter,
}: {
  cookieStore: CookieReader;
  headerStore: Headers;
  semana?: string;
  newsletter?: string;
}): Promise<HomeViewModel> {
  const newsletterStatus: NewsletterStatus | null = NEWSLETTER_STATUSES.includes(newsletter as NewsletterStatus) ? (newsletter as NewsletterStatus) : null;

  const familyModeCookie = cookieStore.get(FAMILY_MODE_COOKIE)?.value;
  const familyMode = familyModeCookie === undefined ? true : Boolean(familyModeCookie);
  const todayFilterOn = Boolean(cookieStore.get(TODAY_FILTER_COOKIE)?.value);
  const vigentesFilterOn = Boolean(cookieStore.get(VIGENTES_FILTER_COOKIE)?.value);
  const today = todayInSantiago();

  const { start: rangeStart, end: rangeEnd } = /^\d{4}-\d{2}-\d{2}$/.test(semana ?? "") ? weekBoundsInSantiago(semana!) : currentWeekInSantiago();
  const weekNumber = weekNumberSince(rangeStart);
  const prevWeekHref = `/?semana=${addWeeks(rangeStart, -1)}`;
  const nextWeekHref = `/?semana=${addWeeks(rangeStart, 1)}`;

  const { events: allEvents, regions } = await fetchApprovedEvents();
  const visible = filterFamilyMode(allEvents, familyMode);
  const searchableEvents = visible.filter((e) => isCurrentOrUpcoming(e, today));

  const { regionId, cityId, cityNames, cityCounts, cityThumbnails, actualCityId, hasPreciseLocation, activeInRange } = await resolveCityPickerContext({
    cookieStore,
    headerStore,
    allEvents,
    regions,
    rangeStart,
    rangeEnd,
    familyMode,
  });

  const showGeoConsentPrompt = cookieStore.get(GEO_CONSENT_COOKIE) === undefined;

  const metaByCityId = buildRegionMetaByCityId(regions);
  const adminRegionName = adminRegionNameByRegionId(regions).get(regionId) ?? regionId;

  const cityEventsInRange = filterByRegion(activeInRange, adminRegionName, metaByCityId);
  const split = splitInauguracionesYExpos(cityEventsInRange, rangeStart, rangeEnd);
  const inauguracionesForCity = todayFilterOn ? filterActiveInRange(split.inauguraciones, today, today) : split.inauguraciones;
  const visitasGuiadasForCity = todayFilterOn ? filterActiveInRange(split.visitasGuiadas, today, today) : split.visitasGuiadas;
  const exposActualesForCity = todayFilterOn ? filterActiveInRange(split.exposActuales, today, today) : split.exposActuales;
  const inauguraciones = vigentesFilterOn ? filterUpcomingInauguraciones(inauguracionesForCity, today) : inauguracionesForCity;
  const visitasGuiadas = vigentesFilterOn ? filterUpcomingVisitasGuiadas(visitasGuiadasForCity, today) : visitasGuiadasForCity;
  const exposActuales = exposActualesForCity;

  // Same split + same Hoy/Vigentes filter chain as the región's own
  // inauguraciones/visitasGuiadas/exposActuales above, just over the
  // unfiltered-by-región activeInRange set — the Chile-wide "de X"
  // comparison count.
  const chileSplit = splitInauguracionesYExpos(activeInRange, rangeStart, rangeEnd);
  const chileInauguracionesForFilter = todayFilterOn ? filterActiveInRange(chileSplit.inauguraciones, today, today) : chileSplit.inauguraciones;
  const chileVisitasGuiadasForFilter = todayFilterOn ? filterActiveInRange(chileSplit.visitasGuiadas, today, today) : chileSplit.visitasGuiadas;
  const chileExposActualesForFilter = todayFilterOn ? filterActiveInRange(chileSplit.exposActuales, today, today) : chileSplit.exposActuales;
  const chileInauguracionesCount = (vigentesFilterOn ? filterUpcomingInauguraciones(chileInauguracionesForFilter, today) : chileInauguracionesForFilter).length;
  const chileVisitasGuiadasCount = (vigentesFilterOn ? filterUpcomingVisitasGuiadas(chileVisitasGuiadasForFilter, today) : chileVisitasGuiadasForFilter).length;
  const chileExposActualesCount = chileExposActualesForFilter.length;

  const nextEvent = findNextEvent(filterByRegion(visible, adminRegionName, metaByCityId), today, rangeEnd);

  return {
    inauguraciones,
    visitasGuiadas,
    exposActuales,
    regionId,
    cityId,
    actualCityId,
    hasPreciseLocation,
    showGeoConsentPrompt,
    cityNames,
    familyMode,
    todayFilterOn,
    vigentesFilterOn,
    today,
    rangeStart,
    rangeEnd,
    weekNumber,
    prevWeekHref,
    nextWeekHref,
    cityCounts,
    chileInauguracionesCount,
    chileVisitasGuiadasCount,
    chileExposActualesCount,
    cityThumbnails,
    searchableEvents,
    nextEvent,
    regions,
    newsletterStatus,
  };
}
