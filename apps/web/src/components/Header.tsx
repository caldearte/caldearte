"use client";

import type { RefObject } from "react";
import { esCL } from "@/i18n/es-CL";
import type { City } from "@/lib/cities";
import { fmtWeekHeader } from "@/lib/date";

interface HeaderProps {
  city: City;
  rangeStart: string; // YYYY-MM-DD — the current week's Monday
  rangeEnd: string; // YYYY-MM-DD — the current week's Sunday
  todayFilterOn: boolean; // Filtros "Hoy" pill — swaps the summary line's "Esta semana" lead-in for "Hoy"
  inauguracionesCount: number;
  exposCount: number;
  onOpenCityPicker: () => void;
  cityPickerTriggerRef: RefObject<HTMLButtonElement | null>;
  onOpenSearch: () => void;
  onOpenMenu: () => void;
}

function SearchGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <line x1="16.2" y1="16.2" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Header({
  city,
  rangeStart,
  rangeEnd,
  todayFilterOn,
  inauguracionesCount,
  exposCount,
  onOpenCityPicker,
  cityPickerTriggerRef,
  onOpenSearch,
  onOpenMenu,
}: HeaderProps) {
  const dateLabel = fmtWeekHeader(rangeStart, rangeEnd);
  // "Hoy" pill on -> lead with "Hoy" instead of "Esta semana", matching
  // what's actually shown (the lists are narrowed to today already).
  const summaryPrefix = todayFilterOn ? esCL.filterToday : esCL.thisWeekPrefix;

  return (
    <header className="sticky top-0 z-20 bg-white pt-2 pb-3 -mt-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-2xl md:text-5xl font-normal text-heading-gray">{esCL.appName}</span>
          <span className="hidden md:inline text-5xl font-extrabold text-heading-gray">{dateLabel}</span>
        </div>

        {/* Buscar + Menú only — Modo familiar moved into FiltersSection,
            shown below the header on every screen size now. */}
        <div className="hidden md:flex items-center gap-4 text-[15px] text-heading-gray shrink-0 pt-2">
          <button onClick={onOpenSearch} aria-label={esCL.searchAriaLabel} className="text-heading-gray">
            <SearchGlyph />
          </button>
          <button onClick={onOpenMenu} aria-label={esCL.menu} className="flex items-center gap-1.5 text-heading-gray">
            <span className="text-xl leading-none">☰</span>
            <span>{esCL.menu}</span>
          </button>
        </div>

        <div className="md:hidden flex items-center gap-4 shrink-0">
          <button onClick={onOpenSearch} aria-label={esCL.searchAriaLabel} className="text-heading-gray">
            <SearchGlyph />
          </button>
          <button onClick={onOpenMenu} className="text-heading-gray text-2xl leading-none" aria-label={esCL.menu}>
            ☰
          </button>
        </div>
      </div>

      <div className="mt-3 md:mt-4 flex items-center gap-2 flex-wrap text-[15px] md:text-xl text-heading-gray">
        <span className="md:hidden">
          {summaryPrefix} {esCL.headerSummaryMobile(exposCount)}
        </span>
        <span className="hidden md:inline">
          {summaryPrefix} {esCL.headerSummary(inauguracionesCount, exposCount)}
        </span>
        <button
          ref={cityPickerTriggerRef}
          onClick={onOpenCityPicker}
          className="inline-flex items-center gap-1.5 bg-city-pill-bg text-city-pill-fg rounded-lg px-3 py-1.5 text-sm"
        >
          {city.name}
          {/* eslint-disable-next-line @next/next/no-img-element -- provided icon asset, verbatim per design decision */}
          <img src="/icons/chevron-down.svg" alt="" width={16} height={16} />
        </button>
      </div>
    </header>
  );
}
