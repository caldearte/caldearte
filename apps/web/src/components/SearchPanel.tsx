"use client";

import { useEffect, useRef, useState } from "react";
import { esCL } from "@/i18n/es-CL";
import { searchEvents, sortByRunEndAsc } from "@/lib/event-utils";
import type { EventRecord } from "@/lib/events";
import { dateOnlyFromIso, todayInSantiago } from "@/lib/date";
import EventHorizontalListItem from "./EventHorizontalListItem";

interface SearchPanelProps {
  open: boolean;
  // Every active/upcoming, family-mode-filtered event across every comuna —
  // deliberately NOT scoped to the currently selected city/día-semana
  // window (see the product discussion: a scoped-empty result is
  // ambiguous — "doesn't exist" vs. "wrong filter"). Never includes past
  // (archived) events; that stays the Archive's own job.
  events: EventRecord[];
  onClose: () => void;
}

const SEARCH_DEBOUNCE_MS = 200;

// Same "hasn't happened yet" rule as EventDetailCard/splitInauguracionesYExpos
// — a past-but-still-running exhibition is an "expo" row here, not an
// "inauguración"/"visita_guiada" one, regardless of whether it once had a
// dated instance. The old version of this panel just checked
// `openingDatetime` truthiness (real bug, same class as the one fixed
// 2026-07-23 elsewhere). Also type-aware since 2026-08-29 (event_type) —
// a visita guiada must group separately, not fold into "inauguracion"
// just because it shares the same date field.
function variantFor(event: EventRecord): "inauguracion" | "visita_guiada" | "expo" {
  if (!event.openingDatetime || dateOnlyFromIso(event.openingDatetime) < todayInSantiago()) return "expo";
  return event.eventType === "visita_guiada" ? "visita_guiada" : "inauguracion";
}

// Rediseño 2.0.0 — full-screen modal, same chrome/behavior as
// CityPickerPanel (open/close transition, inert while closed, body-scroll
// lock, focus-on-open, Escape-to-close from anywhere in the panel — not
// just the input, see CityPickerPanel's own fix 2026-08-04) — independent
// of it and of MenuDrawer, its own panel per the product decision. Results
// reuse EventHorizontalListItem (the home's own "list view" row) instead
// of the old dark kebab-menu cards, so a search result looks like the
// same event would look on the home page.
export default function SearchPanel({ open, events, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Same render-time reset pattern as CityPickerPanel: clears the query the
  // moment the panel transitions to open, not via an effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setFilterQuery("");
    }
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Focus the input every time the panel opens, not just once on mount —
  // this panel stays mounted the whole time (inert/opacity toggle, not a
  // conditional render), so the plain `autoFocus` attribute below only
  // ever fires the very first time it appears in the DOM.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setFilterQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Document-level, not the input's own onKeyDown — Escape needs to close
  // this regardless of which element has focus (real bug found and fixed
  // the same way in CityPickerPanel 2026-08-04: an onKeyDown scoped to one
  // element only fires for events that bubble up FROM that element).
  useEffect(() => {
    if (!open) return;
    function onDocumentKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, [open, onClose]);

  const trimmedQuery = filterQuery.trim();
  const matches = trimmedQuery ? searchEvents(events, trimmedQuery) : [];
  // Inauguraciones vigentes first (soonest opening from today onward —
  // the OPPOSITE of Inauguraciones' own home-page order, which is newest
  // first; per the user 2026-08-04, a search result should read like a
  // forward-looking agenda), then Exposiciones in the same order the home
  // page uses (soonest-closing first, sortByRunEndAsc).
  const inauguracionResults = matches
    .filter((e) => variantFor(e) === "inauguracion")
    .sort((a, b) => (a.openingDatetime! < b.openingDatetime! ? -1 : a.openingDatetime! > b.openingDatetime! ? 1 : 0));
  const visitaGuiadaResults = matches
    .filter((e) => variantFor(e) === "visita_guiada")
    .sort((a, b) => (a.openingDatetime! < b.openingDatetime! ? -1 : a.openingDatetime! > b.openingDatetime! ? 1 : 0));
  const expoResults = sortByRunEndAsc(matches.filter((e) => variantFor(e) === "expo"));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={esCL.searchTitle}
      inert={!open}
      className={`fixed inset-0 z-40 bg-surface-sage overflow-y-auto transition-opacity duration-150 ${
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="max-w-[1160px] mx-auto px-5 md:px-0 py-[40px] md:py-[60px]">
        {/* Same header chrome as CityPickerPanel — the back-arrow doubles
            as this panel's only "close" affordance, big title on the
            right — instead of a bespoke X glyph. */}
        <div className="flex items-center justify-between mb-[40px] md:mb-[60px]">
          <button type="button" onClick={onClose} aria-label={esCL.closeSearch} className="cursor-pointer">
            {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
            <img src="/icons/selector-back-arrow.svg" alt="" width={140} height={19} />
          </button>
          <p className="font-lato text-[40px] md:text-[64px] text-brand-magenta whitespace-nowrap">{esCL.searchTitle.toUpperCase()}</p>
        </div>

        <div className="relative max-w-[600px]">
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            aria-label={esCL.searchAriaLabel}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={esCL.searchPlaceholder}
            className="w-full bg-surface-white rounded-input pl-[46px] pr-[16px] py-[16px] font-geist text-[16px] text-text-primary placeholder:text-icon-default focus:outline-none"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
          <img src="/icons/selector-search.svg" alt="" width={18} height={18} className="absolute left-[16px] top-1/2 -translate-y-1/2" />
        </div>

        <div className="mt-[40px] md:mt-[60px] flex flex-col gap-[32px] md:gap-[40px]">
          {!trimmedQuery ? (
            <p className="font-geist text-[15px] text-text-muted text-center py-10">{esCL.searchHint}</p>
          ) : matches.length === 0 ? (
            <p className="font-geist text-[15px] text-text-muted text-center py-10">{esCL.noSearchResults}</p>
          ) : (
            <>
              {/* Split into the same two groups as the home page, per the
                  user 2026-08-04: a flat mixed list made it hard to tell
                  inauguraciones from expos at a glance. */}
              {inauguracionResults.length > 0 && (
                <div>
                  <p className="font-fragment-mono font-bold text-[14px] uppercase text-text-primary mb-[16px]">
                    {esCL.searchGroupInauguraciones}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-[12px]">
                    {inauguracionResults.map((e) => (
                      <EventHorizontalListItem key={e.id} event={e} variant="inauguracion" />
                    ))}
                  </div>
                </div>
              )}
              {visitaGuiadaResults.length > 0 && (
                <div>
                  <p className="font-fragment-mono font-bold text-[14px] uppercase text-text-primary mb-[16px]">
                    {esCL.searchGroupVisitasGuiadas}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-[12px]">
                    {visitaGuiadaResults.map((e) => (
                      <EventHorizontalListItem key={e.id} event={e} variant="inauguracion" />
                    ))}
                  </div>
                </div>
              )}
              {expoResults.length > 0 && (
                <div>
                  <p className="font-fragment-mono font-bold text-[14px] uppercase text-text-primary mb-[16px]">
                    {esCL.searchGroupExposiciones}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-[12px]">
                    {expoResults.map((e) => (
                      <EventHorizontalListItem key={e.id} event={e} variant="expo" />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
