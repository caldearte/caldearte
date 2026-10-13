"use client";

import { esCL } from "@/i18n/es-CL";
import { allAdminRegions, regionIdFromAdminRegionName } from "@/lib/cities";
import { shortRegionName } from "@/lib/regionNames";
import type { RegionActivity } from "@/lib/event-utils";
import type { RegionMeta } from "@/lib/events";
import HeadingDropdown, { DROPDOWN_ROW } from "./HeadingDropdown";

interface RegionDropdownProps {
  regionName: string;
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

// The región as part of the h1 itself (2026-10-12): "en [Santiago ⌄]"
// opens a plain list of Chile's regions — Daniel's call after a row of 16
// chips proved to be a lot of chrome. Replaces the old "SANTIAGO, CHILE ⌄"
// button + full-screen panel, which visitors weren't finding. North to
// south, regions with something this week first (with their count,
// magenta dot = inauguraciones or visitas guiadas), the quiet ones after,
// dimmed.
export default function RegionDropdown({
  regionName,
  regions,
  regionId,
  regionActivity,
  hasPreciseLocation,
  locating,
  onSelectRegion,
  onUseMyLocation,
  onOpenComunaSearch,
}: RegionDropdownProps) {
  const items = allAdminRegions(regions).map((r) => {
    const id = regionIdFromAdminRegionName(r.adminRegionName);
    return { regionId: id, name: shortRegionName(r.adminRegionName), activity: regionActivity[id] ?? null };
  });
  // The selected región stays with the active ones even on an empty week.
  const active = items.filter((i) => i.activity !== null || i.regionId === regionId);
  const quiet = items.filter((i) => i.activity === null && i.regionId !== regionId);

  return (
    <HeadingDropdown
      label={locating ? esCL.home.locating : regionName}
      ariaLabel={esCL.home.regionDropdownAriaLabel(regionName)}
      listAriaLabel={esCL.home.regionsNavAriaLabel}
    >
      {(close) => (
        <>
          <button
            type="button"
            onClick={() => {
              close();
              onOpenComunaSearch();
            }}
            className={`${DROPDOWN_ROW} justify-start text-text-primary`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- existing icon asset */}
            <img src="/icons/search.svg" alt="" width={15} height={15} />
            {esCL.home.searchComuna}
          </button>
          <div className="my-[6px] border-t border-text-primary/10" />
          {active.map((item) => {
            const selected = item.regionId === regionId;
            return (
              <button
                key={item.regionId}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  close();
                  onSelectRegion(item.regionId);
                }}
                className={`${DROPDOWN_ROW} ${selected ? "font-semibold text-text-primary bg-surface-sage" : "text-text-primary"}`}
              >
                <span className="flex items-center gap-[8px] min-w-0">
                  <span className="truncate">{item.name}</span>
                  {item.activity && item.activity.agenda > 0 && (
                    <span title={esCL.home.agendaDotTitle(item.activity.agenda)} className="inline-block size-[7px] rounded-full bg-brand-magenta shrink-0" />
                  )}
                </span>
                {item.activity && <span className="text-[13px] text-text-secondary">{item.activity.total}</span>}
              </button>
            );
          })}
          {quiet.length > 0 && (
            <>
              <p className="px-[14px] pt-[10px] pb-[4px] font-geist text-[11px] tracking-[1.5px] uppercase text-text-secondary">{esCL.home.quietRegionTitle}</p>
              {quiet.map((item) => (
                <button
                  key={item.regionId}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    close();
                    onSelectRegion(item.regionId);
                  }}
                  className={`${DROPDOWN_ROW} text-text-secondary`}
                >
                  {item.name}
                </button>
              ))}
            </>
          )}
          {!hasPreciseLocation && (
            <>
              <div className="my-[6px] border-t border-text-primary/10" />
              <button
                type="button"
                onClick={() => {
                  close();
                  onUseMyLocation();
                }}
                disabled={locating}
                className={`${DROPDOWN_ROW} justify-start text-text-primary`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- existing icon asset */}
                <img src="/icons/location-pin.svg" alt="" width={12} height={15} />
                {locating ? esCL.home.locating : esCL.home.useMyLocation}
              </button>
            </>
          )}
        </>
      )}
    </HeadingDropdown>
  );
}
