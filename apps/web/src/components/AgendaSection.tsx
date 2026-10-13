"use client";

import { useState } from "react";
import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { fmtAgendaDay, fmtAgendaPillHour, santiagoDateOfIso } from "@/lib/date";
import { eventComuna } from "@/lib/event-utils";
import type { EventRecord } from "@/lib/events";
import { resolveArtistDisplay, titleWithTypePrefix } from "@/lib/social/flyerText";
import { hasShareableInauguraciones, shareInauguracionesCarousel } from "@/lib/social/shareInauguracionesCarousel";
import { ShareGlyph } from "./CardActionIcons";
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
    <section aria-labelledby="agenda-title" className="mt-[24px]">
      <div className="flex items-center justify-between gap-3 mb-[16px]">
        <h2 id="agenda-title" className="font-geist font-semibold text-[13px] tracking-[2px] uppercase text-text-secondary">
          {esCL.home.agendaTitle}
        </h2>
        <ShareWeekButton events={inauguraciones} regionName={regionName} />
      </div>

      {groups.length === 0 && <p className="font-geist text-[15px] text-text-primary">{esCL.home.agendaEmpty(regionName)}</p>}

      {/* Days flow side by side, each spanning as many columns as it has
          events — on desktop a day with one opening shares its row with
          the next days instead of leaving two thirds of it empty. Same
          20px gap inside and between days, so the cards line up. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-[16px] md:gap-x-[20px] gap-y-[28px] md:gap-y-[36px]">
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
      <h3 className="font-lato font-black text-[22px] md:text-[26px] text-text-primary mb-[12px]">{heading}</h3>
      <div className={`grid ${INNER_COLS[n]} gap-[16px] md:gap-[20px]`}>
        {group.events.map((e, i) => (
          <AgendaCard key={e.id} event={e} priority={firstImagePriority && i === 0} />
        ))}
      </div>
    </div>
  );
}

// The flyer's pieces, but around the photo instead of on it (Daniel,
// 2026-10-12: overlays suit Instagram, on the site the image should stay
// clean): the "Inauguración: …" title tag above it, magenta comuna + hour
// pills and artist / venue tags below — white here, since the page itself
// is the flyer's sage. Each tag hugs its
// own text and long text wraps, balanced, like the flyer's.
function AgendaCard({ event, priority }: { event: EventRecord; priority: boolean }) {
  const type = event.eventType === "visita_guiada" ? "visita_guiada" : "inauguracion";
  const title = titleWithTypePrefix(event.title, type);
  const artist = resolveArtistDisplay(event.artist);
  const venue = event.placeName ?? event.freeformLocation;
  const comuna = eventComuna(event);
  const pill = "max-w-full truncate rounded-full bg-brand-magenta px-[12px] py-[5px] font-lato font-black text-[12px] uppercase tracking-[0.3px] text-white";
  const tag = "w-fit max-w-full rounded-[18px] bg-surface-white px-[14px] font-geist font-semibold text-[11px] tracking-[1px] uppercase text-text-secondary";

  return (
    <Link href={`/eventos/${event.id}`} aria-label={esCL.eventCardAriaLabel(event.title)} className="group flex flex-col gap-[10px]">
      {/* Title first, above the photo — "Inauguración: …" / "Visita
          guiada: …" tells at a glance what kind of event this is (Daniel,
          2026-10-12). */}
      <span className="w-fit max-w-full rounded-[22px] bg-surface-white px-[16px] py-[10px] font-lato font-black text-[17px] leading-[1.15] tracking-[0.3px] uppercase text-brand-magenta [text-wrap:balance] group-hover:underline">
        {title}
      </span>

      <div className="relative w-full aspect-[4/5] overflow-hidden bg-stone-800">
        <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.02]">
          <CardImage imageUrl={event.imageUrl} sourceUrl={event.sourceUrl} sensitivityTags={event.sensitivityTags} priority={priority} alt={event.title} />
        </div>
      </div>

      <div className="flex flex-wrap gap-[6px]">
        <span className={pill}>{comuna}</span>
        <span className={pill}>{fmtAgendaPillHour(event.openingDatetime!, event.openingTimeConfirmed)}</span>
      </div>

      {(artist || venue) && (
        <div className="flex flex-col items-start gap-[6px]">
          {artist && <span className={`${tag} py-[8px] leading-[1.25] [text-wrap:balance]`}>{artist}</span>}
          {venue && <span className={`${tag} py-[7px] truncate`}>{venue}</span>}
        </div>
      )}
    </Link>
  );
}

// Camila's "grab this week's inauguraciones as an Instagram carousel"
// button (2026-08-31), moved here from the old Inauguraciones section
// header — same behavior, smaller footprint.
function ShareWeekButton({ events, regionName }: { events: EventRecord[]; regionName: string }) {
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
        className="flex items-center gap-1.5 h-[30px] px-3 rounded-full border border-text-primary/40 font-geist text-[12px] text-text-primary disabled:opacity-50 cursor-pointer"
      >
        <ShareGlyph color="#3d373d" />
        {status === "working" ? esCL.shareCarouselWorking : esCL.shareCarouselButton}
      </button>
      {message && <div className="absolute top-full right-0 mt-2 z-20 w-[240px] rounded-lg bg-black/80 text-white text-xs px-2.5 py-1.5">{message}</div>}
    </div>
  );
}
