"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import { esCL } from "@/i18n/es-CL";
import type { City } from "@/lib/cities";
import { fmtWeekRange } from "@/lib/date";

interface HeaderProps {
  city: City;
  rangeStart: string; // YYYY-MM-DD — the current week's Monday
  rangeEnd: string; // YYYY-MM-DD — the current week's Sunday
  weekNumber: number; // "SEMANA N°X"
  prevWeekHref: string; // real navigation (URL, not a cookie) — see page.tsx
  nextWeekHref: string;
  onOpenCityPicker: () => void;
  cityPickerTriggerRef: RefObject<HTMLButtonElement | null>;
  onOpenSearch: () => void;
  onOpenMenu: () => void;
}

function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={esCL.searchAriaLabel}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
      <img src="/icons/search.svg" alt="" width={20} height={20} />
    </button>
  );
}

function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={esCL.menu}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
      <img src="/icons/hamburger.svg" alt="" width={22} height={20} />
    </button>
  );
}

// Compact single-line wordmark shown in the top nav only once the full
// hero has scrolled out of view — same font/color as the hero wordmark,
// just small enough to sit in the nav row.
function CompactLogo({ size }: { size: "md" | "sm" }) {
  return (
    <span className={`font-lato font-black leading-none text-brand-magenta ${size === "md" ? "text-[28px]" : "text-[20px]"}`}>
      {esCL.appName}
    </span>
  );
}

function TopNavContent({
  scrolledPastHero,
  onOpenSearch,
  onOpenMenu,
}: {
  scrolledPastHero: boolean;
  onOpenSearch: () => void;
  onOpenMenu: () => void;
}) {
  if (!scrolledPastHero) {
    return (
      <div className="flex items-center justify-end gap-[10px] px-[15px] md:px-[60px] py-[15px] md:py-[20px]">
        <SearchButton onClick={onOpenSearch} />
        <MenuButton onClick={onOpenMenu} />
      </div>
    );
  }
  return (
    <>
      {/* Desktop: logo left, icons right. */}
      <div className="hidden md:flex items-center justify-between px-[60px] py-[20px]">
        <CompactLogo size="md" />
        <div className="flex items-center gap-[10px]">
          <SearchButton onClick={onOpenSearch} />
          <MenuButton onClick={onOpenMenu} />
        </div>
      </div>
      {/* Mobile: search left, logo centered, menu right. */}
      <div className="md:hidden flex items-center justify-between px-[15px] py-[15px]">
        <SearchButton onClick={onOpenSearch} />
        <CompactLogo size="sm" />
        <MenuButton onClick={onOpenMenu} />
      </div>
    </>
  );
}

export default function Header({
  city,
  rangeStart,
  rangeEnd,
  weekNumber,
  prevWeekHref,
  nextWeekHref,
  onOpenCityPicker,
  cityPickerTriggerRef,
  onOpenSearch,
  onOpenMenu,
}: HeaderProps) {
  const weekRangeLabel = fmtWeekRange(rangeStart, rangeEnd);
  const heroRef = useRef<HTMLDivElement>(null);
  // Only the top nav (Buscar/Menú row) is sticky — the hero itself scrolls
  // away normally. Once the hero is fully out of view, the sticky nav
  // shows a small single-line wordmark so there's still a way to tell
  // which site you're on/get back to the top — desktop puts it on the
  // left (icons stay right), mobile centers it between the two icons.
  const [scrolledPastHero, setScrolledPastHero] = useState(false);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const observer = new IntersectionObserver(([entry]) => setScrolledPastHero(!entry.isIntersecting));
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <header>
      {/* `fixed`, not `sticky` — pinned to the viewport regardless of any
          ancestor's containing-block quirks (sticky turned out to silently
          fail to pin here, verified in-browser: the element just scrolled
          away with the page despite correct sticky/top-0 CSS). The content
          row inside is still capped to the page's own 1280px column so the
          icons/logo line up with everything else. A same-markup invisible
          clone directly above the hero reserves the identical amount of
          space in normal flow, so content doesn't jump when this appears. */}
      <div className="fixed top-0 inset-x-0 z-20 bg-surface-sage">
        <div className="max-w-[1280px] mx-auto">
          <TopNavContent scrolledPastHero={scrolledPastHero} onOpenSearch={onOpenSearch} onOpenMenu={onOpenMenu} />
        </div>
      </div>
      <div className="invisible max-w-[1280px] mx-auto" aria-hidden="true">
        <TopNavContent scrolledPastHero={scrolledPastHero} onOpenSearch={() => {}} onOpenMenu={() => {}} />
      </div>

      {/* hero — wordmark + tagline (left), location + week nav (right) */}
      <div
        ref={heroRef}
        className="flex flex-col md:flex-row gap-8 md:gap-[120px] items-start md:items-end justify-center pb-8 md:pb-[110px] px-4 md:px-[80px]"
      >
        <div className="flex-1 flex flex-col gap-[10px]">
          <h1 className="font-lato font-black leading-none text-brand-magenta text-[48px] md:text-[96px]">
            <span className="block">{esCL.wordmarkLine1}</span>
            <span className="block">{esCL.wordmarkLine2}</span>
          </h1>
          {/* Desktop: one line. Mobile: forced onto 3 explicit lines
              (design decision, not natural wrap) — see
              heroTaglineMobileLines. */}
          <p className="hidden md:block font-geist font-semibold text-[15px] text-text-secondary tracking-[2px]">{esCL.heroTagline}</p>
          <p className="md:hidden font-geist font-semibold text-[15px] text-text-secondary tracking-[2px]">
            {esCL.heroTaglineMobileLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
        </div>

        <div className="flex flex-col items-center gap-[11px]">
          {/* Wrapping div left as a plain flex-col (default
              align-items:stretch) so its width == the button's own
              content width, and the p (w-full, text-left) stretches to
              match — that's what pins "SEMANA N°X" to the button's own
              left edge instead of floating centered above it. */}
          <div className="flex flex-col gap-[11px]">
            <p className="w-full text-left font-fragment-mono text-[20px] text-text-primary tracking-[-0.84px]">
              {esCL.weekNumberLabel(weekNumber)}
            </p>

            <button
              ref={cityPickerTriggerRef}
              onClick={onOpenCityPicker}
              className="flex items-center gap-[9px] border border-text-primary rounded-[9px] p-[29px] text-text-primary"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img src="/icons/location-pin.svg" alt="" width={14} height={18} className="shrink-0" />
              <span className="font-fragment-mono text-[22px] whitespace-nowrap">{city.name.toUpperCase()}, CHILE</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img src="/icons/chevron-right.svg" alt="" width={7} height={14} className="rotate-90 shrink-0" />
            </button>
          </div>

          <div className="flex items-center gap-[9px]">
            {/* inline-flex, not the <a> tag's own default — a plain <img>
                inside a bare Next.js Link <a> was measuring 0×0 on mobile
                (verified: naturalWidth/naturalHeight were correct, but the
                <a>'s own box collapsed) — forcing the anchor to size to its
                content regardless of whatever default it'd otherwise get. */}
            <Link href={prevWeekHref} aria-label={esCL.prevWeekAriaLabel} scroll={false} className="inline-flex shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img src="/icons/chevron-right.svg" alt="" width={7} height={14} className="rotate-180" />
            </Link>
            <span className="font-fragment-mono text-[20px] text-text-primary tracking-[-0.84px] whitespace-nowrap">{weekRangeLabel}</span>
            <Link href={nextWeekHref} aria-label={esCL.nextWeekAriaLabel} scroll={false} className="inline-flex shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img src="/icons/chevron-right.svg" alt="" width={7} height={14} />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
