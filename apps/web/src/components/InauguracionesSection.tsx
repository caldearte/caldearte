"use client";

import { useEffect, useState } from "react";
import { esCL } from "@/i18n/es-CL";
import { chunk } from "@/lib/array";
import { useSliderPaging } from "@/lib/useSliderPaging";
import type { EventRecord } from "@/lib/events";
import { hasShareableInauguraciones, shareInauguracionesCarousel } from "@/lib/social/shareInauguracionesCarousel";
import { ShareGlyph } from "./CardActionIcons";
import InauguracionBentoCard from "./InauguracionBentoCard";
import EventHorizontalListItem from "./EventHorizontalListItem";

type ViewMode = "grid" | "list";

interface InauguracionesSectionProps {
  events: EventRecord[];
  // Only used to label the shared flyers' región badge (ShareCarouselMenu
  // below) — the event list itself is already filtered to this región.
  regionName: string;
  hideTodayBadge?: boolean;
  // "list" — used by the event detail page's own list-mode footer
  // (EventDetailCard.tsx's caller), which wants the compact row layout by
  // default to keep the page from being dominated by a second full bento
  // grid. Home keeps the "grid" default unchanged.
  defaultView?: ViewMode;
  // Overrides the sticky toolbar's offset — tuned by default for
  // Header.tsx's own fixed nav height; the event detail page's list-mode
  // selector (EventPageTopNav.tsx) is taller, so it passes its own value.
  stickyTopClass?: string;
}

// True from md (768px) up — no CSS-only way to slice an array by
// breakpoint, so pagination size tracks window width client-side. The
// brief mismatch between the SSR default (desktop) and a corrected
// mobile value right after mount is an accepted, standard tradeoff for
// a JS-driven paginated layout like this.
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    function update() {
      setIsDesktop(window.innerWidth >= 768);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return isDesktop;
}

function ToggleButton({ active, onClick, ariaLabel, icon }: { active: boolean; onClick: () => void; ariaLabel: string; icon: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`flex items-center justify-center size-[36px] rounded-[18px] border ${active ? "border-text-primary" : "border-border-default"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
      <img src={icon} alt="" width={18} height={18} />
    </button>
  );
}

// Button next to the section title (Camila's request, 2026-08-31): grabs
// every shareable inauguración currently shown in this section — already
// filtered to the visitor's región + week — and hands them straight to
// shareInauguracionesCarousel. No menu/submenu: the OS-native share sheet
// that opens from it is already the picker (Instagram, WhatsApp, Files,
// etc.) — an extra in-page menu step just to relabel "Instagram" ahead of
// the same sheet would be redundant (Daniel, 2026-08-31, simplifying an
// earlier dropdown version of this).
function ShareCarouselButton({ events, regionName }: { events: EventRecord[]; regionName: string }) {
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (!hasShareableInauguraciones(events)) return null;

  async function handleShare() {
    setStatus("working");
    setMessage(null);
    try {
      const outcome = await shareInauguracionesCarousel(events, regionName);
      setStatus("idle");
      if (outcome === "downloaded") {
        setMessage(esCL.shareCarouselDownloaded);
        setTimeout(() => setMessage(null), 6000);
      }
    } catch {
      setStatus("error");
      setMessage(esCL.shareCarouselError);
      setTimeout(() => {
        setStatus("idle");
        setMessage(null);
      }, 4000);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={handleShare}
        disabled={status === "working"}
        className="flex items-center gap-1.5 h-[36px] px-3.5 rounded-[18px] border border-text-primary font-geist text-[13px] text-text-primary disabled:opacity-50"
      >
        <ShareGlyph color="#3d373d" />
        {status === "working" ? esCL.shareCarouselWorking : esCL.shareCarouselButton}
      </button>
      {message && (
        <div className="absolute top-full right-0 mt-2 z-20 w-[240px] rounded-lg bg-black/80 text-white text-xs px-2.5 py-1.5">{message}</div>
      )}
    </div>
  );
}

export default function InauguracionesSection({
  events,
  regionName,
  hideTodayBadge = false,
  defaultView = "grid",
  stickyTopClass = "top-[50px] md:top-[60px]",
}: InauguracionesSectionProps) {
  const [view, setView] = useState<ViewMode>(defaultView);
  const isDesktop = useIsDesktop();
  // Figma's mobile toolbar (178:76) has no view-toggle at all, just label
  // + pagination — grid-only was the original spec, but the user
  // explicitly asked (2026-08-03) for list view on mobile too, so the
  // toggle is now shown on every screen size and `view` applies as-is,
  // no breakpoint override.
  const itemsPerPage = view === "list" ? (isDesktop ? 3 : 6) : isDesktop ? 2 : 1;
  const pages = chunk(events, itemsPerPage);
  const totalPages = Math.max(1, pages.length);
  // Real horizontal-scroll track (swipe/trackpad/drag), not just a
  // slice+re-render — see useSliderPaging's own doc comment. `resetKey`
  // remounts the track (and re-zeroes scroll position) whenever the page
  // count changes for a reason other than paging itself.
  const { trackRef, currentPage, goToPage, onTrackScroll, onTrackWheel } = useSliderPaging(totalPages);
  const resetKey = `${view}-${itemsPerPage}`;

  if (events.length === 0) return null;

  return (
    <section className="mt-6">
      <p className="font-geist font-semibold text-[15px] text-text-secondary tracking-[2px] mb-1.5">{esCL.sectionInauguracionesLabel}</p>
      {/* flex-wrap, not a fixed row: at narrow widths there isn't room for
          the full title next to ShareCarouselButton without either
          overlapping it or force-breaking "INAUGURACIONES" mid-word (tried
          both, real bugs found testing on a real mobile viewport) — wrapping
          drops the button to its own line below the title instead, which
          keeps the title's normal word-boundary wrapping intact. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-6">
        <h2 className="font-lato font-black text-[28px] md:text-[41px] text-text-primary">{esCL.sectionInauguraciones}</h2>
        <div className="pt-2 md:pt-3">
          <ShareCarouselButton events={events} regionName={regionName} />
        </div>
      </div>

      {/* Sticky right under the fixed top nav (50px mobile/60px desktop,
          measured directly off Header's own nav bar) while scrolling
          through this section's cards — naturally stops sticking once the
          section itself (this component's own bounding box) scrolls past,
          since a sticky element can't render outside its containing
          block. bg-surface-sage so content scrolling underneath doesn't
          show through. */}
      <div className={`sticky ${stickyTopClass} z-30 bg-surface-sage flex items-center justify-between mb-6 py-2`}>
        {/* Grid/list toggle was desktop-only in Figma's mobile toolbar
            (178:76, just label + pagination) — shown on every screen size
            now per the user's explicit request (2026-08-03). The mobile
            label text ("Inauguración destacada") was tried alongside it
            but the user asked to drop it — just the controls now, same
            on every breakpoint. */}
        <div className="flex items-center gap-[12px]">
          <ToggleButton
            active={view === "grid"}
            onClick={() => setView("grid")}
            ariaLabel={esCL.viewToggleGridAriaLabel}
            icon={view === "grid" ? "/icons/toolbar-grid.svg" : "/icons/toolbar-grid-gray.svg"}
          />
          <ToggleButton
            active={view === "list"}
            onClick={() => setView("list")}
            ariaLabel={esCL.viewToggleListAriaLabel}
            icon={view === "list" ? "/icons/toolbar-list-dark.svg" : "/icons/toolbar-list.svg"}
          />
        </div>

        <div className="flex items-center gap-[12px]">
          <button
            type="button"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 0}
            aria-label={esCL.prevPageAriaLabel}
            className="flex items-center justify-center size-[36px] rounded-[18px] border border-text-primary disabled:opacity-30"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
            <img src="/icons/arrow-left.svg" alt="" width={18} height={18} />
          </button>
          <p className="font-geist text-[13px] text-text-primary whitespace-nowrap">{esCL.pageIndicator(currentPage + 1, totalPages)}</p>
          <button
            type="button"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages - 1}
            aria-label={esCL.nextPageAriaLabel}
            className="flex items-center justify-center size-[36px] rounded-[18px] border border-text-primary disabled:opacity-30"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
            <img src="/icons/arrow-right.svg" alt="" width={18} height={18} />
          </button>
        </div>
      </div>

      {/* Snap-paged horizontal scroll track — arrows/dots call goToPage,
          but a visitor can also swipe/drag/trackpad-scroll directly.
          Keyed by resetKey so a view toggle or breakpoint crossing
          (itemsPerPage changing) remounts it at scrollLeft 0 instead of
          leaving a stale offset from the previous layout. */}
      <div
        key={resetKey}
        ref={trackRef}
        onScroll={onTrackScroll}
        onWheel={onTrackWheel}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((pageEvents, pIdx) =>
          view === "grid" ? (
            <div key={pIdx} className="w-full shrink-0 snap-start flex flex-col gap-[40px] md:gap-[60px]">
              {pageEvents.map((e, i) => (
                <InauguracionBentoCard
                  key={e.id}
                  event={e}
                  reversed={(pIdx * itemsPerPage + i) % 2 === 1}
                  hideTodayBadge={hideTodayBadge}
                  priority={pIdx === 0 && i === 0}
                />
              ))}
            </div>
          ) : (
            // 3 fixed-width columns — grid tracks (not flex) so a page
            // with fewer than 3 items leaves empty cells instead of the
            // last card stretching to fill the row.
            <div key={pIdx} className="w-full shrink-0 snap-start grid grid-cols-1 md:grid-cols-3 gap-[12px]">
              {pageEvents.map((e) => (
                <EventHorizontalListItem key={e.id} event={e} variant="inauguracion" />
              ))}
            </div>
          ),
        )}
      </div>

      {totalPages > 1 && (
        // Non-interactive — real page navigation is the prev/next arrows
        // above (both call the same goToPage), plus swipe on the track
        // itself. Real request, 2026-08-19: a clickable dot this size is
        // a target-size accessibility hit no matter how much the tap area
        // is padded out; removing the interaction entirely (not just
        // enlarging it, see the PR #310 attempt before this one) is what
        // actually clears it — a purely decorative "you are here"
        // indicator isn't subject to that audit at all.
        <div role="presentation" className="flex gap-[6px] justify-center pt-4">
          {pages.map((_, i) => (
            <span key={i} className={`size-[8px] rounded-full ${i === currentPage ? "bg-brand-magenta" : "bg-border-default/40"}`} />
          ))}
        </div>
      )}
    </section>
  );
}
