import Link from "next/link";
import { fmtWeekRange } from "@/lib/date";
import { esCL } from "@/i18n/es-CL";
import type { RegionMeta } from "@/lib/events";
import type { CityCounts } from "@/lib/event-utils";
import EventPageCityPicker from "./EventPageCityPicker";

interface EventPageTopNavProps {
  weekNumber: number;
  rangeStart: string;
  rangeEnd: string;
  prevWeekHref: string;
  nextWeekHref: string;
  regionId: string;
  regionName: string;
  actualCityId: string | null;
  hasPreciseLocation: boolean;
  cityCounts: Record<string, CityCounts>;
  cityNames: Record<string, string>;
  regions: RegionMeta[];
}

// The same SEMANA Nº / city pill / week-prev-next block Header.tsx shows
// in the home page's own hero (per the user 2026-08-06: "quiero que sea
// este... quizas una version un poco mas compacta para el top nav
// sticky") — same three pieces, sized down to actually fit a sticky nav
// bar instead of a full hero. Week prev/next here can't just change a
// query param in place like Header.tsx's own links do (there's no
// calendar data on this page to re-render) — they redirect through
// api/eventos/go-to-city, same mechanism EventPageCityPicker's own región
// switch already uses, just varying `semana` instead of `regionId`.
export default function EventPageTopNav({
  weekNumber,
  rangeStart,
  rangeEnd,
  prevWeekHref,
  nextWeekHref,
  regionId,
  regionName,
  actualCityId,
  hasPreciseLocation,
  cityCounts,
  cityNames,
  regions,
}: EventPageTopNavProps) {
  return (
    <div className="flex flex-col items-end gap-[4px]">
      <p className="font-fragment-mono text-[11px] text-border-default tracking-[-0.4px] whitespace-nowrap">{esCL.weekNumberLabel(weekNumber)}</p>
      <EventPageCityPicker
        regionId={regionId}
        regionName={regionName}
        actualCityId={actualCityId}
        hasPreciseLocation={hasPreciseLocation}
        cityCounts={cityCounts}
        cityNames={cityNames}
        regions={regions}
        semana={rangeStart}
        compact
      />
      <div className="flex items-center gap-[6px]">
        {/* Hidden at SEMANA N°1 — same epoch-week rule as Header.tsx's own
            prev arrow (weekNumberSince clamps to 1, no earlier week
            exists). */}
        {weekNumber > 1 && (
          <Link href={prevWeekHref} aria-label={esCL.prevWeekAriaLabel} className="inline-flex shrink-0 cursor-pointer">
            {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
            <img src="/icons/chevron-right.svg" alt="" width={6} height={11} className="rotate-180" />
          </Link>
        )}
        <span className="font-fragment-mono text-[12px] text-border-default tracking-[-0.4px] whitespace-nowrap">
          {fmtWeekRange(rangeStart, rangeEnd)}
        </span>
        <Link href={nextWeekHref} aria-label={esCL.nextWeekAriaLabel} className="inline-flex shrink-0 cursor-pointer">
          {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
          <img src="/icons/chevron-right.svg" alt="" width={6} height={11} />
        </Link>
      </div>
    </div>
  );
}
