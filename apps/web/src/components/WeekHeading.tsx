"use client";

import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { fmtWeekRangeShort } from "@/lib/date";

interface WeekHeadingProps {
  regionName: string;
  rangeStart: string;
  rangeEnd: string;
  isCurrentWeek: boolean;
  currentWeekHref: string;
  weekNumber: number;
  prevWeekHref: string;
  nextWeekHref: string;
  isRefreshing: boolean;
}

// "Marching dashes" loading bar — replaces the week chevrons while
// HomeClient's fetch is in flight (real report 2026-08-15: without it a
// week change felt "stuck").
function WeekNavLoadingBar() {
  return (
    <div
      role="status"
      aria-label={esCL.weekLoadingAriaLabel}
      className="w-[96px] h-[3px] rounded-full animate-week-nav-dashes"
      style={{
        backgroundImage: "repeating-linear-gradient(90deg, var(--color-brand-magenta) 0 10px, transparent 10px 18px)",
        backgroundSize: "18px 100%",
      }}
    />
  );
}

const chevronClass = "inline-flex shrink-0 items-center justify-center size-[32px] rounded-full border border-text-primary/30 cursor-pointer hover:bg-surface-white";

// The page's h1 (2026-10-12) — "Esta semana en Santiago", or just the
// región on any other week — with the week chevrons under it: what used
// to be spread across "SEMANA N°X", the location button and a separate
// range line.
export default function WeekHeading({
  regionName,
  rangeStart,
  rangeEnd,
  isCurrentWeek,
  currentWeekHref,
  weekNumber,
  prevWeekHref,
  nextWeekHref,
  isRefreshing,
}: WeekHeadingProps) {
  return (
    <div className="pt-[20px] md:pt-[28px]">
      <h1 className="font-lato font-black leading-[1.05] text-[30px] md:text-[44px] text-text-primary">
        {isCurrentWeek ? esCL.home.weekHeading(regionName) : regionName}
      </h1>
      <div className="flex items-center gap-[8px] h-[40px] mt-[6px]">
        {isRefreshing ? (
          <WeekNavLoadingBar />
        ) : (
          <>
            {/* No earlier week than SEMANA N°1 (lunes 27 de julio de
                2026, see weekNumberSince in lib/date.ts) — Caldearte
                didn't exist before it. */}
            {weekNumber > 1 && (
              <Link href={prevWeekHref} aria-label={esCL.prevWeekAriaLabel} scroll={false} className={chevronClass}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
                <img src="/icons/chevron-right.svg" alt="" width={6} height={12} className="rotate-180" />
              </Link>
            )}
            <span className="font-fragment-mono text-[15px] text-text-primary whitespace-nowrap">{fmtWeekRangeShort(rangeStart, rangeEnd)}</span>
            <Link href={nextWeekHref} aria-label={esCL.nextWeekAriaLabel} scroll={false} className={chevronClass}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img src="/icons/chevron-right.svg" alt="" width={6} height={12} />
            </Link>
            {!isCurrentWeek && (
              <Link href={currentWeekHref} scroll={false} className="ml-[8px] font-fragment-mono text-[13px] text-brand-magenta underline whitespace-nowrap">
                {esCL.home.backToCurrentWeek}
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
