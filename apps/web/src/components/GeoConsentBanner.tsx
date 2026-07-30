"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { esCL } from "@/i18n/es-CL";
import { nearestCityIdByCoords } from "@/lib/cities";
import { CITY_COOKIE, GEO_CONSENT_COOKIE, setCookie } from "@/lib/cookies";
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
        if (id) setCookie(CITY_COOKIE, id);
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
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-30 bg-white border border-picker-border rounded-xl shadow-lg p-4 flex flex-col gap-3">
      <p className="text-sm text-heading-gray">{esCL.geoConsentPrompt}</p>
      <div className="flex items-center justify-end gap-2">
        <button onClick={decline} className="text-sm text-muted-gray px-3 py-1.5 rounded-full hover:bg-stone-100">
          {esCL.geoConsentDecline}
        </button>
        <button
          onClick={accept}
          disabled={requesting}
          className="text-sm bg-heading-gray text-white rounded-full px-4 py-1.5 disabled:opacity-60"
        >
          {requesting ? esCL.cityPickerLocatingExact : esCL.geoConsentAccept}
        </button>
      </div>
    </div>
  );
}
