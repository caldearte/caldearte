"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import CalendarView from "./CalendarView";
import { getCookie, REGION_COOKIE, FAMILY_MODE_COOKIE, TODAY_FILTER_COOKIE, VIGENTES_FILTER_COOKIE, PRECISE_CITY_COOKIE, GEO_CONSENT_COOKIE } from "@/lib/cookies";
import type { HomeViewModel } from "@/lib/homeViewModel";

interface HomeClientProps {
  // The cached default view page.tsx already rendered (Santiago, current
  // week, family mode on) — shown immediately, no loading state, since
  // it's already real, valid content, not a placeholder.
  initialModel: HomeViewModel;
}

// Any of these present means the visitor's real state might differ from
// the default page.tsx baked in — worth the extra fetch. A genuinely
// fresh visitor (no cookies at all, no URL params) matches the default
// exactly, so skips the fetch entirely — the common case for new organic
// traffic stays a single cached response, no origin round-trip at all.
function hasPersonalizationSignal(searchParams: URLSearchParams): boolean {
  if (searchParams.get("semana") || searchParams.get("newsletter")) return true;
  return [REGION_COOKIE, FAMILY_MODE_COOKIE, TODAY_FILTER_COOKIE, VIGENTES_FILTER_COOKIE, PRECISE_CITY_COOKIE, GEO_CONSENT_COOKIE].some(
    (name) => getCookie(name) !== undefined,
  );
}

export default function HomeClient({ initialModel }: HomeClientProps) {
  const searchParams = useSearchParams();
  const [model, setModel] = useState(initialModel);
  // Independent of the personalization fetch below (page.tsx's cached
  // default always starts this false — see its own comment) — a
  // genuinely fresh visitor has NO cookies at all, so
  // hasPersonalizationSignal never fires and `refresh()` never runs;
  // this still needs to show the prompt for them. Runs once on mount,
  // reading the real cookie directly rather than waiting on any fetch.
  const [showGeoConsentPrompt, setShowGeoConsentPrompt] = useState(false);
  // Surfaced to Header via CalendarView — the week chevrons themselves
  // resolve almost instantly (same-route search-param change, no real
  // RSC round-trip since page.tsx never reads searchParams), so without
  // this the actual latency here — this fetch — was invisible, felt
  // "stuck" (real user report, 2026-08-15).
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Rapid back-to-back navigations (tap prev then next quickly) fire
  // overlapping fetches — without this, an older response resolving
  // AFTER a newer one would silently stomp fresh data with stale data.
  // Each refresh() call claims the next id; only the response matching
  // the LATEST claimed id is allowed to setModel.
  const latestRequestId = useRef(0);

  // On a fast connection/local Supabase, the fetch can resolve in well
  // under 500ms — too quick to actually register as "something is
  // happening" (real user report, 2026-08-15, after the loading bar
  // itself already shipped). Keeps the bar visible for at least this
  // long regardless of how fast the real fetch was.
  const MIN_LOADING_MS = 500;

  async function refresh() {
    const requestId = ++latestRequestId.current;
    const startedAt = Date.now();
    const qs = new URLSearchParams();
    const semana = searchParams.get("semana");
    const newsletter = searchParams.get("newsletter");
    if (semana) qs.set("semana", semana);
    if (newsletter) qs.set("newsletter", newsletter);
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/home-data${qs.toString() ? `?${qs}` : ""}`);
      if (!res.ok) return;
      const data = await res.json();
      if (requestId === latestRequestId.current) setModel(data);
    } catch {
      // Network hiccup — the visitor keeps seeing whatever model is
      // already on screen (the cached default, or their last-fetched
      // personalized view); not worth surfacing an error for this.
    } finally {
      if (requestId === latestRequestId.current) {
        const remaining = MIN_LOADING_MS - (Date.now() - startedAt);
        if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
        if (requestId === latestRequestId.current) setIsRefreshing(false);
      }
    }
  }

  // This IS the fetch, the whole point of this component (see the file's
  // own top comment) — the setState happens after a real network
  // round-trip, not synchronously. Deliberately depends only on
  // searchParams, not `refresh` itself — only ever wants to run once per
  // real navigation, not on every render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    if (hasPersonalizationSignal(searchParams)) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [searchParams]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only real-cookie check, see comment above
    if (getCookie(GEO_CONSENT_COOKIE) === undefined) setShowGeoConsentPrompt(true);
  }, []);

  return <CalendarView {...model} showGeoConsentPrompt={showGeoConsentPrompt} onRefreshNeeded={refresh} isRefreshing={isRefreshing} />;
}
