"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { esCL } from "@/i18n/es-CL";
import { cityById } from "@/lib/cities";
import { CITY_COOKIE, PRECISE_CITY_COOKIE, setCookie } from "@/lib/cookies";
import { requestPreciseCityId } from "@/lib/geolocation";
import type { RegionMeta } from "@/lib/events";

interface GeoLocationChangedBannerProps {
  hasPreciseLocation: boolean; // gate: only silently re-check once we've ever gotten a real reading before (permission is already granted, no prompt fires)
  actualCityId: string | null; // the last known reading (page.tsx) — what a fresh check gets compared against
  cityNames: Record<string, string>;
  regions: RegionMeta[];
}

// Silent background re-check, once per real page load — not a forced
// refresh (real feedback 2026-07-30: "menos invasivo no forzar
// refrescar"). If the freshly-detected comuna differs from what the
// server last used, surfaces a small prompt instead of silently swapping
// content out from under the visitor. Declining still quietly updates
// the cached reading (so the same move doesn't keep re-prompting every
// load) without touching what's currently shown.
export default function GeoLocationChangedBanner({ hasPreciseLocation, actualCityId, cityNames, regions }: GeoLocationChangedBannerProps) {
  const router = useRouter();
  const [detectedCityId, setDetectedCityId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!hasPreciseLocation) return;
    requestPreciseCityId(regions, (id) => {
      setCookie(PRECISE_CITY_COOKIE, id);
      if (id !== actualCityId) setDetectedCityId(id);
    });
    // Runs once per mount (a real page load) — not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!detectedCityId || dismissed) return null;

  function accept() {
    setCookie(CITY_COOKIE, detectedCityId!);
    setDismissed(true);
    router.refresh();
  }

  const city = cityById(detectedCityId, cityNames);

  return (
    <div className="w-full bg-picker-subtle border border-picker-border px-4 py-5 md:px-6 mt-[50px] md:mt-[60px] mb-6 rounded-xl flex flex-col md:flex-row md:items-center gap-4">
      <p className="flex-grow text-sm md:text-base font-medium text-heading-gray">{esCL.geoLocationChangedPrompt(city.name)}</p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setDismissed(true)}
          className="text-sm font-medium text-muted-gray px-4 py-2 rounded-full hover:bg-stone-200"
        >
          {esCL.geoLocationChangedDecline}
        </button>
        <button onClick={accept} className="text-sm font-semibold bg-heading-gray text-white rounded-full px-5 py-2">
          {esCL.geoLocationChangedAccept}
        </button>
      </div>
    </div>
  );
}
