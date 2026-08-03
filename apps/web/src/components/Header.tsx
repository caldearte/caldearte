"use client";

import Link from "next/link";
import type { RefObject } from "react";
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

  return (
    <header className="sticky top-0 z-20 bg-surface-white">
      {/* top nav — Buscar + Menú only, right-aligned. Modo familiar and the
          city picker both live elsewhere now (FiltersSection / hero). */}
      <div className="flex items-center justify-end gap-[10px] px-[15px] md:px-[60px] py-[15px] md:py-[30px]">
        <button onClick={onOpenSearch} aria-label={esCL.searchAriaLabel}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
          <img src="/icons/search.svg" alt="" width={24} height={24} />
        </button>
        <button onClick={onOpenMenu} aria-label={esCL.menu}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
          <img src="/icons/hamburger.svg" alt="" width={24} height={24} />
        </button>
      </div>

      {/* hero — wordmark + tagline (left), location + week nav (right) */}
      <div className="flex flex-col md:flex-row gap-8 md:gap-[120px] items-start md:items-end justify-center pb-8 md:pb-[110px] px-4 md:px-[80px]">
        <div className="flex-1 flex flex-col gap-[10px]">
          <h1 className="font-lato font-black leading-none text-brand-magenta text-[48px] md:text-[96px]">
            <span className="block">{esCL.wordmarkLine1}</span>
            <span className="block">{esCL.wordmarkLine2}</span>
          </h1>
          <p className="font-geist font-semibold text-[15px] text-text-secondary tracking-[2px]">{esCL.heroTagline}</p>
        </div>

        <div className="flex flex-col items-center gap-[11px]">
          <p className="font-fragment-mono text-[20px] text-text-primary tracking-[-0.84px]">{esCL.weekNumberLabel(weekNumber)}</p>

          <button
            ref={cityPickerTriggerRef}
            onClick={onOpenCityPicker}
            className="flex items-center gap-[9px] border border-text-primary rounded-input px-[16px] py-[29px] text-text-primary"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
            <img src="/icons/location-pin.svg" alt="" width={22} height={22} className="shrink-0" />
            <span className="font-fragment-mono text-[22px] whitespace-nowrap">{city.name.toUpperCase()}, CHILE</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
            <img src="/icons/chevron-right.svg" alt="" width={20} height={20} className="rotate-90 shrink-0" />
          </button>

          <div className="flex items-center gap-[9px]">
            <Link href={prevWeekHref} aria-label={esCL.prevWeekAriaLabel} scroll={false}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img src="/icons/chevron-right.svg" alt="" width={20} height={20} className="rotate-180" />
            </Link>
            <span className="font-fragment-mono text-[20px] text-text-primary tracking-[-0.84px] whitespace-nowrap">{weekRangeLabel}</span>
            <Link href={nextWeekHref} aria-label={esCL.nextWeekAriaLabel} scroll={false}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img src="/icons/chevron-right.svg" alt="" width={20} height={20} />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
