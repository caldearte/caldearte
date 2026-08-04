"use client";

import { useEffect, useState } from "react";
import { esCL } from "@/i18n/es-CL";
import { chunk } from "@/lib/array";
import { useSliderPaging } from "@/lib/useSliderPaging";
import type { EventRecord } from "@/lib/events";
import InauguracionBentoCard from "./InauguracionBentoCard";
import EventHorizontalListItem from "./EventHorizontalListItem";

interface InauguracionesSectionProps {
  events: EventRecord[];
  hideTodayBadge?: boolean;
}

type ViewMode = "grid" | "list";

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

export default function InauguracionesSection({ events, hideTodayBadge = false }: InauguracionesSectionProps) {
  const [view, setView] = useState<ViewMode>("grid");
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
  const { trackRef, currentPage, goToPage, onTrackScroll } = useSliderPaging(totalPages);
  const resetKey = `${view}-${itemsPerPage}`;

  if (events.length === 0) return null;

  return (
    <section className="mt-6">
      <p className="font-geist font-semibold text-[15px] text-text-secondary tracking-[2px] mb-1.5">{esCL.sectionInauguracionesLabel}</p>
      <h2 className="font-lato font-black text-[28px] md:text-[41px] text-text-primary mb-6">{esCL.sectionInauguraciones}</h2>

      {/* Sticky right under the fixed top nav (50px mobile/60px desktop,
          measured directly off Header's own nav bar) while scrolling
          through this section's cards — naturally stops sticking once the
          section itself (this component's own bounding box) scrolls past,
          since a sticky element can't render outside its containing
          block. bg-surface-sage so content scrolling underneath doesn't
          show through. */}
      <div className="sticky top-[50px] md:top-[60px] z-30 bg-surface-sage flex items-center justify-between mb-6 py-2">
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
        <div className="flex gap-[6px] justify-center pt-4">
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={esCL.pageIndicator(i + 1, totalPages)}
              onClick={() => goToPage(i)}
              className={`size-[8px] rounded-full ${i === currentPage ? "bg-brand-magenta" : "bg-border-default/40"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
