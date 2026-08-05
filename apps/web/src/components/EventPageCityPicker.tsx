"use client";

import { useRef, useState } from "react";
import { pushRecentCityId } from "@/lib/cookies";
import { OTHER_CITY } from "@/lib/cities";
import type { CityCounts, RegionMeta } from "@/lib/events";
import CityPickerPanel from "./CityPickerPanel";

interface EventPageCityPickerProps {
  cityId: string;
  cityName: string;
  actualCityId: string | null;
  hasPreciseLocation: boolean;
  cityCounts: Record<string, CityCounts>;
  cityNames: Record<string, string>;
  regions: RegionMeta[];
  // Carried through to the redirect so switching city doesn't silently
  // reset week navigation back to "esta semana" — see
  // app/eventos/[id]/page.tsx's own searchParams handling.
  semana?: string;
  // Smaller pill for EventPageTopNav's stacked week+city block — the
  // plain (non-compact) size matches EventCityLink.tsx's own standalone-
  // mode pill exactly, kept as the default for anywhere else this might
  // be reused.
  compact?: boolean;
}

// List-mode only (EventDetailCard's own listPosition prop gates this) —
// the real 3-step city picker (same CityPickerPanel Header.tsx opens on
// the home page), not EventCityLink.tsx's plain "go to this event's own
// city" pill used in standalone mode. Picking a NEW city here can't just
// router.refresh() in place like CalendarView.tsx's own goToCity does —
// this page has no calendar data of its own to re-render, so it needs a
// real navigation to a DIFFERENT event (that city's own first
// "exposición actual" this week) — see api/eventos/go-to-city/route.ts,
// which computes that target server-side since the client has no
// per-city event-list data to do it from.
export default function EventPageCityPicker({
  cityId,
  cityName,
  actualCityId,
  hasPreciseLocation,
  cityCounts,
  cityNames,
  regions,
  semana,
  compact = false,
}: EventPageCityPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleSelectCity(nextCityId: string) {
    // Same "record the city being LEFT" rule as CalendarView.tsx's own
    // recordDeparture — a self-visit or "otro" is never worth remembering.
    if (nextCityId !== cityId && cityId !== OTHER_CITY.id) pushRecentCityId(cityId);
    const semanaParam = semana ? `&semana=${encodeURIComponent(semana)}` : "";
    window.location.href = `/api/eventos/go-to-city?cityId=${encodeURIComponent(nextCityId)}${semanaParam}`;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-[9px] border border-border-default rounded-[9px] shrink-0 cursor-pointer ${
          compact ? "px-[12px] py-[8px]" : "px-[16px] py-[10px]"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
        <img src="/icons/location-pin.svg" alt="" width={compact ? 10 : 12} height={compact ? 13 : 16} className="shrink-0" />
        <span className={`font-fragment-mono text-border-default uppercase whitespace-nowrap ${compact ? "text-[12px]" : "text-[14px]"}`}>
          {cityName}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
        <img src="/icons/chevron-right.svg" alt="" width={compact ? 6 : 8} height={compact ? 10 : 12} className="shrink-0" />
      </button>

      <CityPickerPanel
        open={open}
        cityId={cityId}
        actualCityId={actualCityId}
        hasPreciseLocation={hasPreciseLocation}
        cityCounts={cityCounts}
        cityNames={cityNames}
        regions={regions}
        onClose={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
        onSelectCity={handleSelectCity}
      />
    </>
  );
}
