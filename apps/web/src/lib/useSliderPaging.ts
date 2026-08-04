"use client";

import { useRef, useState, type UIEvent, type WheelEvent } from "react";

// How long to ignore further wheel input after triggering one page turn —
// long enough to cover a single trackpad flick's full delta stream
// (which arrives as many small wheel events over ~300-500ms), so a hard
// flick still only advances one slide instead of riding its momentum
// across several.
const WHEEL_LOCK_MS = 500;
// Below this, treat it as scroll noise (an idle trackpad/wheel jitter),
// not an intentional swipe.
const WHEEL_THRESHOLD = 10;

// Shared by InauguracionesSection/ExposicionesSection: the arrow buttons
// and dot indicators drive an actual horizontally-scrollable, snap-paged
// track (not just a slice+re-render), so a visitor can also swipe/drag/
// trackpad-scroll through pages — this hook keeps `page` in sync with
// real scroll position either way. `onTrackScroll` is meant for the
// track's own `onScroll` JSX prop (React's synthetic event delegation),
// not a manually-attached DOM listener — that sidesteps any ref/remount
// timing issues around when a raw `addEventListener` gets (re)attached.
export function useSliderPaging(totalPages: number) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const currentPage = Math.min(page, Math.max(0, totalPages - 1));
  const wheelLockedRef = useRef(false);

  function goToPage(next: number) {
    const track = trackRef.current;
    const clamped = Math.max(0, Math.min(totalPages - 1, next));
    if (track) track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
    setPage(clamped);
  }

  function onTrackScroll(e: UIEvent<HTMLDivElement>) {
    const track = e.currentTarget;
    const width = track.clientWidth || 1;
    setPage(Math.round(track.scrollLeft / width));
  }

  // Caps trackpad/mouse-wheel horizontal scroll to exactly one page per
  // gesture — CSS scroll-snap only guarantees landing ON a snap point,
  // not the very next one, so a hard flick's native momentum can carry
  // scrollLeft past two or three pages in a single motion. Only acts on
  // a horizontal-dominant gesture (deltaX > deltaY) — an ordinary
  // vertical mouse-wheel scroll while hovering the track is left alone
  // so it still scrolls the page, not the slider.
  function onTrackWheel(e: WheelEvent<HTMLDivElement>) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    if (Math.abs(e.deltaX) < WHEEL_THRESHOLD) return;
    e.preventDefault();
    if (wheelLockedRef.current) return;
    wheelLockedRef.current = true;
    goToPage(currentPage + (e.deltaX > 0 ? 1 : -1));
    setTimeout(() => {
      wheelLockedRef.current = false;
    }, WHEEL_LOCK_MS);
  }

  return { trackRef, currentPage, goToPage, onTrackScroll, onTrackWheel };
}
