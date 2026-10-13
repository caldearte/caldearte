"use client";

import { useState } from "react";
import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { fmtAgendaDay, fmtOpeningHour, santiagoDateOfIso } from "@/lib/date";
import { useEventCardActions } from "@/lib/useEventCardActions";
import type { EventRecord } from "@/lib/events";
import { hasShareableInauguraciones, shareInauguracionesCarousel } from "@/lib/social/shareInauguracionesCarousel";
import { ShareGlyph } from "./CardActionIcons";
import CardImage from "./CardImage";

interface AgendaSectionProps {
  inauguraciones: EventRecord[];
  visitasGuiadas: EventRecord[];
  regionName: string;
  today: string;
  // Days already past only fold away when looking at the real current
  // week — any other week shows every day as-is.
  isCurrentWeek: boolean;
}

interface DayGroup {
  date: string;
  events: EventRecord[];
}

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

// The week's time-bound events in one list by day (2026-10-12), replacing
// separate Inauguraciones / Visitas guiadas sliders: visitors plan by day
// ("¿qué hay este finde?"), not by event type — the same reasoning that
// merged the two in the Instagram carousel on 2026-08-31. The type is a
// label on each item instead of a section of its own.
export default function AgendaSection({ inauguraciones, visitasGuiadas, regionName, today, isCurrentWeek }: AgendaSectionProps) {
  const [pastOpen, setPastOpen] = useState(false);
  const dated = [...inauguraciones, ...visitasGuiadas].filter((e) => e.openingDatetime !== null);
  const groups = groupByDay(dated);
  const upcoming = isCurrentWeek ? groups.filter((g) => g.date >= today) : groups;
  const past = isCurrentWeek ? groups.filter((g) => g.date < today) : [];
  const pastCount = past.reduce((n, g) => n + g.events.length, 0);

  return (
    <section aria-labelledby="agenda-title" className="mt-[24px]">
      <div className="flex items-center justify-between gap-3 mb-[16px]">
        <h2 id="agenda-title" className="font-geist font-semibold text-[13px] tracking-[2px] uppercase text-text-secondary">
          {esCL.home.agendaTitle}
        </h2>
        <ShareWeekButton events={inauguraciones} regionName={regionName} />
      </div>

      {upcoming.length === 0 && pastCount === 0 && <p className="font-geist text-[15px] text-text-primary">{esCL.home.agendaEmpty(regionName)}</p>}

      <div className="flex flex-col gap-[20px]">
        {upcoming.map((g, i) => (
          <DayBlock key={g.date} group={g} today={today} firstImagePriority={i === 0} />
        ))}
      </div>

      {pastCount > 0 && (
        <div className="mt-[20px]">
          <button
            type="button"
            aria-expanded={pastOpen}
            onClick={() => setPastOpen((open) => !open)}
            className="font-fragment-mono text-[13px] text-text-primary underline cursor-pointer"
          >
            {esCL.home.agendaPast(pastCount)}
          </button>
          {pastOpen && (
            <div className="flex flex-col gap-[20px] mt-[16px] opacity-70">
              {past.map((g) => (
                <DayBlock key={g.date} group={g} today={today} firstImagePriority={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DayBlock({ group, today, firstImagePriority }: { group: DayGroup; today: string; firstImagePriority: boolean }) {
  return (
    // Desktop: the day sits in its own column left of the events, like a
    // printed agenda — a day with one event doesn't leave half a row empty.
    <div className="md:grid md:grid-cols-[150px_minmax(0,1fr)] md:gap-[20px]">
      <h3 className="font-lato font-black text-[20px] md:text-[22px] leading-tight text-text-primary mb-[10px] md:mb-0 md:pt-[8px]">{fmtAgendaDay(group.date, today)}</h3>
      <div className="flex flex-col gap-[10px]">
        {group.events.map((e, i) => (
          <AgendaItem key={e.id} event={e} priority={firstImagePriority && i === 0} />
        ))}
      </div>
    </div>
  );
}

// Scan-level card: what, when, where — the full description and the
// actions (Cómo llegar, Agregar, Compartir) live on the ficha, one tap
// away.
function AgendaItem({ event, priority }: { event: EventRecord; priority: boolean }) {
  const { venueLine } = useEventCardActions(event, "inauguracion", true);
  const typeLabel = event.eventType === "visita_guiada" ? esCL.home.typeVisitaGuiada : esCL.home.typeInauguracion;
  const hour = event.openingTimeConfirmed ? fmtOpeningHour(event.openingDatetime!) : esCL.home.hourToConfirm;

  return (
    <Link href={`/eventos/${event.id}`} className="flex gap-[14px] bg-surface-white p-[10px] rounded-[2px] hover:outline hover:outline-1 hover:outline-text-primary/30">
      <div className="relative shrink-0 w-[88px] h-[110px] md:w-[112px] md:h-[140px] overflow-hidden">
        <CardImage imageUrl={event.imageUrl} sourceUrl={event.sourceUrl} sensitivityTags={event.sensitivityTags} priority={priority} alt={event.title} compact />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-[6px] py-[2px]">
        <p className="font-geist font-extrabold text-[12px] text-brand-magenta">
          {typeLabel} · {hour}
        </p>
        <p className="font-fragment-mono text-[16px] leading-[1.2] text-text-primary line-clamp-3">{event.title}</p>
        <p className="font-geist text-[13px] text-text-secondary line-clamp-2">{venueLine}</p>
        {/* Desktop only: room for a taste of the text without turning the
            list back into a wall of copy on a phone. */}
        {event.description && (
          <div className="hidden md:block mt-[2px]">
            <p className="font-geist text-[14px] leading-[1.5] text-text-primary line-clamp-2">{event.description}</p>
          </div>
        )}
      </div>
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
