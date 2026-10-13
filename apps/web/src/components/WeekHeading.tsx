"use client";

import { useEffect, useState, type ReactNode } from "react";
import { esCL } from "@/i18n/es-CL";
import WeekDropdown from "./WeekDropdown";

interface WeekHeadingProps {
  // The región, as a control (RegionDropdown) — it sits inside the h1.
  regionControl: ReactNode;
  rangeStart: string; // Monday of the week being viewed
  currentWeekStart: string; // Monday of the real current week
  isRefreshing: boolean;
}

// Scroll thresholds for the stuck state — two of them (hysteresis) so the
// bar's own height change can't make it flicker at the edge.
const STICK_AT = 60;
const UNSTICK_AT = 20;
// Px of scroll in one direction before the bar hides/reappears, so a
// trackpad's jitter doesn't toggle it.
const DIRECTION_THRESHOLD = 6;

// Sticky-bar behavior (2026-10-12, Daniel): `stuck` once the page has
// scrolled (tighter padding; the tagline hides on a phone); `hidden` only from the venue section
// (#espacios-section) down — past the event data, scrolling down slides
// the bar away and scrolling up brings it back.
function useStickyBar(): { stuck: boolean; hidden: boolean } {
  const [stuck, setStuck] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Cheap enough to run on every scroll event (one rect read, setState
    // bails out when nothing changed) — no rAF batching needed.
    let last = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      setStuck((s) => (s ? y > UNSTICK_AT : y > STICK_AT));
      const tail = document.getElementById("espacios-section");
      const inTail = tail !== null && tail.getBoundingClientRect().top < window.innerHeight * 0.6;
      if (!inTail) setHidden(false);
      else if (y > last + DIRECTION_THRESHOLD) setHidden(true);
      else if (y < last - DIRECTION_THRESHOLD) setHidden(false);
      if (Math.abs(y - last) > DIRECTION_THRESHOLD || !inTail) last = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return { stuck, hidden };
}

// "Marching dashes" loading bar under the h1 while HomeClient's fetch is
// in flight (real report 2026-08-15: without it a week or región change
// felt "stuck").
function LoadingBar() {
  return (
    <div
      role="status"
      aria-label={esCL.weekLoadingAriaLabel}
      className="absolute left-[16px] md:left-[24px] xl:left-[40px] bottom-[4px] w-[96px] h-[3px] rounded-full animate-week-nav-dashes"
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
// Sticky under the top bar (Daniel, 2026-10-12): the whole page is this
// week + región's data, so the control to change it stays at hand. It
// bleeds to the page edges (-mx) so content scrolls cleanly beneath it;
// z-30 keeps it under the top bar (z-40), which is what it slides behind
// when hidden.
export default function WeekHeading({ regionControl, rangeStart, currentWeekStart, isRefreshing }: WeekHeadingProps) {
  const { stuck, hidden } = useStickyBar();

  return (
    <div
      className={`sticky top-[84px] md:top-[104px] z-30 -mx-[16px] md:-mx-[24px] xl:-mx-[40px] px-[16px] md:px-[24px] xl:px-[40px] bg-surface-sage transition-[transform,padding] duration-300 ${
        stuck ? "py-[10px] border-b border-text-primary/10" : "pt-[20px] md:pt-[28px] pb-[16px]"
      } ${hidden ? "-translate-y-full pointer-events-none" : ""}`}
    >
      {/* "EL ARTE MÁS CERCA." left, the week/región selector right
          (Daniel's layout, 2026-10-13); stacked on a phone, where the
          tagline steps aside once the bar is stuck so it stays one row. */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-[10px] md:gap-[24px]">
        <p className={`font-lato font-black uppercase leading-[1.1] text-text-primary text-[22px] md:text-[32px] ${stuck ? "max-md:hidden" : ""}`}>
          {esCL.home.tagline}
        </p>
        <h1 className="flex flex-wrap items-center gap-x-[8px] md:gap-x-[10px] gap-y-[6px] font-lato font-black leading-[1.15] text-text-primary text-[20px] md:text-[32px]">
          <WeekDropdown rangeStart={rangeStart} currentWeekStart={currentWeekStart} />
          <span>{esCL.home.weekRegionJoiner}</span>
          {regionControl}
        </h1>
      </div>
      {isRefreshing && <LoadingBar />}
    </div>
  );
}
