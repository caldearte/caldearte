"use client";

import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { fmtWeekLabel, fmtWeekRangeShort, weekBoundsInSantiago, weekOptions } from "@/lib/date";
import HeadingDropdown, { DROPDOWN_ROW } from "./HeadingDropdown";

interface WeekDropdownProps {
  rangeStart: string; // Monday of the week being viewed
  currentWeekStart: string; // Monday of the real current week
}

// The week as part of the h1 (2026-10-12, Daniel's idea): "[Esta semana ⌄]
// en Santiago" opens "Próxima semana / Esta semana / Semana pasada /
// Semana del 28 de septiembre…", replacing the prev/next chevrons and the
// "SEMANA N°X" label. Each option is a real ?semana= link, same navigation
// (and same HomeClient fetch + loading state) the chevrons used.
export default function WeekDropdown({ rangeStart, currentWeekStart }: WeekDropdownProps) {
  const label = fmtWeekLabel(rangeStart, currentWeekStart);

  return (
    <HeadingDropdown label={label} ariaLabel={esCL.home.weekDropdownAriaLabel(label)} listAriaLabel={esCL.home.weekListAriaLabel}>
      {(close) =>
        weekOptions(currentWeekStart, rangeStart).map((week) => {
          const selected = week === rangeStart;
          return (
            <Link
              key={week}
              href={`/?semana=${week}`}
              scroll={false}
              role="option"
              aria-selected={selected}
              onClick={close}
              className={`${DROPDOWN_ROW} ${selected ? "font-semibold bg-surface-sage" : ""} text-text-primary`}
            >
              <span>{fmtWeekLabel(week, currentWeekStart)}</span>
              <span className="font-fragment-mono text-[12px] text-text-secondary whitespace-nowrap">{fmtWeekRangeShort(week, weekBoundsInSantiago(week).end)}</span>
            </Link>
          );
        })
      }
    </HeadingDropdown>
  );
}
