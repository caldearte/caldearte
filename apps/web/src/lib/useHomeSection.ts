"use client";

import { useEffect, useState } from "react";

// Which part of the home is being read (2026-10-13) — shared by the sticky
// week/región bar's left label (WeekHeading) and the top bar's section
// links (Header), so both always agree.
//   destacado — above the Curatoría banner (the week's agenda)
//   curatoria / ultimos / aun / guia — the last element marked
//     data-sticky-section="…" whose top has reached the sticky bar
export type HomeSection = "destacado" | "curatoria" | "ultimos" | "aun" | "guia";

// Next keeps a previously visited page mounted but hidden, so the same
// markers can exist twice — only the copy actually laid out counts.
function visible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function currentSection(): HomeSection {
  // The line things are "under": the sticky bar's bottom edge (marked
  // data-week-bar), or just below the fixed top bar if it isn't there.
  const bar = [...document.querySelectorAll<HTMLElement>("[data-week-bar]")].find(visible);
  const line = bar ? bar.getBoundingClientRect().bottom : 104;
  // A part counts as reached a little before its top meets the line: the
  // section links land each part at its scroll-margin (200px), just below
  // the bar, and that part has to read as the active one.
  const reached = line + REACH_SLACK;
  const markers = [...document.querySelectorAll<HTMLElement>("[data-sticky-section]")].filter(visible);
  // The last part reached stays current through the air before the next
  // one, so the label and link don't blink off between sections.
  let current: HomeSection = "destacado";
  for (const el of markers) {
    if (el.getBoundingClientRect().top <= reached) current = el.dataset.stickySection as HomeSection;
  }
  return current;
}

const REACH_SLACK = 48;

export function useHomeSection(): HomeSection {
  const [section, setSection] = useState<HomeSection>("destacado");
  useEffect(() => {
    function update() {
      setSection(currentSection());
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return section;
}
