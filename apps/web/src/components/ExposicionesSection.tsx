"use client";

import { useEffect, useState } from "react";
import { esCL } from "@/i18n/es-CL";
import type { EventRecord } from "@/lib/events";
import ExpoBentoCard from "./ExpoBentoCard";
import EventHorizontalListItem from "./EventHorizontalListItem";

interface ExposicionesSectionProps {
  events: EventRecord[];
  hideTodayBadge?: boolean;
}

type ViewMode = "grid" | "list";

// Same breakpoint tracker as InauguracionesSection — see that file's own
// comment for why this can't be CSS-only.
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

// Desktop-only image-height per grid slot (174:2917's own irregular
// row-1/row-2 split: a big card, a medium one, two small ones, and a
// tall one — not a repeating pattern, so this is a fixed 5-slot lookup,
// not a formula). Slot 5 (index 4) is meant to visually overlap row-1 in
// Figma (negative y-offset) — simplified here to just "tall", a robust
// CSS Grid auto-flow (7+5=12, then 4+4+4=12) rather than a fragile
// absolute-position collage that breaks with variable text length.
const DESKTOP_IMAGE_HEIGHT: string[] = ["md:h-[320px]", "md:h-[200px]", "md:h-[200px]", "md:h-[200px]", "md:h-[322px]"];
const DESKTOP_COL_SPAN: string[] = ["md:col-span-7", "md:col-span-5", "md:col-span-4", "md:col-span-4", "md:col-span-4"];

export default function ExposicionesSection({ events, hideTodayBadge = false }: ExposicionesSectionProps) {
  const [view, setView] = useState<ViewMode>("grid");
  const [page, setPage] = useState(0);
  const isDesktop = useIsDesktop();
  // Figma's mobile toolbar (178:119) had no view-toggle at all, just
  // label + pagination — grid-only was the original spec, but the user
  // explicitly asked (2026-08-03) for list view on mobile too, so the
  // toggle is shown on every screen size now, `view` applies as-is.
  // Grid: 5/page desktop (fixed asymmetric layout), 3/page mobile
  // (Figma's own "Mostrando 3 de 15", 178:120). List: 12/page desktop
  // (confirmed with the user, deliberately more than grid's 5 since the
  // cards are much smaller), 6/page mobile (single column, same ratio).
  const itemsPerPage = view === "list" ? (isDesktop ? 12 : 6) : isDesktop ? 5 : 3;
  const totalPages = Math.max(1, Math.ceil(events.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages - 1);
  const pageEvents = events.slice(currentPage * itemsPerPage, currentPage * itemsPerPage + itemsPerPage);

  if (events.length === 0) return null;

  return (
    <section className="mt-16">
      <p className="font-geist font-semibold text-[15px] text-text-secondary tracking-[2px] mb-1.5">{esCL.sectionExposActualesLabel}</p>
      <h2 className="font-lato font-black text-[28px] md:text-[41px] text-text-primary mb-6">{esCL.sectionExposActuales}</h2>

      {/* Sticky under the fixed top nav, same as InauguracionesSection's
          own toolbar — see that file's doc comment for the exact z-index
          stack this depends on. */}
      <div className="sticky top-[50px] md:top-[60px] z-30 bg-surface-sage flex items-center justify-between mb-6 py-2">
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
            onClick={() => setPage((p) => Math.max(0, p - 1))}
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
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            aria-label={esCL.nextPageAriaLabel}
            className="flex items-center justify-center size-[36px] rounded-[18px] border border-text-primary disabled:opacity-30"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
            <img src="/icons/arrow-right.svg" alt="" width={18} height={18} />
          </button>
        </div>
      </div>

      {view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-[20px] md:gap-[27px]">
          {pageEvents.map((e, i) => (
            <div key={e.id} className={DESKTOP_COL_SPAN[i]}>
              <ExpoBentoCard event={e} hideTodayBadge={hideTodayBadge} desktopImageHeightClass={DESKTOP_IMAGE_HEIGHT[i]} />
            </div>
          ))}
        </div>
      ) : (
        // Same 3-fixed-width-column pattern as Inauguraciones' list view —
        // 5 items wrap naturally to 2 rows (3 + 2), no extra logic needed.
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[12px]">
          {pageEvents.map((e) => (
            <EventHorizontalListItem key={e.id} event={e} variant="expo" />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex gap-[6px] justify-center pt-4">
          {Array.from({ length: totalPages }).map((_, i) => (
            <span key={i} className={`size-[8px] rounded-full ${i === currentPage ? "bg-brand-magenta" : "bg-border-default/40"}`} />
          ))}
        </div>
      )}
    </section>
  );
}
