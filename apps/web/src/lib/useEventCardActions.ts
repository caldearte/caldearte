"use client";

import { useState } from "react";
import {
  anchorDateOnly,
  buildGoogleCalendarUrl,
  fmtInauguracionDate,
  fmtOpeningHour,
  fmtPeriod,
  fmtUntilDate,
  isActiveOn,
  isClosingSoon as computeIsClosingSoon,
  todayInSantiago,
} from "@/lib/date";
import { deriveComuna } from "@/lib/comuna";
import { esCL } from "@/i18n/es-CL";
import type { EventRecord } from "@/lib/events";

// Shared business logic behind every event card's date/venue text and
// action buttons (Cómo llegar/Agregar/Compartir) — extracted from
// EventCardBase (rediseño 2.0.0) so the new bento/list card variants can
// reuse it instead of re-deriving the same rules (which have already had
// real bugs fixed in them — see the date-line comment below).
export function useEventCardActions(event: EventRecord, variant: "inauguracion" | "expo", hideTodayBadge = false) {
  const anchor = anchorDateOnly(event);
  // An inauguración is a single-day happening (the opening night itself),
  // never a range — real bug, found 2026-07-31: this used to check the
  // full run range for both variants, so an inauguración card kept
  // showing "HOY" for the entire multi-week run that followed its actual
  // (already-past) opening date.
  const showTodayBadge =
    !hideTodayBadge && (variant === "inauguracion" ? anchor === todayInSantiago() : isActiveOn(event, todayInSantiago()));
  const dateLine =
    variant === "inauguracion" && event.openingDatetime
      ? `${fmtInauguracionDate(event.openingDatetime)} - ${
          event.openingTimeConfirmed ? fmtOpeningHour(event.openingDatetime) : esCL.consultHourWithVenue
        }`
      : // "expo" variant: just the exhibition's run range, never an hour —
        // real bug, found 2026-07-20: this used to append the same hour
        // suffix as the inauguración variant.
        anchor && fmtPeriod(event.runStartDate, event.runEndDate, anchor);

  // Rediseño 2.0.0 bento/list cards — expo variant only. NOT the same as
  // `dateLine` above (which the older kebab-menu-based EventCardBase/
  // ExpoCard still render as the full run range): Figma's new cards show
  // just the closing date ("Hasta el 2 de Septiembre"), magenta + prefixed
  // "ÚLTIMOS DÍAS —" once the run is within a week of ending. Kept as a
  // separate field rather than changing `dateLine` itself, so the older
  // full-range display doesn't silently change underneath it.
  const untilDateLine = variant === "expo" && anchor ? fmtUntilDate(event.runEndDate, anchor) : null;
  const closingSoon = variant === "expo" && computeIsClosingSoon(event.runEndDate, todayInSantiago());

  const displayedVenue = event.placeName ?? event.freeformLocation;
  const comuna = deriveComuna(event.freeformLocation, event.placeName);
  // Don't repeat the comuna if it's already visible inside the venue text
  // itself (e.g. "MAC Quinta Normal" already says Quinta Normal).
  const comunaAlreadyShown = comuna !== null && displayedVenue.toLowerCase().includes(comuna.toLowerCase());
  const venueLine = comuna && !comunaAlreadyShown ? `${displayedVenue} — ${comuna}` : displayedVenue;

  // "Cómo llegar" — Google Maps DIRECTIONS (not a plain search pin). No
  // lat/lng needed — Maps resolves a text address itself.
  const mapsQuery = venueLine.trim() ? `${venueLine}, Chile` : null;
  const mapsHref = mapsQuery ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery)}` : null;

  // "Agregar a mi calendario" — inauguraciones only (expos have no single
  // event moment) and only once a real opening date exists.
  const calendarHref =
    variant === "inauguracion" && event.openingDatetime
      ? buildGoogleCalendarUrl({
          title: event.title,
          openingDatetime: event.openingDatetime,
          openingTimeConfirmed: event.openingTimeConfirmed,
          description: event.description,
          sourceUrl: event.sourceUrl,
          venueLine,
        })
      : null;

  const [shareSubmenuOpen, setShareSubmenuOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Deliberately NOT navigator.share — see EventCardBase's own doc
  // comment: the OS-native sheet is inconsistent across platforms, and a
  // custom menu with explicit, always-available targets is more
  // predictable for this audience (WhatsApp specifically dominates here).
  function eventUrl(): string {
    return `${window.location.origin}/eventos/${event.id}`;
  }

  function openShareIntent(url: string) {
    setShareSubmenuOpen(false);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleShareWhatsApp() {
    openShareIntent(`https://api.whatsapp.com/send?text=${encodeURIComponent(`${event.title} — ${eventUrl()}`)}`);
  }

  function handleShareTwitter() {
    openShareIntent(`https://twitter.com/intent/tweet?text=${encodeURIComponent(event.title)}&url=${encodeURIComponent(eventUrl())}`);
  }

  function handleShareFacebook() {
    openShareIntent(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(eventUrl())}`);
  }

  function handleCopyLink() {
    setShareSubmenuOpen(false);
    navigator.clipboard
      .writeText(eventUrl())
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch(() => {
        // clipboard permission denied/unavailable — no-op, best-effort
      });
  }

  return {
    showTodayBadge,
    dateLine,
    untilDateLine,
    closingSoon,
    venueLine,
    mapsHref,
    calendarHref,
    shareSubmenuOpen,
    setShareSubmenuOpen,
    linkCopied,
    handleShareWhatsApp,
    handleShareTwitter,
    handleShareFacebook,
    handleCopyLink,
  };
}
