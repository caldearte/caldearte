"use client";

import { useState } from "react";
import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { WEEK_ONE_MONDAY, addWeeks, fmtMonthYear, fmtWeekLabel, monthWeekStarts, parseDateOnly, toDateOnlyString, todayInSantiago } from "@/lib/date";
import HeadingDropdown from "./HeadingDropdown";

interface WeekDropdownProps {
  rangeStart: string; // Monday of the week being viewed
  currentWeekStart: string; // Monday of the real current week
}

const WEEKDAY_INITIALS = ["L", "M", "M", "J", "V", "S", "D"];
// How far ahead the calendar goes: discovery runs on Sundays, so beyond a
// couple of months out there's essentially nothing to show.
const MONTHS_AHEAD = 2;

interface Month {
  year: number;
  month: number; // 0-based
}

function monthOf(dateStr: string): Month {
  const d = parseDateOnly(dateStr);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function shiftMonth({ year, month }: Month, delta: number): Month {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function monthIndex({ year, month }: Month): number {
  return year * 12 + month;
}

function daysOfWeek(monday: string): Date[] {
  const start = parseDateOnly(monday);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

// The week as part of the h1 (2026-10-12): "[Esta semana ⌄] en Santiago"
// opens a month calendar where each row is a whole week, Monday to Sunday
// (Daniel's call — you pick a week, not a day), replacing the prev/next
// chevrons and the "SEMANA N°X" label. Each row is a real ?semana= link,
// same navigation (and same HomeClient fetch + loading state) as before.
export default function WeekDropdown({ rangeStart, currentWeekStart }: WeekDropdownProps) {
  const label = fmtWeekLabel(rangeStart, currentWeekStart);
  return (
    <HeadingDropdown label={label} ariaLabel={esCL.home.weekDropdownAriaLabel(label)} listAriaLabel={esCL.home.weekListAriaLabel}>
      {(close) => <WeekCalendar rangeStart={rangeStart} currentWeekStart={currentWeekStart} onPick={close} />}
    </HeadingDropdown>
  );
}

function WeekCalendar({ rangeStart, currentWeekStart, onPick }: { rangeStart: string; currentWeekStart: string; onPick: () => void }) {
  const [shown, setShown] = useState(() => monthOf(rangeStart));
  const today = todayInSantiago();
  const earliest = monthOf(WEEK_ONE_MONDAY);
  const latest = shiftMonth(monthOf(currentWeekStart), MONTHS_AHEAD);
  const canPrev = monthIndex(shown) > monthIndex(earliest);
  const canNext = monthIndex(shown) < monthIndex(latest);
  const lastSelectable = addWeeks(currentWeekStart, MONTHS_AHEAD * 5);

  function pick() {
    onPick();
    // The whole page below is about to change — start it from the top,
    // same as a región change (CalendarView.goToRegion).
    window.scrollTo(0, 0);
  }

  const arrow =
    "size-[32px] flex items-center justify-center rounded-full font-geist text-[20px] text-text-primary cursor-pointer hover:bg-surface-sage disabled:opacity-25 disabled:cursor-default";

  return (
    <div className="px-[10px] pt-[4px] pb-[8px]">
      <div className="flex items-center justify-between mb-[6px]">
        <button type="button" aria-label={esCL.home.prevMonthAriaLabel} disabled={!canPrev} onClick={() => setShown((m) => shiftMonth(m, -1))} className={arrow}>
          ‹
        </button>
        <p className="font-lato font-black text-[16px] text-text-primary first-letter:uppercase">{fmtMonthYear(shown.year, shown.month)}</p>
        <button type="button" aria-label={esCL.home.nextMonthAriaLabel} disabled={!canNext} onClick={() => setShown((m) => shiftMonth(m, 1))} className={arrow}>
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 px-[6px] pb-[4px]" aria-hidden="true">
        {WEEKDAY_INITIALS.map((d, i) => (
          <span key={i} className="text-center font-geist text-[11px] text-text-secondary">
            {d}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-[2px]">
        {monthWeekStarts(shown.year, shown.month).map((monday) => {
          const selectable = monday >= WEEK_ONE_MONDAY && monday <= lastSelectable;
          const selected = monday === rangeStart;
          const isCurrent = monday === currentWeekStart;
          const days = (
            <span className="grid grid-cols-7 w-full">
              {daysOfWeek(monday).map((d) => {
                const iso = toDateOnlyString(d);
                const outside = d.getMonth() !== shown.month;
                const isToday = iso === today;
                return (
                  <span
                    key={iso}
                    className={`text-center font-geist text-[14px] py-[7px] ${outside && !selected ? "opacity-40" : ""} ${isToday ? "font-bold" : ""} ${
                      isToday && !selected ? "text-brand-magenta" : ""
                    }`}
                  >
                    {d.getDate()}
                  </span>
                );
              })}
            </span>
          );
          // Before Caldearte existed (SEMANA N°1) or too far ahead: shown
          // for the calendar's shape, not pickable.
          if (!selectable) {
            return (
              <span key={monday} className="flex px-[6px] rounded-full text-text-secondary opacity-40">
                {days}
              </span>
            );
          }
          return (
            <Link
              key={monday}
              href={`/?semana=${monday}`}
              scroll={false}
              role="option"
              aria-selected={selected}
              aria-label={fmtWeekLabel(monday, currentWeekStart)}
              onClick={pick}
              className={`flex px-[6px] rounded-full ${
                selected ? "bg-text-primary text-surface-sage" : `text-text-primary hover:bg-surface-sage ${isCurrent ? "ring-1 ring-inset ring-text-primary/30" : ""}`
              }`}
            >
              {days}
            </Link>
          );
        })}
      </div>

      {rangeStart !== currentWeekStart && (
        <Link
          href={`/?semana=${currentWeekStart}`}
          scroll={false}
          onClick={pick}
          className="block mt-[8px] text-center font-fragment-mono text-[13px] text-brand-magenta underline"
        >
          {esCL.home.backToCurrentWeek}
        </Link>
      )}
    </div>
  );
}
