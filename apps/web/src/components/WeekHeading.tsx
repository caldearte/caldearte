"use client";

import type { ReactNode } from "react";
import { esCL } from "@/i18n/es-CL";
import WeekDropdown from "./WeekDropdown";

interface WeekHeadingProps {
  // The región, as a control (RegionDropdown) — it sits inside the h1.
  regionControl: ReactNode;
  rangeStart: string; // Monday of the week being viewed
  currentWeekStart: string; // Monday of the real current week
  isRefreshing: boolean;
}

// "Marching dashes" loading bar under the h1 while HomeClient's fetch is
// in flight (real report 2026-08-15: without it a week or región change
// felt "stuck").
function LoadingBar() {
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

// The page's h1 (2026-10-12): "[Esta semana ⌄] en [Santiago ⌄]" — both the
// week and the región are dropdowns inside the sentence (WeekDropdown,
// RegionDropdown), replacing "SEMANA N°X", the location button, the week
// chevrons and the range line that used to be spread around the hero.
export default function WeekHeading({ regionControl, rangeStart, currentWeekStart, isRefreshing }: WeekHeadingProps) {
  return (
    <div className="pt-[20px] md:pt-[28px]">
      <h1 className="font-lato font-black leading-[1.15] text-[30px] md:text-[44px] text-text-primary">
        <WeekDropdown rangeStart={rangeStart} currentWeekStart={currentWeekStart} /> {esCL.home.weekRegionJoiner} {regionControl}
      </h1>
      <div className="h-[12px] mt-[10px] flex items-center">{isRefreshing && <LoadingBar />}</div>
    </div>
  );
}
