import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseClient } from "@/lib/supabase-client";
import { fetchApprovedEvents, filterFamilyMode, filterActiveInRange, filterByCity, splitInauguracionesYExpos } from "@/lib/events";
import { currentWeekInSantiago, weekBoundsInSantiago, todayInSantiago } from "@/lib/date";
import { CITY_COOKIE, FAMILY_MODE_COOKIE, TODAY_FILTER_COOKIE } from "@/lib/cookies";

// The event detail page's own city picker AND week prev/next arrows
// (EventPageCityPicker.tsx / EventPageTopNav.tsx) hit this via a real
// navigation (window.location.href / <Link>, not fetch) — a plain GET
// redirect is the simplest way to (a) set CITY_COOKIE server-side and
// (b) land on the right city+week's own first "exposición actual", since
// the client has no per-city/week event-list data to compute that from
// itself without shipping the whole dataset down. Mirrors app/page.tsx's
// own city+week list computation (lib/cityPickerContext.ts) so this lands
// on exactly the same first event the visitor would see by picking that
// city/week on the home page and looking at "Exposiciones actuales".
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const cityId = searchParams.get("cityId")?.trim();
  if (!cityId) {
    return NextResponse.redirect(new URL("/", origin));
  }
  // Same fallback rule as app/page.tsx's own ?semana= handling — any
  // malformed/missing value falls back to the real current week rather
  // than erroring.
  const semana = searchParams.get("semana") ?? "";
  const { start: rangeStart, end: rangeEnd } = /^\d{4}-\d{2}-\d{2}$/.test(semana) ? weekBoundsInSantiago(semana) : currentWeekInSantiago();

  const cookieStore = await cookies();
  const familyModeCookie = cookieStore.get(FAMILY_MODE_COOKIE)?.value;
  const familyMode = familyModeCookie === undefined ? true : Boolean(familyModeCookie);
  const todayFilterOn = Boolean(cookieStore.get(TODAY_FILTER_COOKIE)?.value);
  const today = todayInSantiago();

  const { events: allEvents } = await fetchApprovedEvents(getSupabaseClient());
  const visible = filterFamilyMode(allEvents, familyMode);
  const activeInRange = filterActiveInRange(visible, rangeStart, rangeEnd);
  const cityEventsInRange = filterByCity(activeInRange, cityId);
  // Only exposActuales decides the redirect target — list mode is always
  // scoped to Exposiciones (see EventDetailCard's own comment), Vigentes
  // never narrows that list (it only hides already-opened inauguraciones,
  // see filterUpcomingInauguraciones's own doc comment) so it's irrelevant
  // here.
  const split = splitInauguracionesYExpos(cityEventsInRange, rangeStart, rangeEnd);
  const exposActualesForCity = todayFilterOn ? filterActiveInRange(split.exposActuales, today, today) : split.exposActuales;

  const firstEvent = exposActualesForCity[0];
  const redirectUrl = firstEvent ? new URL(`/eventos/${firstEvent.id}?semana=${rangeStart}`, origin) : new URL("/", origin);

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(CITY_COOKIE, cityId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  return response;
}
