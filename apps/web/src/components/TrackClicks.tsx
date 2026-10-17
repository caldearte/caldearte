"use client";

import { useEffect } from "react";
import { TRACKED_EVENTS, track, type TrackedEvent } from "@/lib/track";

// One delegated listener for the whole site, so a link only needs
// `data-track="directions"` (plus `data-track-event-id` when it belongs to
// an event) to be counted — server components like CatalogEntityPage can
// mark their links without becoming client components. auxclick covers a
// middle-click "open in new tab".
export default function TrackClicks() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.type === "auxclick" && e.button !== 1) return;
      const el = (e.target as Element | null)?.closest?.<HTMLElement>("[data-track]");
      const name = el?.dataset.track;
      if (!el || !name || !(TRACKED_EVENTS as readonly string[]).includes(name)) return;
      track(name as TrackedEvent, el.dataset.trackEventId);
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, []);
  return null;
}
