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

function visibleOne(selector: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(visible) ?? null;
}

// The stuck bar's padding + bottom border (WeekHeading: py-[10px] +
// border-b) — keep in sync. Its content row is the same height stuck or
// not wherever the section links show (lg+).
const STUCK_CHROME_PX = 21;

// The line things are "under": where the sticky week/región bar (marked
// data-week-bar) ends once stuck — even before it has stuck, and even
// while it has slid away near the page's end — or just below the fixed
// top bar if it isn't there.
function barGeometry(): { line: number; barTop: number; slidAway: boolean; shrinkLeft: number } {
  const bar = visibleOne("[data-week-bar]");
  const row = bar?.firstElementChild;
  if (!bar || !(row instanceof HTMLElement)) return { line: 104, barTop: 104, slidAway: false, shrinkLeft: 0 };
  const stuckHeight = row.offsetHeight + STUCK_CHROME_PX;
  const barTop = parseFloat(getComputedStyle(bar).top);
  return {
    line: barTop + stuckHeight,
    // Where the fixed top bar ends — what's left once the bar slides away.
    barTop,
    slidAway: bar.getBoundingClientRect().bottom <= barTop + 1,
    // Not stuck yet (scrolling from the very top): it's still taller, and
    // everything below moves up by the difference once it sticks.
    shrinkLeft: Math.max(0, bar.offsetHeight - stuckHeight),
  };
}

function currentSection(): HomeSection {
  // A part counts once its top is a little below the line — so a part
  // whose heading is about to slide under the bar already reads as the
  // one you're in.
  const reached = barGeometry().line + REACH_SLACK;
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

// Air between the bar and what a section link lands on.
const LANDING_GAP_PX = 16;

// Scroll so a part sits right under the stuck bar (Daniel, 2026-10-13:
// "déjala pegada bajo la barra"). It lands on the part's [data-landing]
// element if it has one — the cards under "Últimos días" rather than the
// heading the bar already names, the Curatoría card rather than the air
// above it. Smooth, then squared up once the scroll ends, since the bar
// tightening mid-scroll moves the page under it.
export function scrollToHomeSection(el: HTMLElement) {
  const anchor = el.querySelector<HTMLElement>("[data-landing]") ?? el;
  // From the venue section on, scrolling down slides the bar away
  // (WeekHeading) — there the part lands under the fixed top bar instead.
  const tail = visibleOne("#espacios-section");
  const target = (barGone: boolean) => {
    const { line, barTop, shrinkLeft } = barGeometry();
    return Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - shrinkLeft - (barGone ? barTop : line) - LANDING_GAP_PX);
  };
  const headingDown = anchor.getBoundingClientRect().top > 0;
  const intoTail = tail !== null && anchor.getBoundingClientRect().top >= tail.getBoundingClientRect().top - 1;
  window.scrollTo({ top: target(intoTail && headingDown), behavior: "smooth" });
  function squareUp() {
    cancel();
    const y = target(barGeometry().slidAway);
    if (Math.abs(y - window.scrollY) > 2) window.scrollTo({ top: y, behavior: "instant" });
  }
  // Taking over the scroll by hand cancels the squaring up.
  function cancel() {
    window.removeEventListener("scrollend", squareUp);
    HAND_EVENTS.forEach((type) => window.removeEventListener(type, cancel));
  }
  window.addEventListener("scrollend", squareUp);
  HAND_EVENTS.forEach((type) => window.addEventListener(type, cancel, { passive: true }));
}

// Put a part right under the stuck bar at once, and keep it there while
// the page settles under it — the bar tightening once stuck, a late font
// or photo above, the browser putting an old scroll back on a reload or a
// reopened tab (the phone home's landing on today, 2026-10-26/27: a smooth
// scroll there waited on scrollend to square up, which older iPhones never
// fire, and Safari restored its own spot over it). Lets go as soon as the
// visitor scrolls by hand, or a few seconds after the page has loaded.
// Calls onDone when it lets go that way; returns a function that lets go
// early, without calling it.
export function holdUnderBar(el: HTMLElement, onDone: () => void): () => void {
  const anchor = el.querySelector<HTMLElement>("[data-landing]") ?? el;
  function square() {
    // React swapped the part out (a new view came in) — nothing to hold.
    if (!anchor.isConnected) return release();
    const { line, shrinkLeft } = barGeometry();
    const y = Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - shrinkLeft - line - LANDING_GAP_PX);
    if (Math.abs(y - window.scrollY) > 2) window.scrollTo({ top: y, behavior: "instant" });
  }
  const resizes = new ResizeObserver(square);
  resizes.observe(document.body);
  const bar = visibleOne("[data-week-bar]");
  bar?.addEventListener("transitionend", square);
  // Any scroll not by hand (those release first) is the browser's own.
  window.addEventListener("scroll", square, { passive: true });
  // Browsers put an old scroll back around the load event, so the clock
  // only starts then.
  let timer: number | undefined;
  const startClock = () => {
    timer = window.setTimeout(done, HOLD_MS);
  };
  if (document.readyState === "complete") startClock();
  else window.addEventListener("load", startClock, { once: true });
  HAND_EVENTS.forEach((type) => window.addEventListener(type, done, { passive: true }));
  square();
  function done() {
    release();
    onDone();
  }
  function release() {
    resizes.disconnect();
    bar?.removeEventListener("transitionend", square);
    window.removeEventListener("scroll", square);
    window.removeEventListener("load", startClock);
    window.clearTimeout(timer);
    HAND_EVENTS.forEach((type) => window.removeEventListener(type, done));
  }
  return release;
}

const HOLD_MS = 3000;

// Hand-driven scrolling: wheel/trackpad, touch, keys, the scrollbar.
export const HAND_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

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
    HAND_EVENTS.forEach((type) => window.addEventListener(type, unpin, { passive: true }));
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // The sticky bar tightens once stuck (a 300ms transition) and moves
    // everything below it with no scroll event — re-check when it settles.
    const bar = document.querySelector<HTMLElement>("[data-week-bar]");
    bar?.addEventListener("transitionend", update);
    return () => {
      subscribers.delete(update);
      HAND_EVENTS.forEach((type) => window.removeEventListener(type, unpin));
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      bar?.removeEventListener("transitionend", update);
    };
  }, []);
  return section;
}
