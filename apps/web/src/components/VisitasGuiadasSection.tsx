"use client";

import { useEffect, useState } from "react";
import { esCL } from "@/i18n/es-CL";
import { chunk } from "@/lib/array";
import { useSliderPaging } from "@/lib/useSliderPaging";
import type { EventRecord } from "@/lib/events";
import InauguracionBentoCard from "./InauguracionBentoCard";
import EventHorizontalListItem from "./EventHorizontalListItem";

type ViewMode = "grid" | "list";

interface VisitasGuiadasSectionProps {
  events: EventRecord[];
  hideTodayBadge?: boolean;
  defaultView?: ViewMode;
  stickyTopClass?: string;
}

// True from md (768px) up — same breakpoint logic as
// InauguracionesSection's own useIsDesktop (kept as a separate copy here
// rather than a shared import, matching that component's own posture:
// it's a small, self-contained window-width hook, not worth a shared
// module for 2 call sites).
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

// Mirrors InauguracionesSection.tsx exactly (same card components, same
// slider/toggle mechanics) — added 2026-08-29 alongside events.event_type
// for Daniel's 3-category split (inauguración / visita guiada /
// exposición, ordered by interaction with the work — see
// apps/curator/src/lib/curation-policy.ts's EVENT_TYPE_POLICY). Reuses
// InauguracionBentoCard/EventHorizontalListItem's "inauguracion" variant
// as-is: both cards' "inauguracion" variant just means "this event has
// its own single dated instance, not a run range" (date+hour formatting,
// add-to-calendar) — true for a visita guiada exactly the same way it's
// true for a real inauguración, neither card renders the literal word
// "inauguración" anywhere.
export default function VisitasGuiadasSection({
  events,
  hideTodayBadge = false,
  defaultView = "grid",
  stickyTopClass = "top-[50px] md:top-[60px]",
}: VisitasGuiadasSectionProps) {
  const [view, setView] = useState<ViewMode>(defaultView);
  const isDesktop = useIsDesktop();
  const itemsPerPage = view === "list" ? (isDesktop ? 3 : 6) : isDesktop ? 2 : 1;
  const pages = chunk(events, itemsPerPage);
  const totalPages = Math.max(1, pages.length);
  const { trackRef, currentPage, goToPage, onTrackScroll, onTrackWheel } = useSliderPaging(totalPages);
  const resetKey = `${view}-${itemsPerPage}`;

  if (events.length === 0) return null;

  return (
    <section className="mt-6">
      <p className="font-geist font-semibold text-[15px] text-text-secondary tracking-[2px] mb-1.5">{esCL.sectionVisitasGuiadasLabel}</p>
      <h2 className="font-lato font-black text-[28px] md:text-[41px] text-text-primary mb-6">{esCL.sectionVisitasGuiadas}</h2>

      <div className={`sticky ${stickyTopClass} z-30 bg-surface-sage flex items-center justify-between mb-6 py-2`}>
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
            <div key={pIdx} className="w-full shrink-0 snap-start grid grid-cols-1 md:grid-cols-3 gap-[12px]">
              {pageEvents.map((e) => (
                <EventHorizontalListItem key={e.id} event={e} variant="inauguracion" />
              ))}
            </div>
          ),
        )}
      </div>

      {totalPages > 1 && (
        <div role="presentation" className="flex gap-[6px] justify-center pt-4">
          {pages.map((_, i) => (
            <span key={i} className={`size-[8px] rounded-full ${i === currentPage ? "bg-brand-magenta" : "bg-border-default/40"}`} />
          ))}
        </div>
      )}
    </section>
  );
}
