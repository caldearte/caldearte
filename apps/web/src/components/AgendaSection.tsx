"use client";

import { useState } from "react";
import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { fmtAgendaPillDate, santiagoDateOfIso } from "@/lib/date";
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
  // Events already past only fold away when looking at the real current
  // week — any other week shows everything as-is.
  isCurrentWeek: boolean;
}

// The week's inauguraciones and visitas guiadas (2026-10-12) — the most
// highlighted thing on the home, so each one is a big card in the same
// layout as the Instagram flyer (flyer-v2.tsx): the photo fills a 4:5
// card, comuna + date pills top-left, artist / title / venue tags
// bottom-left (Daniel's call, comparing against the post). Chronological;
// the date pill on each card does the work day headings used to. One list
// for both types: visitors plan by day, not by event type — same reason
// the Instagram carousel merged them on 2026-08-31.
export default function AgendaSection({ inauguraciones, visitasGuiadas, regionName, today, isCurrentWeek }: AgendaSectionProps) {
  const [pastOpen, setPastOpen] = useState(false);
  const dated = [...inauguraciones, ...visitasGuiadas]
    .filter((e) => e.openingDatetime !== null)
    .sort((a, b) => a.openingDatetime!.localeCompare(b.openingDatetime!));
  const upcoming = isCurrentWeek ? dated.filter((e) => santiagoDateOfIso(e.openingDatetime!) >= today) : dated;
  const past = isCurrentWeek ? dated.filter((e) => santiagoDateOfIso(e.openingDatetime!) < today) : [];

  return (
    <section aria-labelledby="agenda-title" className="mt-[24px]">
      <div className="flex items-center justify-between gap-3 mb-[16px]">
        <h2 id="agenda-title" className="font-geist font-semibold text-[13px] tracking-[2px] uppercase text-text-secondary">
          {esCL.home.agendaTitle}
        </h2>
        <ShareWeekButton events={inauguraciones} regionName={regionName} />
      </div>

      {upcoming.length === 0 && past.length === 0 && <p className="font-geist text-[15px] text-text-primary">{esCL.home.agendaEmpty(regionName)}</p>}

      <AgendaGrid events={upcoming} today={today} />

      {past.length > 0 && (
        <div className="mt-[20px]">
          <button
            type="button"
            aria-expanded={pastOpen}
            onClick={() => setPastOpen((open) => !open)}
            className="font-fragment-mono text-[13px] text-text-primary underline cursor-pointer"
          >
            {esCL.home.agendaPast(past.length)}
          </button>
          {pastOpen && (
            <div className="mt-[16px] opacity-70">
              <AgendaGrid events={past} today={today} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function AgendaGrid({ events, today }: { events: EventRecord[]; today: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[16px] md:gap-[20px]">
      {events.map((e, i) => (
        <AgendaCard key={e.id} event={e} today={today} priority={i === 0} />
      ))}
    </div>
  );
}

// Each tag hugs its own text (w-fit) and long text wraps, balanced, rather
// than truncating — same rules as the flyer's tags. Sizes are the flyer's
// scaled to a ~340px card.
function AgendaCard({ event, today, priority }: { event: EventRecord; today: string; priority: boolean }) {
  const type = event.eventType === "visita_guiada" ? "visita_guiada" : "inauguracion";
  const title = titleWithTypePrefix(event.title, type);
  const artist = resolveArtistDisplay(event.artist);
  const venue = event.placeName ?? event.freeformLocation;
  const comuna = eventComuna(event);

  return (
    <Link href={`/eventos/${event.id}`} aria-label={esCL.eventCardAriaLabel(event.title)} className="group relative block w-full aspect-[4/5] overflow-hidden bg-stone-800">
      <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.02]">
        <CardImage imageUrl={event.imageUrl} sourceUrl={event.sourceUrl} sensitivityTags={event.sensitivityTags} priority={priority} alt={event.title} />
      </div>

      <div className="absolute left-[12px] top-[12px] right-[12px] flex flex-col items-start gap-[6px] pointer-events-none">
        <span className="max-w-full truncate rounded-full bg-brand-magenta px-[12px] py-[5px] font-lato font-black text-[12px] uppercase tracking-[0.3px] text-white">{comuna}</span>
        <span className="max-w-full truncate rounded-full bg-brand-magenta px-[12px] py-[5px] font-lato font-black text-[12px] tracking-[0.3px] text-white">
          {fmtAgendaPillDate(event.openingDatetime!, event.openingTimeConfirmed, today)}
        </span>
      </div>

      <div className="absolute left-[12px] bottom-[12px] right-[12px] flex flex-col items-start gap-[6px] pointer-events-none">
        {artist && (
          <span className="w-fit max-w-full rounded-[18px] bg-surface-sage px-[14px] py-[8px] font-geist font-semibold text-[11px] leading-[1.25] tracking-[1px] uppercase text-text-secondary [text-wrap:balance]">
            {artist}
          </span>
        )}
        {/* Clamp on an inner span: on the padded tag itself, overflow
            clips at the padding box and the 5th line peeks through. */}
        <span className="w-fit max-w-full rounded-[22px] bg-surface-sage px-[16px] py-[10px]">
          <span className="font-lato font-black text-[17px] leading-[1.15] tracking-[0.3px] uppercase text-brand-magenta [text-wrap:balance] line-clamp-4">{title}</span>
        </span>
        {venue && (
          <span className="w-fit max-w-full truncate rounded-[18px] bg-surface-sage px-[14px] py-[7px] font-geist font-semibold text-[11px] tracking-[1px] uppercase text-text-secondary">
            {venue}
          </span>
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
