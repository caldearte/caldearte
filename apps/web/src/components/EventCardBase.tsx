"use client";

import { useState } from "react";
import Link from "next/link";
import CardImage from "./CardImage";
import { useEventCardActions } from "@/lib/useEventCardActions";
import {
  DirectionsGlyph,
  ExternalLinkGlyph,
  CalendarGlyph,
  WhatsAppGlyph,
  XGlyph,
  FacebookGlyph,
  CopyGlyph,
  ShareGlyph,
  BackArrowGlyph,
  KebabGlyph,
} from "./CardActionIcons";
import { esCL } from "@/i18n/es-CL";
import type { EventRecord } from "@/lib/events";

interface EventCardBaseProps {
  event: EventRecord;
  // "inauguracion": show only the single opening date (+ hour, or a
  // consult-the-venue suggestion when no hour is confirmed) — never the
  // exhibition's full run. "expo": the exhibition's full run range, same
  // as before.
  variant: "inauguracion" | "expo";
  imageAspectClass: string; // e.g. "aspect-[520/248]"
  venueClass: string;
  titleClass: string;
  periodClass: string;
  contentPaddingClass: string;
  // True only on the event's own /eventos/[id] page: that page already
  // shows "Ver fuente original" prominently in its own attribution block
  // (see docs/risks.md's ToS note — the whole point of that page is
  // unmissable attribution), so this skips (a) the whole-card self-link
  // (pointless — the visitor is already on that exact page) and (b) the
  // collapsed kebab menu, replacing it with the other actions (Cómo
  // llegar/Agregar a mi calendario/Compartir) as visible buttons below the
  // card instead of one click away.
  standalone?: boolean;
  // Suppresses the "HOY" badge even when the event qualifies — used only by
  // the home grid when the Hoy filter pill is already on (everything
  // visible is already today, so the badge would be redundant there).
  hideTodayBadge?: boolean;
}

export default function EventCardBase({
  event,
  variant,
  imageAspectClass,
  venueClass,
  titleClass,
  periodClass,
  contentPaddingClass,
  standalone = false,
  hideTodayBadge = false,
}: EventCardBaseProps) {
  const {
    showTodayBadge,
    dateLine,
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
  } = useEventCardActions(event, variant, hideTodayBadge);

  // Both action icons collapse into a single "more options" (kebab)
  // button, opening a small menu with the two destinations, each labeled.
  // Originally mobile-only, but the user liked the collapsed UX enough
  // (2026-07-20) to want it everywhere — no more desktop/mobile split.
  const [menuOpen, setMenuOpen] = useState(false);

  const card = (
    // h-full relies on a CSS Grid context (home/archive) to resolve against
    // — the row height comes from stretch + the tallest sibling's content.
    // Standalone has no such context (no siblings, no grid), so h-full
    // would resolve against nothing and collapse to 0 — omitted there,
    // letting the card (and the now-uncropped image inside it) size to its
    // own natural content height instead.
    <div className={`relative bg-black rounded-2xl overflow-hidden flex flex-col ${standalone ? "" : "h-full"}`}>
      {/* Whole-card link to the event's own /eventos/[id] permalink — an
          absolutely positioned overlay, not a wrapper, specifically so the
          kebab button/menu below (both explicitly z-20) can sit as SIBLINGS
          and take click precedence over this z-10 overlay instead of being
          invalidly nested inside an <a> (real <a>/<button> menu items can't
          nest inside another <a>). Skipped entirely when standalone — the
          visitor is already on this exact event's own page. */}
      {!standalone && (
        <Link href={`/eventos/${event.id}`} aria-label={esCL.eventCardAriaLabel(event.title)} className="absolute inset-0 z-10" />
      )}
      <div className={`relative ${standalone ? "shrink-0" : `shrink-0 h-[185.53px] ${imageAspectClass}`}`}>
        <CardImage imageUrl={event.imageUrl} sourceUrl={event.sourceUrl} sensitivityTags={event.sensitivityTags} fullSize={standalone} />
        {showTodayBadge && (
          <span className="absolute top-2 right-2 z-[5] text-[11px] font-bold uppercase tracking-wide bg-white text-heading-gray rounded-full px-2.5 py-1">
            {esCL.todayBadge}
          </span>
        )}
      </div>
      <div className={`flex flex-col gap-1.5 ${contentPaddingClass}`}>
        <p className={`${venueClass} text-venue-gray truncate`}>{venueLine}</p>
        <p className={`${titleClass} text-white`}>{event.title}</p>
        {dateLine && <p className={`${periodClass} text-period-gray`}>{dateLine}</p>}
      </div>

      {/* A single kebab button opens a small menu with both destinations,
          each with an icon + label — same collapsed treatment on every
          screen size (originally mobile-only, promoted to desktop too on
          2026-07-20 per explicit feedback: "me encanto el menu kebab lo
          quiero para desktop tambien"). Not shown when standalone — see
          the visible button row below instead. */}
      {!standalone && (
        <div className="absolute bottom-3 right-3">
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label={esCL.cardMoreOptionsAriaLabel}
                className="fixed inset-0 z-10"
                onClick={() => {
                  setMenuOpen(false);
                  setShareSubmenuOpen(false);
                }}
              />
              <div role="menu" className="absolute bottom-10 right-0 z-20 min-w-[190px] overflow-hidden rounded-xl bg-white shadow-lg py-1">
                {!shareSubmenuOpen ? (
                  <>
                    {mapsHref && (
                      <a
                        href={mapsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        role="menuitem"
                        className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray"
                        onClick={() => setMenuOpen(false)}
                      >
                        <DirectionsGlyph color="black" />
                        {esCL.cardMenuDirections}
                      </a>
                    )}
                    {event.sourceUrl && (
                      <a
                        href={event.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        role="menuitem"
                        className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray"
                        onClick={() => setMenuOpen(false)}
                      >
                        <ExternalLinkGlyph color="black" />
                        {esCL.cardMenuSource}
                      </a>
                    )}
                    {calendarHref && (
                      <a
                        href={calendarHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        role="menuitem"
                        className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray"
                        onClick={() => setMenuOpen(false)}
                      >
                        <CalendarGlyph color="black" />
                        {esCL.cardMenuAddToCalendar}
                      </a>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray"
                      onClick={() => setShareSubmenuOpen(true)}
                    >
                      <ShareGlyph color="black" />
                      {esCL.cardMenuShare}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray"
                      onClick={() => setShareSubmenuOpen(false)}
                    >
                      <BackArrowGlyph color="black" />
                      {esCL.cardMenuBack}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray"
                      onClick={handleShareWhatsApp}
                    >
                      <WhatsAppGlyph color="black" />
                      {esCL.cardMenuWhatsApp}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray"
                      onClick={handleShareTwitter}
                    >
                      <XGlyph color="black" />
                      {esCL.cardMenuTwitter}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray"
                      onClick={handleShareFacebook}
                    >
                      <FacebookGlyph color="black" />
                      {esCL.cardMenuFacebook}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray"
                      onClick={handleCopyLink}
                    >
                      <CopyGlyph color="black" />
                      {esCL.cardMenuCopyLink}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          {linkCopied && (
            <div className="absolute bottom-10 right-0 z-20 whitespace-nowrap rounded-lg bg-black/80 text-white text-xs px-2.5 py-1.5">
              {esCL.shareLinkCopied}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setMenuOpen((open) => !open);
              setShareSubmenuOpen(false);
            }}
            aria-label={esCL.cardMoreOptionsAriaLabel}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="relative z-20 w-8 h-8 rounded-full border border-white/70 flex items-center justify-center"
          >
            <KebabGlyph />
          </button>
        </div>
      )}
    </div>
  );

  if (!standalone) return card;

  // Standalone (/eventos/[id]): the same three actions, but as visible
  // medium buttons below the card instead of collapsed into a kebab menu —
  // "Ver fuente original" is deliberately excluded here, since that page
  // already shows its own prominent attribution block separately.
  const buttonClass = "flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-heading-gray";
  return (
    <div className="relative flex flex-col gap-3">
      {card}
      <div className="flex flex-wrap gap-2">
        {mapsHref && (
          <a href={mapsHref} target="_blank" rel="noopener noreferrer" className={buttonClass}>
            <DirectionsGlyph color="black" />
            {esCL.cardMenuDirections}
          </a>
        )}
        {calendarHref && (
          <a href={calendarHref} target="_blank" rel="noopener noreferrer" className={buttonClass}>
            <CalendarGlyph color="black" />
            {esCL.cardMenuAddToCalendar}
          </a>
        )}
        <div className="relative">
          <button type="button" onClick={() => setShareSubmenuOpen((open) => !open)} className={buttonClass}>
            <ShareGlyph color="black" />
            {esCL.cardMenuShare}
          </button>
          {shareSubmenuOpen && (
            <>
              <button
                type="button"
                aria-label={esCL.cardMoreOptionsAriaLabel}
                className="fixed inset-0 z-10"
                onClick={() => setShareSubmenuOpen(false)}
              />
              <div className="absolute top-full left-0 mt-2 z-20 min-w-[190px] overflow-hidden rounded-xl bg-white border border-stone-200 shadow-lg py-1">
                {/* No "Volver" here (unlike the kebab menu's share sub-menu)
                    — this is its own standalone popover, not a step inside a
                    bigger menu with other options to return to. Clicking
                    "Compartir" again, or outside, closes it the same way. */}
                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray"
                  onClick={handleShareWhatsApp}
                >
                  <WhatsAppGlyph color="black" />
                  {esCL.cardMenuWhatsApp}
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray"
                  onClick={handleShareTwitter}
                >
                  <XGlyph color="black" />
                  {esCL.cardMenuTwitter}
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray"
                  onClick={handleShareFacebook}
                >
                  <FacebookGlyph color="black" />
                  {esCL.cardMenuFacebook}
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray"
                  onClick={handleCopyLink}
                >
                  <CopyGlyph color="black" />
                  {esCL.cardMenuCopyLink}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {linkCopied && (
        <div className="absolute -top-8 right-0 whitespace-nowrap rounded-lg bg-black/80 text-white text-xs px-2.5 py-1.5">
          {esCL.shareLinkCopied}
        </div>
      )}
    </div>
  );
}
