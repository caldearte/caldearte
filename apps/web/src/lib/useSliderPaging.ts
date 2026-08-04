"use client";

import { useRef, useState, type UIEvent } from "react";

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

  return { trackRef, currentPage, goToPage, onTrackScroll };
}
