"use client";

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
  // which these chips don't show).
  onOpenComunaSearch: () => void;
}

// Regions always visible as chips (2026-10-12), replacing the single
// "SANTIAGO, CHILE ⌄" button that hid the other 15 behind a full-screen
// panel — Daniel's read was that visitors weren't finding other regions
// at all. Same chips on every screen: one sticky, horizontally scrolling
// row on a phone, wrapping rows on desktop. Comuna search first, then the
// regions north to south (the row is NOT auto-scrolled to the selected
// one — that hid the search chip; the h1 already names the región); regions with nothing this week go last, dimmed,
// so the row reads as "where there's art" rather than a list of zeros.
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
  const items = allAdminRegions(regions).map((r) => {
    const id = regionIdFromAdminRegionName(r.adminRegionName);
    return { regionId: id, name: shortRegionName(r.adminRegionName), activity: regionActivity[id] ?? null };
  });
  // The selected región stays with the active ones even on an empty week,
  // so the visitor can always see where they are.
  const active = items.filter((i) => i.activity !== null || i.regionId === regionId);
  const quiet = items.filter((i) => i.activity === null && i.regionId !== regionId);

  const chip = "shrink-0 flex items-center gap-[6px] h-[34px] px-[12px] rounded-full font-geist text-[13px] whitespace-nowrap cursor-pointer";

  return (
    <nav
      aria-label={esCL.home.regionsNavAriaLabel}
      className="sticky md:static top-[52px] z-30 -mx-[20px] md:mx-0 mt-[16px] bg-surface-sage border-b md:border-b-0 border-text-primary/10"
    >
      <div className="flex md:flex-wrap gap-[8px] overflow-x-auto md:overflow-visible px-[20px] md:px-0 py-[10px] md:py-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" onClick={onOpenComunaSearch} className={`${chip} border border-text-primary/40 text-text-primary hover:bg-surface-white`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- existing icon asset */}
          <img src="/icons/search.svg" alt="" width={13} height={13} />
          {esCL.home.searchComuna}
        </button>
        {active.map((item) => {
          const selected = item.regionId === regionId;
          return (
            <button
              key={item.regionId}
              type="button"
              aria-current={selected ? "page" : undefined}
              onClick={() => onSelectRegion(item.regionId)}
              className={`${chip} ${selected ? "bg-text-primary text-surface-sage font-semibold" : "bg-surface-white text-text-primary hover:outline hover:outline-1 hover:outline-text-primary/30"}`}
            >
              {item.name}
              {item.activity && <span className={selected ? "text-surface-sage/70" : "text-text-secondary"}>{item.activity.total}</span>}
              {item.activity && item.activity.agenda > 0 && (
                <span title={esCL.home.agendaDotTitle(item.activity.agenda)} className="inline-block size-[7px] rounded-full bg-brand-magenta shrink-0" />
              )}
            </button>
          );
        })}
        {quiet.map((item) => (
          <button
            key={item.regionId}
            type="button"
            title={esCL.home.quietRegionTitle}
            onClick={() => onSelectRegion(item.regionId)}
            className={`${chip} border border-text-primary/15 text-text-secondary hover:bg-surface-white`}
          >
            {item.name}
          </button>
        ))}
        {!hasPreciseLocation && (
          <button type="button" onClick={onUseMyLocation} disabled={locating} className={`${chip} border border-dashed border-text-primary/40 text-text-primary hover:bg-surface-white`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- existing icon asset */}
            <img src="/icons/location-pin.svg" alt="" width={10} height={13} />
            {locating ? esCL.home.locating : esCL.home.useMyLocation}
          </button>
        )}
      </div>
    </nav>
  );
}
