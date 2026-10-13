"use client";

import { esCL } from "@/i18n/es-CL";
import { useEffect, useRef, useState } from "react";
import { allAdminRegions, regionIdFromAdminRegionName, searchRegions } from "@/lib/cities";
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
}

// The región as part of the h1 itself (2026-10-12): "en [Santiago ⌄]"
// opens a plain list of Chile's regions — Daniel's call after a row of 16
// chips proved to be a lot of chrome. Replaces the old "SANTIAGO, CHILE ⌄"
// button + full-screen panel, which visitors weren't finding. North to
// south, regions with something this week first (with their count,
// magenta dot = inauguraciones or visitas guiadas), the quiet ones after,
// dimmed; a search box on top filters them by región or comuna.
export default function RegionDropdown({
  regionName,
  regions,
  regionId,
  regionActivity,
  hasPreciseLocation,
  locating,
  onSelectRegion,
  onUseMyLocation,
}: RegionDropdownProps) {
  return (
    <HeadingDropdown
      label={locating ? esCL.home.locating : regionName}
      ariaLabel={esCL.home.regionDropdownAriaLabel(regionName)}
      listAriaLabel={esCL.home.regionsNavAriaLabel}
      align="right"
    >
      {(close) => (
        <RegionList
          regions={regions}
          regionId={regionId}
          regionActivity={regionActivity}
          hasPreciseLocation={hasPreciseLocation}
          locating={locating}
          onSelectRegion={(id) => {
            close();
            onSelectRegion(id);
          }}
          onUseMyLocation={() => {
            close();
            onUseMyLocation();
          }}
        />
      )}
    </HeadingDropdown>
  );
}

// Mounted only while the dropdown is open, so the search box starts empty
// every time.
function RegionList({
  regions,
  regionId,
  regionActivity,
  hasPreciseLocation,
  locating,
  onSelectRegion,
  onUseMyLocation,
}: Omit<RegionDropdownProps, "regionName">) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Desktop: straight into the box. Not on a phone — the keyboard would
  // cover the list before the visitor decided to search at all.
  useEffect(() => {
    if (window.matchMedia("(min-width: 640px)").matches) inputRef.current?.focus();
  }, []);

  // Search box (2026-10-12, replacing the "Buscar comuna" jump to the old
  // full-screen picker): filters this same list by región or comuna name,
  // always listing the región — "villa alemana" leaves just Valparaíso,
  // with the comuna shown next to it as the reason.
  const matches = searchRegions(regions, query);
  const searching = query.trim() !== "";
  const items = allAdminRegions(regions)
    .map((r) => {
      const id = regionIdFromAdminRegionName(r.adminRegionName);
      return { regionId: id, name: shortRegionName(r.adminRegionName), activity: regionActivity[id] ?? null, comunas: matches.get(id) ?? [] };
    })
    .filter((i) => !searching || matches.has(i.regionId));
  // The selected región stays with the active ones even on an empty week.
  const active = items.filter((i) => i.activity !== null || i.regionId === regionId);
  const quiet = items.filter((i) => i.activity === null && i.regionId !== regionId);

  function comunaHint(comunas: string[]) {
    if (comunas.length === 0) return null;
    const shown = comunas.slice(0, 2).join(", ") + (comunas.length > 2 ? "…" : "");
    return <span className="truncate text-[13px] text-text-secondary">{shown}</span>;
  }

  return (
    <>
      <div className="flex items-center gap-[10px] px-[14px] pb-[6px] pt-[2px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- existing icon asset */}
        <img src="/icons/search.svg" alt="" width={15} height={15} />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter picks the only match, if there's exactly one.
            if (e.key === "Enter" && searching && items.length === 1) onSelectRegion(items[0].regionId);
          }}
          placeholder={esCL.home.searchRegionPlaceholder}
          aria-label={esCL.home.searchRegionPlaceholder}
          className="flex-1 min-w-0 h-[36px] bg-transparent font-geist text-[16px] text-text-primary placeholder:text-text-secondary focus:outline-none"
        />
      </div>
      <div className="mb-[6px] border-t border-text-primary/10" />

      {searching && items.length === 0 && <p className="px-[14px] py-[10px] font-geist text-[14px] text-text-secondary">{esCL.home.searchRegionNoResults(query.trim())}</p>}

      {active.map((item) => {
        const selected = item.regionId === regionId;
        return (
          <button
            key={item.regionId}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onSelectRegion(item.regionId)}
            className={`${DROPDOWN_ROW} ${selected ? "font-semibold text-text-primary bg-surface-sage" : "text-text-primary"}`}
          >
            <span className="flex items-center gap-[8px] min-w-0">
              <span className="shrink-0">{item.name}</span>
              {item.activity && item.activity.agenda > 0 && (
                <span title={esCL.home.agendaDotTitle(item.activity.agenda)} className="inline-block size-[7px] rounded-full bg-brand-magenta shrink-0" />
              )}
              {comunaHint(item.comunas)}
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
              onClick={() => onSelectRegion(item.regionId)}
              className={`${DROPDOWN_ROW} justify-start text-text-secondary`}
            >
              <span className="shrink-0">{item.name}</span>
              {comunaHint(item.comunas)}
            </button>
          ))}
        </>
      )}
      {!hasPreciseLocation && !searching && (
        <>
          <div className="my-[6px] border-t border-text-primary/10" />
          <button type="button" onClick={onUseMyLocation} disabled={locating} className={`${DROPDOWN_ROW} justify-start text-text-primary`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- existing icon asset */}
            <img src="/icons/location-pin.svg" alt="" width={12} height={15} />
            {locating ? esCL.home.locating : esCL.home.useMyLocation}
          </button>
        </>
      )}
    </>
  );
}
