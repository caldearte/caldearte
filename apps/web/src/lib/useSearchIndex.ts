"use client";

import { useEffect, useState } from "react";
import { FAMILY_MODE_COOKIE, getCookie } from "./cookies";
import { filterFamilyMode } from "./event-utils";
import type { SearchIndex } from "./search";

// One fetch per page load, shared by every SearchPanel: the index is the
// same for everyone (app/api/search-index, cached), only family mode
// differs, and that's applied here from its cookie — same default as the
// home (on unless the cookie says otherwise, lib/homeViewModel.ts).
let pending: Promise<SearchIndex | null> | null = null;

function loadIndex(): Promise<SearchIndex | null> {
  pending ??= fetch("/api/search-index")
    .then((r) => (r.ok ? (r.json() as Promise<SearchIndex>) : null))
    .catch(() => null)
    .then((index) => {
      // A failed load may be retried on the next open.
      if (index === null) pending = null;
      return index;
    });
  return pending;
}

export function familyModeOn(): boolean {
  const cookie = getCookie(FAMILY_MODE_COOKIE);
  return cookie === undefined ? true : Boolean(cookie);
}

// Starts loading the first time `active` is true; null until it arrives.
export function useSearchIndex(active: boolean): SearchIndex | null {
  const [index, setIndex] = useState<SearchIndex | null>(null);
  useEffect(() => {
    if (!active || index !== null) return;
    let cancelled = false;
    loadIndex().then((loaded) => {
      if (cancelled || loaded === null) return;
      setIndex({ ...loaded, events: filterFamilyMode(loaded.events, familyModeOn()) });
    });
    return () => {
      cancelled = true;
    };
  }, [active, index]);
  return index;
}

// ⌘K / Ctrl+K anywhere, or "/" outside a text field, opens the search.
export function useSearchShortcut(open: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        open();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
}
