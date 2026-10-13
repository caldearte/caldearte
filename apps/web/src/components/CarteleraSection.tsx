"use client";

import { useState } from "react";
import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { fmtUntilPill, isClosingSoon } from "@/lib/date";
import { eventComuna } from "@/lib/event-utils";
import { useEventCardActions } from "@/lib/useEventCardActions";
import { resolveArtistDisplay } from "@/lib/social/flyerText";
import type { EventRecord } from "@/lib/events";
import CardImage from "./CardImage";

interface CarteleraSectionProps {
  events: EventRecord[]; // already sorted soonest-closing first (splitInauguracionesYExpos)
  today: string;
}

// 12 fills two desktop rows of "Siguen en cartelera" (6 columns — smaller
// than the agenda's cards on purpose, Daniel 2026-10-13) and six mobile
// rows (2 columns); past that, the list is a click away instead of a
// 15-page slider.
const INITIAL_VISIBLE = 12;
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
          <TileGrid events={closingExpanded ? closing : closing.slice(0, INITIAL_VISIBLE_CLOSING)} today={today} variant="closing" />
          {closing.length > INITIAL_VISIBLE_CLOSING && (
            <ExpandButton expanded={closingExpanded} label={esCL.home.seeAllClosing(closing.length)} onClick={() => setClosingExpanded((e) => !e)} />
          )}
        </div>
      )}

      {rest.length > 0 && (
        <div>
          {closing.length > 0 && <h3 className="font-lato font-black text-[20px] md:text-[22px] text-text-primary mb-[10px]">{esCL.home.restTitle}</h3>}

          {comunas.length >= MIN_COMUNAS_FOR_FILTER && (
            <div className="-mx-[18px] md:mx-0 mb-[14px]">
              <div className="flex gap-[8px] overflow-x-auto md:flex-wrap px-[18px] md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <ComunaChip label={esCL.home.allComunas} selected={comuna === null} onClick={() => pickComuna(null)} />
                {comunas.map((c) => (
                  <ComunaChip key={c} label={c} count={comunaCounts.get(c)} selected={comuna === c} onClick={() => pickComuna(c)} />
                ))}
              </div>
            </div>
          )}

          <TileGrid events={visible} today={today} wide variant="minimal" />

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
// `wide` = 6 desktop columns instead of 5 — the home's "Siguen en
// cartelera", the longest list. Class strings written out for Tailwind.
// `variant` picks which lines the tile's tag carries (see ExpoTile).
export function TileGrid({
  events,
  today,
  showPeriod = false,
  wide = false,
  variant = "full",
}: {
  events: EventRecord[];
  today: string;
  showPeriod?: boolean;
  wide?: boolean;
  variant?: TileVariant;
}) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 ${wide ? "xl:grid-cols-6" : "xl:grid-cols-5"} gap-x-[12px] gap-y-[20px]`}>
      {events.map((e) => (
        <ExpoTile key={e.id} event={e} today={today} showPeriod={showPeriod} variant={variant} />
      ))}
    </div>
  );
}

// Which lines a tile's tag carries (Daniel, 2026-10-13):
//   full    — artist, title, "HASTA…" pill, venue (ficha, venue/artist pages)
//   closing — "HASTA…" pill first, title, venue; no artist ("Últimos días":
//             when it closes is the point)
//   minimal — title and artist only ("Siguen en cartelera", the long list)
// Every line is a single line ("…" past it) and the artist line stays even
// when blank, so tiles in a grid end at the same height.
export type TileVariant = "full" | "closing" | "minimal";

export function ExpoTile({ event, today, showPeriod = false, variant = "full" }: { event: EventRecord; today: string; showPeriod?: boolean; variant?: TileVariant }) {
  const { dateLine, venueLine } = useEventCardActions(event, "expo", true);
  const artist = resolveArtistDisplay(event.artist);
  // Past shows (venue/artist pages) read their full run; current ones,
  // when they close.
  const pill = showPeriod ? (dateLine ?? "").toUpperCase() : event.runEndDate ? fmtUntilPill(event.runEndDate, today) : null;

  const artistLine = (
    <span aria-hidden={artist ? undefined : true} className="block w-full truncate font-geist font-semibold text-[10px] leading-[1.25] tracking-[1px] uppercase text-text-secondary">
      {artist ?? "\u00a0"}
    </span>
  );
  const pillTag = pill && (
    <span className="rounded-[12px] bg-brand-magenta px-[9px] py-[3px] font-lato font-black text-[11px] leading-[1.35] uppercase tracking-[0.3px] text-white [text-wrap:balance]">
      {pill}
    </span>
  );

  // Same build as the agenda's cards (Daniel, 2026-10-13), a size smaller:
  // a clean 4:5 photo, then one white tag — gray artist, magenta Lato Black
  // title, magenta "HASTA…" pill, gray venue, per the variant above.
  return (
    <Link href={`/eventos/${event.id}`} className="group flex flex-col gap-[10px] min-w-0">
      <div className="relative w-full aspect-[4/5] overflow-hidden">
        <CardImage imageUrl={event.imageUrl} sourceUrl={event.sourceUrl} sensitivityTags={event.sensitivityTags} alt={event.title} compact />
      </div>
      <div className="w-full flex flex-col items-start gap-[5px] rounded-[18px] bg-surface-white px-[12px] pt-[9px] pb-[11px]">
        {variant === "closing" && pillTag}
        {variant === "full" && artistLine}
        <span title={event.title} className="block w-full truncate font-lato font-black text-[14px] leading-[1.25] tracking-[0.2px] uppercase text-brand-magenta group-hover:underline">
          {event.title}
        </span>
        {variant === "minimal" && artistLine}
        {variant === "full" && pillTag}
        {variant !== "minimal" && (
          <span title={venueLine} className="block w-full truncate font-geist font-semibold text-[10px] leading-[1.3] tracking-[1px] uppercase text-text-secondary">
            {venueLine}
          </span>
        )}
      </div>
    </Link>
  );
}
