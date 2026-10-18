"use client";

import { useState } from "react";
import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { fmtAgendaDay, fmtAgendaPillDay, fmtAgendaPillHour, fmtUntilPill, santiagoDateOfIso, todayInSantiago } from "@/lib/date";
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
  // Days already past only dim when looking at the real current week —
  // any other week shows every day in full colour.
  isCurrentWeek: boolean;
}

// The week's inauguraciones and visitas guiadas (2026-10-12) — the most
// highlighted thing on the home, so each one is a big card in the same
// look as the Instagram flyer (flyer-v2.tsx): a clean 4:5 photo with the
// flyer's pills and tags under it (AgendaCard). On a phone each one is a
// row instead (2026-10-18, see AgendaCard). Ordered by day,
// Monday to Sunday — visitors plan by day, not by event type, so both
// types share one list (same reason the Instagram carousel merged them on
// 2026-08-31). On the current week, days already past stay in their place,
// cards and all, but dimmed (Daniel, 2026-10-18: folded to one line, a
// Sunday visitor saw an empty week), so what's still ahead stands out.
export default function AgendaSection({ inauguraciones, visitasGuiadas, regionName, today, isCurrentWeek }: AgendaSectionProps) {
  const groups = groupByDay([...inauguraciones, ...visitasGuiadas].filter((e) => e.openingDatetime !== null));
  // The first card of the first day still to come loads its photo first.
  const priorityId = groups.find((g) => !isCurrentWeek || g.date >= today)?.events[0]?.id;

  return (
    // No visible section title (Daniel, 2026-10-12): the h1 already says
    // which week and where, and the cards' own "Inauguración: …" tags say
    // what they are. The name stays for screen readers.
    <section aria-label={esCL.home.agendaTitle} className="mt-[24px]">
      {groups.length === 0 && <p className="font-geist text-[15px] text-text-primary">{esCL.home.agendaEmpty(regionName)}</p>}

      {/* One continuous grid, Monday to Sunday (Daniel, 2026-10-13): cards
          flow into the next free column, so a day that doesn't fit in what
          a row has left no longer drops whole to the next row and leaves a
          hole. The day's name sits over its first card; its other cards get
          an invisible copy of the heading (from sm up) so photos in a row
          still line up. A day can now wrap across rows — each card's pill
          also names its day. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-[16px] md:gap-x-[20px] gap-y-[10px] sm:gap-y-[36px] md:gap-y-[56px]">
        {groups.flatMap((g) => {
          const heading = fmtAgendaDay(g.date, today);
          const past = isCurrentWeek && g.date < today;
          return g.events.map((e, i) => {
            return (
              <div key={e.id} className={past ? PAST_DAY : ""}>
                {i === 0 ? (
                  <h3 className={`${DAY_HEADING} ${past ? "text-text-secondary" : "text-text-primary"}`}>{heading}</h3>
                ) : (
                  <div aria-hidden="true" className={`${DAY_HEADING} invisible hidden sm:block`}>
                    {heading}
                  </div>
                )}
                <AgendaCard event={e} priority={e.id === priorityId} pastDay={past} />
              </div>
            );
          });
        })}
      </div>
    </section>
  );
}

// The extra top margin on phones separates one day from the next, now
// that rows sit 10px apart there.
const DAY_HEADING = "font-lato font-black text-[22px] md:text-[26px] leading-tight mb-[12px] sm:mb-[16px] max-sm:mt-[22px]";
// A day already over, in the disabled look the site uses elsewhere (faded,
// like the week picker's other months), plus grey so the magenta doesn't
// compete with what's still ahead. Its cards drop the calendar button and
// say when it opened instead (AgendaCard's `pastDay`).
// Still a link, and on hover the card gets its colour back.
const PAST_DAY = "opacity-60 grayscale transition-[opacity,filter] duration-200 hover:opacity-100 hover:grayscale-0";

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

// The agenda's card grid, for lists outside the home (the ficha, venue and
// artist pages) — same columns as a day block here. Events must have an
// openingDatetime (see splitAgendaAndCartelera).
export function AgendaGrid({ events }: { events: EventRecord[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-[16px] md:gap-x-[20px] gap-y-[10px] sm:gap-y-[32px]">
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
// `history` (venue and artist pages, 2026-10-13): every show there gets
// this card, past and running ones too. Only an opening still ahead keeps
// the "Inauguración:" prefix, the day + hour pill and the calendar button;
// a running show's pill says until when ("HASTA EL 15 OCT"), a past one's
// its run ("12 AL 28 DE JULIO"), and a past one drops "Cómo llegar".
// `pastDay` (home agenda, a day of this week already over, 2026-10-18):
// history mode, except the pill says what happened that day — "INAUGURÓ
// MIÉ 14 OCT" / "VISITA CONCLUIDA MIÉ 14 OCT" — never "HASTA …", which is
// the cartelera's language, where the show lands from next week on
// (Daniel) — and every card keeps "Cómo llegar" (Daniel, 2026-10-18).
// `hideVenue` / `hideArtist`: the page is already that venue's (comuna
// too) or that artist's.
// Below sm (2026-10-18, Daniel): one row — a 96px 4:5 thumbnail, the tag
// beside it, no buttons (they're on the ficha). A full-screen card per
// event made the home 17.6 phone screens long, and didn't read as "there's
// a lot on". From sm up, the big card as before.
export function AgendaCard({
  event,
  priority = false,
  history: historyMode = false,
  pastDay = false,
  hideVenue = false,
  hideArtist = false,
}: {
  event: EventRecord;
  priority?: boolean;
  history?: boolean;
  pastDay?: boolean;
  hideVenue?: boolean;
  hideArtist?: boolean;
}) {
  const today = todayInSantiago();
  const type = event.eventType === "visita_guiada" ? "visita_guiada" : "inauguracion";
  const history = historyMode || pastDay;
  const pastLabel = type === "inauguracion" ? "INAUGURÓ" : "VISITA CONCLUIDA";
  const openingAhead = event.openingDatetime !== null && santiagoDateOfIso(event.openingDatetime) >= today;
  const dated = !history || openingAhead;
  const title = dated ? titleWithTypePrefix(event.title, type) : event.title;
  const artist = hideArtist ? null : resolveArtistDisplay(event.artist);
  const venue = hideVenue ? null : (event.placeName ?? event.freeformLocation);
  const comuna = eventComuna(event);
  // "inauguracion" variant for both types: a visita guiada is just as much
  // a dated, timed thing to put in a calendar.
  const actions = useEventCardActions(event, "inauguracion", true);
  const { dateLine: runLine } = useEventCardActions(event, "expo", true);
  const running = event.runEndDate !== null && event.runEndDate >= today;
  const when = dated
    ? `${fmtAgendaPillDay(event.openingDatetime!, today)} · ${fmtAgendaPillHour(event.openingDatetime!, event.openingTimeConfirmed)}`
    : pastDay && event.openingDatetime
      ? `${pastLabel} ${fmtAgendaPillDay(event.openingDatetime, today)}`
      : running
        ? fmtUntilPill(event.runEndDate!, today)
        : (runLine ?? (event.openingDatetime ? fmtAgendaPillDay(event.openingDatetime, today) : "")).toUpperCase();
  const pill = [hideVenue ? null : comuna, when].filter(Boolean).join(" · ");
  const mapsHref = dated || running || pastDay ? actions.mapsHref : null;
  const calendarHref = dated ? actions.calendarHref : null;
  // While a sensitive photo is still blurred, the photo sits above the
  // card's link so its "Ver contenido" button gets the tap; once revealed
  // it drops back and the photo opens the ficha like the rest of the card.
  const [revealed, setRevealed] = useState(false);
  const photoBlocksLink = event.sensitivityTags.length > 0 && !revealed;
  const button =
    "relative z-10 w-full h-[44px] flex items-center justify-center gap-[10px] border border-text-primary bg-surface-white font-fragment-mono text-[13px] text-text-primary hover:bg-surface-sage";

  return (
    <div className="group relative flex flex-row sm:flex-col gap-[12px] max-sm:items-center max-sm:rounded-[18px] max-sm:bg-surface-white max-sm:p-[10px]">
      {/* Whole-card link as an overlay, not a wrapper — the action buttons
          below are links of their own, and a link can't nest inside
          another. They sit above it (z-10) and take their own clicks. */}
      <Link href={`/eventos/${event.id}`} aria-label={esCL.eventCardAriaLabel(event.title)} className="absolute inset-0 z-[1]" />

      {/* Photo first, so photos side by side always start on the same
          line; the info tag follows at its own natural height. */}
      {/* On a phone the blurred photo has no "Ver contenido" button (no room
          at 96px), so it never blocks the card's link there. */}
      <div className={`relative w-[96px] shrink-0 sm:w-full aspect-[4/5] overflow-hidden bg-stone-800 max-sm:rounded-[8px] ${photoBlocksLink ? "sm:z-[2]" : ""}`}>
        <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.02]">
          <CardImage
            imageUrl={event.imageUrl}
            sourceUrl={event.sourceUrl}
            sensitivityTags={event.sensitivityTags}
            priority={priority}
            alt={event.title}
            compactOnMobile
            onReveal={() => setRevealed(true)}
          />
        </div>
      </div>

      <div className="min-w-0 flex-1 sm:w-full flex flex-col gap-[6px] sm:rounded-[22px] sm:bg-surface-white sm:px-[16px] sm:pt-[10px] sm:pb-[16px]">
        {artist && (
          <span className="font-geist font-semibold text-[11px] leading-[1.25] tracking-[1px] uppercase text-text-secondary [text-wrap:balance]">{artist}</span>
        )}
        <span className="font-lato font-black text-[15px] sm:text-[17px] leading-[1.3] tracking-[0.3px] uppercase text-brand-magenta [text-wrap:balance] group-hover:underline">{title}</span>
        {/* rounded-[14px], not rounded-full: on the 3-column tablet grid
            (~200px cards) "COMUNA · DÍA · HORA" wraps to two lines, and a
            pill shape would bulge; balanced so the lines come out even. */}
        {pill && (
          <span className="w-fit mt-[4px] rounded-[14px] bg-brand-magenta px-[10px] py-[4px] font-lato font-black text-[11px] sm:text-[12px] leading-[1.35] uppercase tracking-[0.3px] text-white [text-wrap:balance]">
            {pill}
          </span>
        )}
        {venue && <span className="font-geist font-semibold text-[11px] leading-[1.25] tracking-[1px] uppercase text-text-secondary">{venue}</span>}

        {/* Full-width and stacked (Daniel, 2026-10-12: "Cómo llegar" is
            the one he always uses) — big, easy targets on a phone. Same
            look as the ficha's action buttons. */}
        {(mapsHref || calendarHref) && (
          <div className="hidden sm:flex flex-col gap-[8px] mt-[10px]">
            {mapsHref && (
              <a href={mapsHref} target="_blank" rel="noopener noreferrer" className={button} data-track="directions" data-track-event-id={event.id}>
                <DirectionsGlyph color="#3d373d" />
                {esCL.cardMenuDirections}
              </a>
            )}
            {calendarHref && (
              <a href={calendarHref} target="_blank" rel="noopener noreferrer" className={button} data-track="add_to_calendar" data-track-event-id={event.id}>
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
