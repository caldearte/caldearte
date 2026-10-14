"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { esCL } from "@/i18n/es-CL";
import { REGION_COOKIE, setCookie } from "@/lib/cookies";
import { anchorDateOnly, fmtAgendaPillDay, fmtAgendaPillHour, fmtPeriod, fmtUntilPill, santiagoDateOfIso, todayInSantiago } from "@/lib/date";
import type { EventRecord } from "@/lib/events";
import { eventTense, matchRange, MIN_QUERY_FOR_EVENTS, normalizeSearch, searchAll, type SearchEntity, type SearchGroup, type SearchPlace } from "@/lib/search";
import { titleWithTypePrefix } from "@/lib/social/flyerText";
import { useSearchIndex } from "@/lib/useSearchIndex";
import { ExpoTile } from "./CarteleraSection";
import SiteWordmark from "./SiteWordmark";

interface SearchPanelProps {
  open: boolean;
  onClose: () => void;
  // Picking a place on the home switches its región in place; anywhere
  // else (no prop) it sets the región cookie and goes to the home.
  onSelectRegion?: (regionId: string) => void;
}

const SEARCH_DEBOUNCE_MS = 120;
// Rows shown per group before "Ver los N".
const GROUP_CAP: Record<SearchGroup["kind"], number> = { places: 3, venues: 4, artists: 4, events: 10 };
const GROUP_LABEL: Record<SearchGroup["kind"], string> = {
  places: esCL.searchGroupPlaces,
  venues: esCL.searchGroupVenues,
  artists: esCL.searchGroupArtists,
  events: esCL.searchGroupEvents,
};
const RECENT_KEY = "caldearte_recent_searches";
const MAX_RECENT = 5;
const TOP_VENUES = 6;

// Recent searches live only in this browser (Daniel, 2026-10-13: no
// server-side search log). Storage can be unavailable — then there are none.
function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((q): q is string => typeof q === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  const q = query.trim();
  if (q.length < 2) return;
  try {
    const next = [q, ...readRecent().filter((r) => normalizeSearch(r) !== normalizeSearch(q))].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Not stored — fine.
  }
}

// The typed text in magenta bold inside a result's name.
function Highlight({ text, query }: { text: string; query: string }) {
  const range = matchRange(text, query);
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range[0])}
      <mark className="bg-transparent text-brand-magenta">{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </>
  );
}

// An event's tile in the results says what matters for when it is: an
// opening ahead its day and hour (with the "Inauguración:" prefix), a
// running show until when, a past one its run.
function SearchEventTile({ event, today }: { event: EventRecord; today: string }) {
  const tense = eventTense(event, today);
  const opening = event.openingDatetime;
  const openingAhead = opening !== null && santiagoDateOfIso(opening) >= today;
  const anchor = anchorDateOnly(event) ?? today;
  const pill = openingAhead
    ? `${fmtAgendaPillDay(opening, today)} · ${fmtAgendaPillHour(opening, event.openingTimeConfirmed)}`
    : tense === 1 && event.runEndDate
      ? fmtUntilPill(event.runEndDate, today)
      : fmtPeriod(event.runStartDate, event.runEndDate, anchor, today).toUpperCase();
  const title = openingAhead ? titleWithTypePrefix(event.title, event.eventType === "visita_guiada" ? "visita_guiada" : "inauguracion") : event.title;
  return (
    <div data-search-item>
      <ExpoTile event={event} today={today} pillText={pill} title={title} />
    </div>
  );
}

const ROW =
  "group w-full flex items-center justify-between gap-[16px] py-[14px] border-b border-text-primary/10 text-left cursor-pointer focus:outline-none focus-visible:bg-surface-white/60";
const ROW_NAME = "block truncate font-lato font-black text-[20px] md:text-[24px] leading-tight text-text-primary";
const ROW_META = "block mt-[2px] font-geist font-semibold text-[12px] tracking-[1px] uppercase text-text-secondary";
const ROW_ACTION = "shrink-0 font-fragment-mono text-[13px] text-text-primary group-hover:text-brand-magenta";

function EntityRow({ entity, query }: { entity: SearchEntity; query: string }) {
  return (
    <Link href={entity.href} data-search-item className={ROW}>
      <span className="min-w-0">
        <span className={ROW_NAME}>
          <Highlight text={entity.name} query={query} />
        </span>
        <span className={ROW_META}>{[entity.meta, esCL.searchEntityCount(entity.count)].filter(Boolean).join(" · ")}</span>
      </span>
      <span className={ROW_ACTION}>→</span>
    </Link>
  );
}

function PlaceRow({ place, query, onSelect }: { place: SearchPlace; query: string; onSelect: (regionId: string) => void }) {
  return (
    <button type="button" data-search-item onClick={() => onSelect(place.regionId)} className={ROW}>
      <span className="min-w-0">
        <span className={ROW_NAME}>
          <Highlight text={place.comuna ?? place.regionName} query={query} />
        </span>
        <span className={ROW_META}>{place.comuna ? place.regionName : esCL.searchPlaceRegionMeta}</span>
      </span>
      <span className={ROW_ACTION}>{esCL.searchPlaceAction} →</span>
    </button>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <h3 className="font-geist font-semibold text-[13px] tracking-[2px] uppercase text-text-secondary mb-[8px]">{children}</h3>;
}

// The site search (2026-10-13, lib/search.ts): a full-screen panel under
// the home's top bar — logo and close — with one big box that finds
// places, venues, artists and every event, past ones included. Results
// come grouped as you type, the group with the best match first; with
// fewer than 3 letters only places, venues and artists whose name starts
// so. Arrow keys move through the results, Enter opens, Escape closes.
// The index loads the first time the panel opens (useSearchIndex).
export default function SearchPanel({ open, onClose, onSelectRegion }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [expanded, setExpanded] = useState<Partial<Record<SearchGroup["kind"], boolean>>>({});
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const index = useSearchIndex(open);
  const today = todayInSantiago();

  // Fresh every time it opens (render-time reset, like the old panel).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setFilterQuery("");
      setExpanded({});
      setRecent(readRecent());
    }
  }
  // A new query folds every group back to its cap.
  const [prevFilter, setPrevFilter] = useState(filterQuery);
  if (filterQuery !== prevFilter) {
    setPrevFilter(filterQuery);
    setExpanded({});
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // The panel stays mounted (inert while closed), so autoFocus alone would
  // only fire once.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setFilterQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Escape closes from wherever focus is, not just the input.
  useEffect(() => {
    if (!open) return;
    function onDocumentKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, [open, onClose]);

  function selectRegion(regionId: string) {
    saveRecent(filterQuery);
    onClose();
    if (onSelectRegion) {
      onSelectRegion(regionId);
      return;
    }
    // The home reads the cookie on arrival and loads that región (HomeClient).
    setCookie(REGION_COOKIE, regionId);
    router.push("/");
  }

  // ↑/↓ through the results in reading order; ↑ from the first goes back
  // to the box.
  function moveFocus(e: ReactKeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...(resultsRef.current?.querySelectorAll<HTMLElement>("[data-search-item]") ?? [])].map(
      (el) => el.querySelector<HTMLElement>("a, button") ?? el,
    );
    if (items.length === 0) return;
    const at = items.findIndex((el) => el === document.activeElement);
    e.preventDefault();
    if (e.key === "ArrowDown") items[Math.min(at + 1, items.length - 1)].focus();
    else if (at <= 0) inputRef.current?.focus();
    else items[at - 1].focus();
  }

  const q = filterQuery.trim();
  const groups = index && q ? searchAll(index, q, today) : [];
  const topVenues = index ? [...index.venues].sort((a, b) => b.count - a.count).slice(0, TOP_VENUES) : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={esCL.searchTitle}
      inert={!open}
      onKeyDown={moveFocus}
      className={`fixed inset-0 z-50 bg-surface-sage overflow-y-auto overscroll-contain transition-opacity duration-150 ${
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* The home's top bar (logo, close) with the box under it, both
          staying put while the results scroll. */}
      <div className="sticky top-0 z-10 bg-surface-sage border-b border-text-primary/10">
        <div className="max-w-[1600px] mx-auto h-[84px] md:h-[104px] flex items-center justify-between px-[18px] md:px-[40px] xl:px-[80px]">
          <SiteWordmark />
          <button type="button" onClick={onClose} aria-label={esCL.closeSearch} className="cursor-pointer p-[6px] -m-[6px] text-text-primary hover:text-brand-magenta">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[26px]">
              <path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="max-w-[1100px] mx-auto px-[18px] md:px-[40px] pb-[16px] md:pb-[24px]">
          <div className="relative flex items-center rounded-[16px] border-2 border-text-primary/25 bg-surface-white focus-within:border-brand-magenta transition-colors">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="absolute left-[16px] md:left-[20px] size-[20px] md:size-[26px] text-text-primary">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
              <path d="M15.5 15.5L21 21" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              role="searchbox"
              aria-label={esCL.searchAriaLabel}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // Enter in the box opens the first result.
                  const first = resultsRef.current?.querySelector<HTMLElement>("[data-search-item]");
                  (first?.querySelector<HTMLElement>("a, button") ?? first)?.click();
                }
              }}
              placeholder={esCL.searchPlaceholder}
              autoComplete="off"
              enterKeyHint="search"
              className="w-full bg-transparent pl-[48px] md:pl-[60px] pr-[88px] py-[14px] md:py-[18px] font-lato font-black text-[20px] md:text-[30px] text-text-primary placeholder:font-semibold placeholder:text-text-placeholder focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="absolute right-[14px] md:right-[18px] font-fragment-mono text-[13px] text-text-secondary underline cursor-pointer hover:text-brand-magenta"
              >
                {esCL.searchClear}
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        ref={resultsRef}
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest("[data-search-item]")) saveRecent(filterQuery);
        }}
        className="max-w-[1100px] mx-auto px-[18px] md:px-[40px] pt-[24px] md:pt-[40px] pb-[64px] flex flex-col gap-[36px] md:gap-[48px]"
      >
        {!q ? (
          // Before typing: recent searches and the busiest venues.
          <>
            {recent.length > 0 && (
              <section>
                <GroupLabel>{esCL.searchRecentLabel}</GroupLabel>
                <div className="flex flex-wrap gap-[8px] mt-[12px]">
                  {recent.map((r) => (
                    <button
                      key={r}
                      type="button"
                      data-search-item
                      onClick={() => {
                        setQuery(r);
                        setFilterQuery(r);
                        inputRef.current?.focus();
                      }}
                      className="rounded-full bg-surface-white px-[14px] py-[8px] font-geist text-[14px] text-text-primary cursor-pointer hover:text-brand-magenta"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {topVenues.length > 0 && (
              <section>
                <GroupLabel>{esCL.searchTopVenuesLabel}</GroupLabel>
                {topVenues.map((v) => (
                  <EntityRow key={v.href} entity={v} query="" />
                ))}
              </section>
            )}
            <p className="hidden md:block font-fragment-mono text-[13px] text-text-secondary">{esCL.searchShortcutHint}</p>
          </>
        ) : !index ? (
          <p className="font-geist text-[15px] text-text-secondary">{esCL.searchLoading}</p>
        ) : groups.length === 0 && normalizeSearch(q).length < MIN_QUERY_FOR_EVENTS ? (
          <p className="font-geist text-[15px] text-text-secondary">{esCL.searchShortQueryHint}</p>
        ) : groups.length === 0 ? (
          <section className="py-[24px]">
            <p className="font-lato font-black text-[22px] md:text-[28px] text-text-primary">{esCL.noSearchResults(q)}</p>
            <p className="mt-[8px] font-geist text-[15px] text-text-secondary">{esCL.searchNoResultsTip}</p>
            <Link href="/agrega-tu-expo" className="inline-block mt-[16px] font-fragment-mono text-[14px] text-text-primary underline hover:text-brand-magenta">
              {esCL.searchNoResultsSubmit} →
            </Link>
          </section>
        ) : (
          <>
            {groups.map((g) => {
              const cap = GROUP_CAP[g.kind];
              const showAll = expanded[g.kind] === true;
              const total = g.items.length;
              const toggle =
                total > cap ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [g.kind]: !showAll }))}
                    className="mt-[16px] h-[40px] px-[20px] rounded-full border border-text-primary font-fragment-mono text-[13px] text-text-primary cursor-pointer hover:bg-surface-white"
                  >
                    {showAll ? esCL.searchSeeLess : esCL.searchSeeAll(total)}
                  </button>
                ) : null;
              return (
                <section key={g.kind}>
                  <GroupLabel>
                    {GROUP_LABEL[g.kind]} · {total}
                  </GroupLabel>
                  {g.kind === "events" ? (
                    <div className="mt-[12px] grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-x-[12px] gap-y-[20px]">
                      {(showAll ? g.items : g.items.slice(0, cap)).map((e) => (
                        <SearchEventTile key={e.id} event={e} today={today} />
                      ))}
                    </div>
                  ) : g.kind === "places" ? (
                    (showAll ? g.items : g.items.slice(0, cap)).map((p) => <PlaceRow key={`${p.regionId}-${p.comuna ?? ""}`} place={p} query={q} onSelect={selectRegion} />)
                  ) : (
                    (showAll ? g.items : g.items.slice(0, cap)).map((ent) => <EntityRow key={ent.href} entity={ent} query={q} />)
                  )}
                  {toggle}
                </section>
              );
            })}
            {normalizeSearch(q).length < MIN_QUERY_FOR_EVENTS && <p className="font-geist text-[14px] text-text-secondary">{esCL.searchShortQueryHint}</p>}
          </>
        )}
      </div>
    </div>
  );
}
