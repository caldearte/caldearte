"use client";

import { useState } from "react";
import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { fmtAgendaDay, fmtAgendaPillDay, fmtAgendaPillHour, santiagoDateOfIso, todayInSantiago } from "@/lib/date";
import { eventComuna } from "@/lib/event-utils";
import { useEventCardActions } from "@/lib/useEventCardActions";
import type { EventRecord } from "@/lib/events";
import { resolveArtistDisplay, titleWithTypePrefix } from "@/lib/social/flyerText";
import { CalendarGlyph, DirectionsGlyph } from "./CardActionIcons";
import CardImage from "./CardImage";

interface AgendaSectionProps {
  inauguraciones: EventRecord[];
  visitasGuiadas: EventRecord[];
  regionName: string;
  today: string;
  // Days already past only fold away when looking at the real current
  // week — any other week shows every day open.
  isCurrentWeek: boolean;
}

// The week's inauguraciones and visitas guiadas (2026-10-12) — the most
// highlighted thing on the home, so each one is a big card in the same
// look as the Instagram flyer (flyer-v2.tsx): a clean 4:5 photo with the
// flyer's pills and tags under it (AgendaCard). Grouped by day,
// Monday to Sunday — visitors plan by day, not by event type, so both
// types share one list (same reason the Instagram carousel merged them on
// 2026-08-31). On the current week, days already past stay in their place
// but folded to one line, so a Sunday visitor isn't scrolling past six
// days that are over.
export default function AgendaSection({ inauguraciones, visitasGuiadas, regionName, today, isCurrentWeek }: AgendaSectionProps) {
  const groups = groupByDay([...inauguraciones, ...visitasGuiadas].filter((e) => e.openingDatetime !== null));
  const firstUpcoming = groups.findIndex((g) => !isCurrentWeek || g.date >= today);

  return (
    // No visible section title (Daniel, 2026-10-12): the h1 already says
    // which week and where, and the cards' own "Inauguración: …" tags say
    // what they are. The name stays for screen readers.
    <section aria-label={esCL.home.agendaTitle} className="mt-[24px]">

      {groups.length === 0 && <p className="font-geist text-[15px] text-text-primary">{esCL.home.agendaEmpty(regionName)}</p>}

      {/* Days flow side by side, each spanning as many columns as it has
          events — on desktop a day with one opening shares its row with
          the next days instead of leaving two thirds of it empty. Same
          20px gap inside and between days, so the cards line up. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-[16px] md:gap-x-[20px] gap-y-[44px] md:gap-y-[56px]">
        {groups.map((g, i) => (
          <DayBlock key={g.date} group={g} today={today} past={isCurrentWeek && g.date < today} firstImagePriority={i === firstUpcoming} />
        ))}
      </div>
    </section>
  );
}

interface DayGroup {
  date: string; // YYYY-MM-DD, Chilean calendar date
  events: EventRecord[];
}

// Chronological, so days come out Monday to Sunday.
function groupByDay(events: EventRecord[]): DayGroup[] {
  const sorted = [...events].sort((a, b) => a.openingDatetime!.localeCompare(b.openingDatetime!));
  const groups: DayGroup[] = [];
  for (const e of sorted) {
    const date = santiagoDateOfIso(e.openingDatetime!);
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.events.push(e);
    else groups.push({ date, events: [e] });
  }
  return groups;
}

// Column span of a day in the outer grid, and its own inner columns —
// written out in full so Tailwind sees every class.
const SPAN: Record<1 | 2 | 3, string> = { 1: "", 2: "sm:col-span-2", 3: "sm:col-span-2 lg:col-span-3" };
const INNER_COLS: Record<1 | 2 | 3, string> = { 1: "grid-cols-1", 2: "grid-cols-1 sm:grid-cols-2", 3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" };

function DayBlock({ group, today, past, firstImagePriority }: { group: DayGroup; today: string; past: boolean; firstImagePriority: boolean }) {
  const [open, setOpen] = useState(!past);
  const heading = fmtAgendaDay(group.date, today);
  const n = Math.min(group.events.length, 3) as 1 | 2 | 3;

  if (past && !open) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => setOpen(true)}
        className="col-span-full w-full flex items-baseline justify-between gap-3 border-b border-text-primary/15 pb-[8px] text-left cursor-pointer"
      >
        <span className="font-lato font-black text-[22px] md:text-[26px] text-text-secondary">{heading}</span>
        <span className="font-fragment-mono text-[13px] text-text-secondary underline">{esCL.home.agendaPastDay(group.events.length)}</span>
      </button>
    );
  }

  return (
    <div className={`${SPAN[n]} ${past ? "opacity-70" : ""}`}>
      <h3 className="font-lato font-black text-[22px] md:text-[26px] text-text-primary mb-[16px]">{heading}</h3>
      <div className={`grid ${INNER_COLS[n]} gap-[16px] md:gap-[20px]`}>
        {group.events.map((e, i) => (
          <AgendaCard key={e.id} event={e} priority={firstImagePriority && i === 0} />
        ))}
      </div>
    </div>
  );
}

// The agenda's card grid, for lists outside the home (the ficha, venue and
// artist pages) — same columns as a day block here. Events must have an
// openingDatetime (see splitAgendaAndCartelera).
export function AgendaGrid({ events }: { events: EventRecord[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-[16px] md:gap-x-[20px] gap-y-[32px]">
      {events.map((e) => (
        <AgendaCard key={e.id} event={e} />
      ))}
    </div>
  );
}

// The flyer's pieces, under the photo instead of on it (Daniel,
// 2026-10-12: overlays suit Instagram, on the site the image should stay
// clean): a clean 4:5 photo, then one tag with the artist line, the
// "Inauguración: …" / "Visita guiada: …" title line, the magenta
// "COMUNA · DÍA · HORA" pill, the venue on its own line, and the "Cómo llegar" /
// "Agregar al calendario" buttons — white here, since the page itself is
// the flyer's sage. The tag spans the card's width (for the buttons);
// long text wraps, balanced, like the flyer's.
export function AgendaCard({ event, priority = false }: { event: EventRecord; priority?: boolean }) {
  const type = event.eventType === "visita_guiada" ? "visita_guiada" : "inauguracion";
  const title = titleWithTypePrefix(event.title, type);
  const artist = resolveArtistDisplay(event.artist);
  const venue = event.placeName ?? event.freeformLocation;
  const comuna = eventComuna(event);
  // "inauguracion" variant for both types: a visita guiada is just as much
  // a dated, timed thing to put in a calendar.
  const { mapsHref, calendarHref } = useEventCardActions(event, "inauguracion", true);
  // While a sensitive photo is still blurred, the photo sits above the
  // card's link so its "Ver contenido" button gets the tap; once revealed
  // it drops back and the photo opens the ficha like the rest of the card.
  const [revealed, setRevealed] = useState(false);
  const photoBlocksLink = event.sensitivityTags.length > 0 && !revealed;
  const button =
    "relative z-10 w-full h-[44px] flex items-center justify-center gap-[10px] border border-text-primary bg-surface-white font-fragment-mono text-[13px] text-text-primary hover:bg-surface-sage";

  return (
    <div className="group relative flex flex-col gap-[12px]">
      {/* Whole-card link as an overlay, not a wrapper — the action buttons
          below are links of their own, and a link can't nest inside
          another. They sit above it (z-10) and take their own clicks. */}
      <Link href={`/eventos/${event.id}`} aria-label={esCL.eventCardAriaLabel(event.title)} className="absolute inset-0 z-[1]" />

      {/* Photo first, so photos side by side always start on the same
          line; the info tag follows at its own natural height. */}
      <div className={`relative w-full aspect-[4/5] overflow-hidden bg-stone-800 ${photoBlocksLink ? "z-[2]" : ""}`}>
        <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.02]">
          <CardImage
            imageUrl={event.imageUrl}
            sourceUrl={event.sourceUrl}
            sensitivityTags={event.sensitivityTags}
            priority={priority}
            alt={event.title}
            onReveal={() => setRevealed(true)}
          />
        </div>
      </div>

      <div className="w-full flex flex-col gap-[6px] rounded-[22px] bg-surface-white px-[16px] pt-[10px] pb-[16px]">
        {artist && (
          <span className="font-geist font-semibold text-[11px] leading-[1.25] tracking-[1px] uppercase text-text-secondary [text-wrap:balance]">{artist}</span>
        )}
        <span className="font-lato font-black text-[17px] leading-[1.3] tracking-[0.3px] uppercase text-brand-magenta [text-wrap:balance] group-hover:underline">{title}</span>
        <span className="w-fit mt-[4px] rounded-full bg-brand-magenta px-[10px] py-[4px] font-lato font-black text-[12px] uppercase tracking-[0.3px] text-white">
          {comuna} · {fmtAgendaPillDay(event.openingDatetime!, todayInSantiago())} · {fmtAgendaPillHour(event.openingDatetime!, event.openingTimeConfirmed)}
        </span>
        {venue && <span className="font-geist font-semibold text-[11px] leading-[1.25] tracking-[1px] uppercase text-text-secondary">{venue}</span>}

        {/* Full-width and stacked (Daniel, 2026-10-12: "Cómo llegar" is
            the one he always uses) — big, easy targets on a phone. Same
            look as the ficha's action buttons. */}
        {(mapsHref || calendarHref) && (
          <div className="flex flex-col gap-[8px] mt-[10px]">
            {mapsHref && (
              <a href={mapsHref} target="_blank" rel="noopener noreferrer" className={button}>
                <DirectionsGlyph color="#3d373d" />
                {esCL.cardMenuDirections}
              </a>
            )}
            {calendarHref && (
              <a href={calendarHref} target="_blank" rel="noopener noreferrer" className={button}>
                <CalendarGlyph color="#3d373d" />
                {esCL.home.addToCalendar}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
