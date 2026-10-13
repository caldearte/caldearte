"use client";

import { useEffect, useRef, useState } from "react";
import { esCL } from "@/i18n/es-CL";
import { allAdminRegions, regionIdFromAdminRegionName } from "@/lib/cities";
import { shortRegionName } from "@/lib/regionNames";
import type { RegionActivity } from "@/lib/event-utils";
import type { RegionMeta } from "@/lib/events";

interface RegionNavProps {
  regions: RegionMeta[];
  regionId: string;
  regionActivity: Record<string, RegionActivity>;
  hasPreciseLocation: boolean;
  locating: boolean;
  onSelectRegion: (regionId: string) => void;
  onUseMyLocation: () => void;
  // Comuna search still lives in CityPickerPanel (it matches comuna names,
  // which this list doesn't show).
  onOpenComunaSearch: () => void;
}

interface RegionItem {
  regionId: string;
  name: string;
  activity: RegionActivity | null;
}

// Regions always visible (2026-10-12), replacing the single "SANTIAGO,
// CHILE ⌄" button that hid the other 15 behind a full-screen panel —
// Daniel's read was that visitors weren't finding other regions at all.
// Desktop: a sticky column left of the content. Mobile: a sticky row of
// chips under the top bar. North to south, as in the picker; regions with
// nothing this week are grouped at the end instead of listed as zeros, so
// the list reads as "where there's art" rather than "where there isn't".
export default function RegionNav({
  regions,
  regionId,
  regionActivity,
  hasPreciseLocation,
  locating,
  onSelectRegion,
  onUseMyLocation,
  onOpenComunaSearch,
}: RegionNavProps) {
  const items: RegionItem[] = allAdminRegions(regions).map((r) => {
    const id = regionIdFromAdminRegionName(r.adminRegionName);
    return { regionId: id, name: shortRegionName(r.adminRegionName), activity: regionActivity[id] ?? null };
  });
  // The selected región stays in the active list even on an empty week,
  // so the visitor can always see where they are.
  const active = items.filter((i) => i.activity !== null || i.regionId === regionId);
  const quiet = items.filter((i) => i.activity === null && i.regionId !== regionId);

  return (
    <>
      <MobileChips
        active={active}
        quiet={quiet}
        regionId={regionId}
        hasPreciseLocation={hasPreciseLocation}
        locating={locating}
        onSelectRegion={onSelectRegion}
        onUseMyLocation={onUseMyLocation}
        onOpenComunaSearch={onOpenComunaSearch}
      />
      <DesktopColumn
        active={active}
        quiet={quiet}
        regionId={regionId}
        hasPreciseLocation={hasPreciseLocation}
        locating={locating}
        onSelectRegion={onSelectRegion}
        onUseMyLocation={onUseMyLocation}
        onOpenComunaSearch={onOpenComunaSearch}
      />
    </>
  );
}

interface PartProps {
  active: RegionItem[];
  quiet: RegionItem[];
  regionId: string;
  hasPreciseLocation: boolean;
  locating: boolean;
  onSelectRegion: (regionId: string) => void;
  onUseMyLocation: () => void;
  onOpenComunaSearch: () => void;
}

// Magenta dot = this región has inauguraciones or visitas guiadas this
// week (the time-bound things worth planning around); the number is every
// distinct event, agenda + cartelera.
function AgendaDot({ agenda }: { agenda: number }) {
  if (agenda === 0) return null;
  return <span title={esCL.home.agendaDotTitle(agenda)} className="inline-block size-[7px] rounded-full bg-brand-magenta shrink-0" />;
}

function MobileChips({ active, quiet, regionId, hasPreciseLocation, locating, onSelectRegion, onUseMyLocation, onOpenComunaSearch }: PartProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Brings the selected chip into view (e.g. Los Lagos, far right) without
  // scrolling the page itself.
  useEffect(() => {
    const chip = selectedRef.current;
    const row = chip?.parentElement;
    if (!chip || !row) return;
    row.scrollLeft = chip.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2;
  }, [regionId]);

  const chipBase = "shrink-0 flex items-center gap-[6px] h-[34px] px-[12px] rounded-full font-geist text-[13px] whitespace-nowrap cursor-pointer";

  return (
    <nav aria-label={esCL.home.regionsNavAriaLabel} className="lg:hidden sticky top-[52px] z-30 -mx-[20px] bg-surface-sage border-b border-text-primary/10">
      <div className="flex gap-[8px] overflow-x-auto px-[20px] py-[10px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {!hasPreciseLocation && (
          <button type="button" onClick={onUseMyLocation} disabled={locating} className={`${chipBase} border border-dashed border-text-primary/50 text-text-primary`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- existing icon asset */}
            <img src="/icons/location-pin.svg" alt="" width={10} height={13} />
            {locating ? esCL.home.locating : esCL.home.useMyLocation}
          </button>
        )}
        {active.map((item) => {
          const selected = item.regionId === regionId;
          return (
            <button
              key={item.regionId}
              ref={selected ? selectedRef : undefined}
              type="button"
              aria-current={selected ? "page" : undefined}
              onClick={() => onSelectRegion(item.regionId)}
              className={`${chipBase} ${selected ? "bg-text-primary text-surface-sage font-semibold" : "bg-surface-white text-text-primary"}`}
            >
              {item.name}
              {item.activity && <span className={selected ? "text-surface-sage/70" : "text-text-secondary"}>{item.activity.total}</span>}
              {item.activity && <AgendaDot agenda={item.activity.agenda} />}
            </button>
          );
        })}
        {quiet.map((item) => (
          <button
            key={item.regionId}
            type="button"
            onClick={() => onSelectRegion(item.regionId)}
            className={`${chipBase} border border-text-primary/15 text-text-secondary`}
          >
            {item.name}
          </button>
        ))}
        <button type="button" onClick={onOpenComunaSearch} className={`${chipBase} border border-text-primary/30 text-text-primary`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- existing icon asset */}
          <img src="/icons/search.svg" alt="" width={13} height={13} />
          {esCL.home.searchComuna}
        </button>
      </div>
    </nav>
  );
}

function DesktopColumn({ active, quiet, regionId, hasPreciseLocation, locating, onSelectRegion, onUseMyLocation, onOpenComunaSearch }: PartProps) {
  const [quietOpen, setQuietOpen] = useState(false);
  const row = "w-full flex items-center justify-between gap-[8px] px-[12px] py-[7px] rounded-input text-left font-geist text-[14px] cursor-pointer";

  return (
    <nav aria-label={esCL.home.regionsNavAriaLabel} className="hidden lg:flex flex-col gap-[4px] sticky top-[84px] self-start max-h-[calc(100vh-100px)] overflow-y-auto pb-6">
      <p className="font-geist font-semibold text-[12px] tracking-[2px] uppercase text-text-secondary px-[12px] mb-[6px]">{esCL.home.regionsTitle}</p>
      {active.map((item) => {
        const selected = item.regionId === regionId;
        return (
          <button
            key={item.regionId}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => onSelectRegion(item.regionId)}
            className={`${row} ${selected ? "bg-text-primary text-surface-sage font-semibold" : "text-text-primary hover:bg-surface-white"}`}
          >
            <span className="flex items-center gap-[8px] min-w-0">
              <span className="truncate">{item.name}</span>
              {item.activity && <AgendaDot agenda={item.activity.agenda} />}
            </span>
            {item.activity && <span className={`text-[13px] ${selected ? "text-surface-sage/70" : "text-text-secondary"}`}>{item.activity.total}</span>}
          </button>
        );
      })}

      {quiet.length > 0 && (
        <div className="mt-[6px]">
          <button
            type="button"
            aria-expanded={quietOpen}
            onClick={() => setQuietOpen((open) => !open)}
            className={`${row} text-text-secondary text-[13px] hover:bg-surface-white`}
          >
            {esCL.home.quietRegions(quiet.length)}
            <span aria-hidden="true" className={`transition-transform ${quietOpen ? "rotate-180" : ""}`}>
              ⌄
            </span>
          </button>
          {quietOpen &&
            quiet.map((item) => (
              <button key={item.regionId} type="button" onClick={() => onSelectRegion(item.regionId)} className={`${row} text-text-secondary hover:bg-surface-white`}>
                {item.name}
              </button>
            ))}
        </div>
      )}

      <div className="mt-[12px] pt-[12px] border-t border-text-primary/15 flex flex-col gap-[2px]">
        {!hasPreciseLocation && (
          <button type="button" onClick={onUseMyLocation} disabled={locating} className={`${row} text-text-primary hover:bg-surface-white justify-start`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- existing icon asset */}
            <img src="/icons/location-pin.svg" alt="" width={11} height={14} />
            {locating ? esCL.home.locating : esCL.home.useMyLocation}
          </button>
        )}
        <button type="button" onClick={onOpenComunaSearch} className={`${row} text-text-primary hover:bg-surface-white justify-start`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- existing icon asset */}
          <img src="/icons/search.svg" alt="" width={14} height={14} />
          {esCL.home.searchComuna}
        </button>
      </div>
    </nav>
  );
}
