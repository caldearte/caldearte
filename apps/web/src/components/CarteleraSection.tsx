"use client";

import { useState } from "react";
import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { isClosingSoon } from "@/lib/date";
import { eventComuna } from "@/lib/event-utils";
import { useEventCardActions } from "@/lib/useEventCardActions";
import type { EventRecord } from "@/lib/events";
import CardImage from "./CardImage";

interface CarteleraSectionProps {
  events: EventRecord[]; // already sorted soonest-closing first (splitInauguracionesYExpos)
  today: string;
}

// 10 fills two desktop rows (5 columns — smaller than the agenda's cards
// on purpose, Daniel 2026-10-13) and five mobile rows (2 columns); past
// that, the list is a click away instead of a 15-page slider.
const INITIAL_VISIBLE = 10;
// "Últimos días" can be a long list on a busy week (7 in Santiago on
// 2026-10-12) — one desktop row, then a click.
const INITIAL_VISIBLE_CLOSING = 5;
// Fewer distinct comunas than this and the chips add nothing.
const MIN_COMUNAS_FOR_FILTER = 3;

// The running exhibitions (2026-10-12), replacing the paged bento slider
// ("1/15" on mobile): what closes this week first, then the rest as a
// plain grid, filterable by comuna, with "Ver las N" instead of pages.
export default function CarteleraSection({ events, today }: CarteleraSectionProps) {
  const [comuna, setComuna] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [closingExpanded, setClosingExpanded] = useState(false);

  if (events.length === 0) return null;

  const closing = events.filter((e) => isClosingSoon(e.runEndDate, today));
  const rest = events.filter((e) => !isClosingSoon(e.runEndDate, today));

  const comunaCounts = new Map<string, number>();
  for (const e of rest) {
    const c = eventComuna(e);
    comunaCounts.set(c, (comunaCounts.get(c) ?? 0) + 1);
  }
  const comunas = [...comunaCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const filtered = comuna ? rest.filter((e) => eventComuna(e) === comuna) : rest;
  const visible = expanded ? filtered : filtered.slice(0, INITIAL_VISIBLE);

  function pickComuna(next: string | null) {
    setComuna(next);
    setExpanded(false);
  }

  return (
    <section aria-labelledby="cartelera-title" className="mt-[48px]">
      <h2 id="cartelera-title" className="font-geist font-semibold text-[13px] tracking-[2px] uppercase text-text-secondary mb-[16px]">
        {esCL.home.carteleraTitle} · {events.length}
      </h2>

      {closing.length > 0 && (
        <div className="mb-[32px]">
          <h3 className="font-lato font-black text-[20px] md:text-[22px] text-brand-magenta mb-[10px]">{esCL.home.ultimosDias}</h3>
          <TileGrid events={closingExpanded ? closing : closing.slice(0, INITIAL_VISIBLE_CLOSING)} today={today} />
          {closing.length > INITIAL_VISIBLE_CLOSING && (
            <ExpandButton expanded={closingExpanded} label={esCL.home.seeAllClosing(closing.length)} onClick={() => setClosingExpanded((e) => !e)} />
          )}
        </div>
      )}

      {rest.length > 0 && (
        <div>
          {closing.length > 0 && <h3 className="font-lato font-black text-[20px] md:text-[22px] text-text-primary mb-[10px]">{esCL.home.restTitle}</h3>}

          {comunas.length >= MIN_COMUNAS_FOR_FILTER && (
            <div className="-mx-[16px] md:mx-0 mb-[14px]">
              <div className="flex gap-[8px] overflow-x-auto md:flex-wrap px-[16px] md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <ComunaChip label={esCL.home.allComunas} selected={comuna === null} onClick={() => pickComuna(null)} />
                {comunas.map((c) => (
                  <ComunaChip key={c} label={c} count={comunaCounts.get(c)} selected={comuna === c} onClick={() => pickComuna(c)} />
                ))}
              </div>
            </div>
          )}

          <TileGrid events={visible} today={today} />

          {filtered.length > INITIAL_VISIBLE && (
            <ExpandButton expanded={expanded} label={esCL.home.seeAll(filtered.length)} onClick={() => setExpanded((e) => !e)} />
          )}
        </div>
      )}
    </section>
  );
}

function ExpandButton({ expanded, label, onClick }: { expanded: boolean; label: string; onClick: () => void }) {
  return (
    <div className="flex justify-center mt-[20px]">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onClick}
        className="h-[40px] px-[20px] rounded-full border border-text-primary font-fragment-mono text-[13px] text-text-primary cursor-pointer hover:bg-surface-white"
      >
        {expanded ? esCL.home.seeLess : label}
      </button>
    </div>
  );
}

function ComunaChip({ label, count, selected, onClick }: { label: string; count?: number; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`shrink-0 h-[32px] px-[12px] rounded-full font-geist text-[13px] whitespace-nowrap cursor-pointer ${
        selected ? "bg-text-primary text-surface-sage font-semibold" : "bg-surface-white text-text-primary"
      }`}
    >
      {label}
      {count !== undefined && <span className={`ml-[6px] ${selected ? "text-surface-sage/70" : "text-text-secondary"}`}>{count}</span>}
    </button>
  );
}

// Also used outside the home (the ficha, venue and artist pages) — the
// cartelera's look wherever exhibitions are listed. `showPeriod` swaps
// "Hasta el…" for the full run ("12 al 28 de julio"), for past shows.
export function TileGrid({ events, today, showPeriod = false }: { events: EventRecord[]; today: string; showPeriod?: boolean }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-x-[12px] gap-y-[20px]">
      {events.map((e) => (
        <ExpoTile key={e.id} event={e} today={today} showPeriod={showPeriod} />
      ))}
    </div>
  );
}

export function ExpoTile({ event, today, showPeriod = false }: { event: EventRecord; today: string; showPeriod?: boolean }) {
  const { untilDateLine, dateLine, venueLine } = useEventCardActions(event, "expo", true);
  const closing = !showPeriod && isClosingSoon(event.runEndDate, today);

  return (
    <Link href={`/eventos/${event.id}`} className="group flex flex-col gap-[8px] min-w-0">
      <div className="relative w-full aspect-[4/5] overflow-hidden">
        <CardImage imageUrl={event.imageUrl} sourceUrl={event.sourceUrl} sensitivityTags={event.sensitivityTags} alt={event.title} compact />
      </div>
      <div className="flex flex-col gap-[3px]">
        {showPeriod
          ? dateLine && <p className="font-geist font-extrabold text-[11px] text-text-secondary">{dateLine}</p>
          : untilDateLine && (
              <p className={`font-geist font-extrabold text-[11px] ${closing ? "text-brand-magenta" : "text-text-secondary"}`}>
                {event.runEndDate === today ? esCL.home.closesToday : untilDateLine}
              </p>
            )}
        <p className="font-fragment-mono text-[14px] leading-[1.2] text-text-primary line-clamp-2 group-hover:underline">{event.title}</p>
        <p className="font-geist text-[12px] text-text-secondary line-clamp-1">{venueLine}</p>
      </div>
    </Link>
  );
}
