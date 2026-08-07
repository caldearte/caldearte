"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import CalendarView from "./CalendarView";
import { getCookie, CITY_COOKIE, FAMILY_MODE_COOKIE, TODAY_FILTER_COOKIE, VIGENTES_FILTER_COOKIE, PRECISE_CITY_COOKIE, GEO_CONSENT_COOKIE } from "@/lib/cookies";
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
  return [CITY_COOKIE, FAMILY_MODE_COOKIE, TODAY_FILTER_COOKIE, VIGENTES_FILTER_COOKIE, PRECISE_CITY_COOKIE, GEO_CONSENT_COOKIE].some(
    (name) => getCookie(name) !== undefined,
  );
}

export default function HomeClient({ initialModel }: HomeClientProps) {
  const searchParams = useSearchParams();
  const [model, setModel] = useState(initialModel);

  async function refresh() {
    const qs = new URLSearchParams();
    const semana = searchParams.get("semana");
    const newsletter = searchParams.get("newsletter");
    if (semana) qs.set("semana", semana);
    if (newsletter) qs.set("newsletter", newsletter);
    try {
      const res = await fetch(`/api/home-data${qs.toString() ? `?${qs}` : ""}`);
      if (!res.ok) return;
      setModel(await res.json());
    } catch {
      // Network hiccup — the visitor keeps seeing whatever model is
      // already on screen (the cached default, or their last-fetched
      // personalized view); not worth surfacing an error for this.
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

  return <CalendarView {...model} onRefreshNeeded={refresh} />;
}
