"use client";

import { useEffect, useState } from "react";
import { esCL } from "@/i18n/es-CL";
import type { EventRecord } from "@/lib/events";
import InauguracionBentoCard from "./InauguracionBentoCard";
import EventHorizontalListItem from "./EventHorizontalListItem";

interface InauguracionesSectionProps {
  events: EventRecord[];
  hideTodayBadge?: boolean;
}

type ViewMode = "grid" | "list";

// 2 cards/page on desktop (md+), 1 on mobile — matches Figma's own two
// toolbars (174:2834 desktop "1 / 3" over 2-card bento rows, 178:76
// mobile "1 / 3" over a single stacked card). No CSS-only way to slice
// an array by breakpoint, so this tracks window width client-side; the
// brief mismatch between the SSR default (2) and a corrected mobile
// value (1) right after mount is an accepted, standard tradeoff for a
// JS-driven paginated layout like this.
function useItemsPerPage(): number {
  const [itemsPerPage, setItemsPerPage] = useState(2);
  useEffect(() => {
    function update() {
      setItemsPerPage(window.innerWidth >= 768 ? 2 : 1);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return itemsPerPage;
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
  const [page, setPage] = useState(0);
  const itemsPerPage = useItemsPerPage();
  const totalPages = Math.max(1, Math.ceil(events.length / itemsPerPage));
  // Clamp instead of reset-to-0 — keeps you on the same page after the
  // breakpoint changes the page size, unless that page no longer exists.
  const currentPage = Math.min(page, totalPages - 1);
  const pageEvents = events.slice(currentPage * itemsPerPage, currentPage * itemsPerPage + itemsPerPage);

  if (events.length === 0) return null;

  return (
    <section className="mt-6">
      <p className="font-geist font-semibold text-[15px] text-text-secondary tracking-[2px] mb-1.5">{esCL.sectionInauguracionesLabel}</p>
      <h2 className="font-lato font-black text-[28px] md:text-[41px] text-text-primary mb-6">{esCL.sectionInauguraciones}</h2>

      <div className="flex items-center justify-between mb-6">
        {/* Grid/list toggle is desktop-only — Figma's mobile toolbar (178:76)
            has no view-toggles at all, just this label + pagination. */}
        <div className="hidden md:flex items-center gap-[12px]">
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
        <p className="md:hidden font-geist text-[13px] text-text-primary">{esCL.sectionInauguracionesLabelMobile}</p>

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
        <div className="flex flex-col gap-[40px] md:gap-[60px]">
          {pageEvents.map((e, i) => (
            <InauguracionBentoCard
              key={e.id}
              event={e}
              reversed={(currentPage * itemsPerPage + i) % 2 === 1}
              hideTodayBadge={hideTodayBadge}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-[12px]">
          {pageEvents.map((e) => (
            <EventHorizontalListItem key={e.id} event={e} variant="inauguracion" />
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
