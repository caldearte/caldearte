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
  // Where it sits when stuck, not where it's slid to: near the page's end
  // the bar slides away on scroll-down, and the line must not move with it.
  const line = bar
    ? Math.max(bar.getBoundingClientRect().bottom, parseFloat(getComputedStyle(bar).top) + bar.offsetHeight)
    : 104;
  // A part counts as reached well before its top meets the line: the
  // section links land each part at its scroll-margin (200px), below the
  // bar, and a real smooth scroll can stop short of that by 50-100px
  // (Daniel, 2026-10-13) — the part landed on must read as the active one.
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

const REACH_SLACK = 120;

// A section link's own pick (Daniel, 2026-10-13: click "Curatoría" and
// the bar still read "EL ARTE MÁS CERCA" — the smooth scroll lands a bit
// short of where the geometry above calls it reached). Where you asked to
// go is where you are until you scroll by hand.
let pinned: HomeSection | null = null;
const subscribers = new Set<() => void>();

export function pinHomeSection(section: HomeSection) {
  pinned = section;
  subscribers.forEach((notify) => notify());
}

function unpin() {
  if (pinned === null) return;
  pinned = null;
  subscribers.forEach((notify) => notify());
}

export function useHomeSection(): HomeSection {
  const [section, setSection] = useState<HomeSection>("destacado");
  useEffect(() => {
    function update() {
      setSection(pinned ?? currentSection());
    }
    update();
    subscribers.add(update);
    // Hand-driven scrolling: wheel/trackpad, touch, keys, the scrollbar.
    const handEvents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    handEvents.forEach((type) => window.addEventListener(type, unpin, { passive: true }));
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // The sticky bar tightens once stuck (a 300ms transition) and moves
    // everything below it with no scroll event — re-check when it settles.
    const bar = document.querySelector<HTMLElement>("[data-week-bar]");
    bar?.addEventListener("transitionend", update);
    return () => {
      subscribers.delete(update);
      handEvents.forEach((type) => window.removeEventListener(type, unpin));
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      bar?.removeEventListener("transitionend", update);
    };
  }, []);
  return section;
}
