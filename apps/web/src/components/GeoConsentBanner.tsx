"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { esCL } from "@/i18n/es-CL";
import { nearestCityIdByCoords } from "@/lib/cities";
import { CITY_COOKIE, GEO_CONSENT_COOKIE, PRECISE_CITY_COOKIE, setCookie } from "@/lib/cookies";
import type { RegionMeta } from "@/lib/events";

interface GeoConsentBannerProps {
  show: boolean; // page.tsx: true only when GEO_CONSENT_COOKIE is absent — asked at most once, ever
  regions: RegionMeta[];
}

// First-visit prompt, not buried in the city picker — asks up front
// whether to use the visitor's real location. Any outcome (accept,
// decline, or a native browser permission denial/error) sets
// GEO_CONSENT_COOKIE and hides this for good; the picker's own "Usar mi
// ubicación exacta" button (CityPickerPanel) stays available afterward
// for anyone who wants to try again.
//
// Deliberately part of normal page flow, not a floating/fixed overlay —
// real feedback 2026-07-30: a bottom-corner floating card was too easy to
// miss entirely. Rendered above <Header> (CalendarView.tsx), full-width,
// pushing the rest of the page down — meant to be the first thing
// noticed, not something to compete with for attention.
export default function GeoConsentBanner({ show, regions }: GeoConsentBannerProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [requesting, setRequesting] = useState(false);

  if (!show || dismissed) return null;

  function decline() {
    setCookie(GEO_CONSENT_COOKIE, "denied");
    setDismissed(true);
  }

  function accept() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      decline();
      return;
    }
    setRequesting(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const id = nearestCityIdByCoords(position.coords.latitude, position.coords.longitude, regions);
        setCookie(GEO_CONSENT_COOKIE, "granted");
        if (id) {
          setCookie(CITY_COOKIE, id);
          setCookie(PRECISE_CITY_COOKIE, id);
        }
        setDismissed(true);
        router.refresh();
      },
      () => {
        setCookie(GEO_CONSENT_COOKIE, "denied");
        setDismissed(true);
      },
    );
  }

  return (
    <div className="w-full bg-amber-400 px-4 py-5 md:px-6 mb-6 rounded-xl flex flex-col md:flex-row md:items-center gap-4">
      <p className="flex-grow text-sm md:text-base font-medium text-heading-gray">{esCL.geoConsentPrompt}</p>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={decline} className="text-sm font-medium text-heading-gray px-4 py-2 rounded-full hover:bg-amber-300/70">
          {esCL.geoConsentDecline}
        </button>
        <button
          onClick={accept}
          disabled={requesting}
          className="text-sm font-semibold bg-heading-gray text-white rounded-full px-5 py-2 disabled:opacity-60"
        >
          {requesting ? esCL.cityPickerLocatingExact : esCL.geoConsentAccept}
        </button>
      </div>
    </div>
  );
}
