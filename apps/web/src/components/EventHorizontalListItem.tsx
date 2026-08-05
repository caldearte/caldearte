"use client";

import { useState } from "react";
import Link from "next/link";
import CardImage from "./CardImage";
import { useEventCardActions } from "@/lib/useEventCardActions";
import { useIsAdmin } from "@/lib/useIsAdmin";
import AdminRemoveMenuItem from "./AdminRemoveMenuItem";
import { DirectionsGlyph, CalendarGlyph, ShareGlyph, WhatsAppGlyph, XGlyph, FacebookGlyph, CopyGlyph, KebabGlyph } from "./CardActionIcons";
import { esCL } from "@/i18n/es-CL";
import type { EventRecord } from "@/lib/events";

interface EventHorizontalListItemProps {
  event: EventRecord;
  variant: "inauguracion" | "expo";
  // Only passed by SearchPanel — results span every comuna, so the venue
  // line alone isn't enough location context. Not passed by the home
  // page's own list view, which is already scoped to one selected city.
  // Appended only when not already visible inside venueLine (which itself
  // sometimes already carries a Gran Santiago comuna, via deriveComuna).
  cityName?: string;
}

// Compact "list view" card (toggle-list in the Inauguraciones/
// Exposiciones toolbar) — a thumbnail + date/badge + title + venue in one
// row, versus the full bento-split card's image-plus-text-panel. Tiled 3
// per row in a fixed-width grid column (InauguracionesSection), not a
// full-width row. No exact Figma node for this variant existed at build
// time; sized/spaced to match the density of the reference screenshot
// the user provided.
export default function EventHorizontalListItem({ event, variant, cityName }: EventHorizontalListItemProps) {
  const {
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
  } = useEventCardActions(event, variant);
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = useIsAdmin();
  const eventHref = `/eventos/${event.id}`;
  // Expo: "Hasta el X" (+ "ÚLTIMOS DÍAS —" prefix when closing soon),
  // matching ExpoBentoCard/Figma — NOT the full run range `dateLine`
  // still carries for the older kebab-menu-based ExpoCard. Inauguración
  // keeps the existing single opening-date `dateLine` unchanged.
  const badgeLine = variant === "expo" ? untilDateLine : dateLine;
  // Per the user 2026-08-04: the date reads in Caldearte black by
  // default — magenta is reserved for an inauguración's single opening
  // date and for an expo's "ÚLTIMOS DÍAS" closing warning, matching the
  // policy ExpoBentoCard/InauguracionBentoCard already use (this card was
  // the one outlier still hardcoding magenta for every date).
  const badgeColorClass = variant === "inauguracion" || closingSoon ? "text-brand-magenta" : "text-text-primary";
  const cityAlreadyShown = cityName && venueLine.toLowerCase().includes(cityName.toLowerCase());

  return (
    <div className="relative flex items-center gap-[12px] bg-surface-white p-[12px] cursor-pointer">
      {/* Whole-card link — absolutely positioned overlay (not a wrapper),
          z-[1] so the kebab button/menu (z-10+) sit as a SIBLING and take
          click precedence, same pattern as EventCardBase. Same z-index
          stack as InauguracionBentoCard's own doc comment — card
          overlay(1) < kebab(10) < popovers(20) < section sticky
          toolbar(30) < fixed top nav(40); these used to collide with the
          toolbar/nav on scroll (real bug, found 2026-08-03). z-[1] (not
          z-0) — the thumbnail wrapper below is `position:relative` with
          no z-index of its own, so at equal "auto" stacking level DOM
          order made it paint over a plain z-0 overlay, silently blocking
          clicks on the thumbnail (real bug found 2026-08-04). */}
      <Link href={eventHref} aria-label={esCL.eventCardAriaLabel(event.title)} className="absolute inset-0 z-[1] cursor-pointer" />
      <div className="relative shrink-0 w-[72px] h-[56px] overflow-hidden">
        <CardImage imageUrl={event.imageUrl} sourceUrl={event.sourceUrl} sensitivityTags={event.sensitivityTags} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
        {badgeLine && (
          <p className={`font-geist font-extrabold text-[11px] whitespace-nowrap ${badgeColorClass}`}>
            {closingSoon && `${esCL.ultimosDias} — `}
            {badgeLine}
          </p>
        )}
        <p className="font-fragment-mono text-[14px] leading-[1.2] text-text-primary truncate">{event.title}</p>
        <p className="font-geist text-[11px] text-text-muted truncate">
          {venueLine}
          {cityName && !cityAlreadyShown ? ` — ${cityName}` : ""}
        </p>
      </div>

      <div className="relative z-10 shrink-0">
        <button
          type="button"
          onClick={() => {
            setMenuOpen((open) => !open);
            setShareSubmenuOpen(false);
          }}
          aria-label={esCL.cardMoreOptionsAriaLabel}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="w-8 h-8 rounded-full border border-border-default flex items-center justify-center"
        >
          <span className="rotate-90 inline-block">
            <KebabGlyph color="#3d373d" />
          </span>
        </button>
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
            <div role="menu" className="absolute top-full right-0 mt-2 z-20 min-w-[190px] overflow-hidden rounded-xl bg-white shadow-lg py-1">
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
                  {isAdmin && <AdminRemoveMenuItem eventId={event.id} eventTitle={event.title} onRemoved={() => setMenuOpen(false)} />}
                </>
              ) : (
                <>
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
          <div className="absolute top-full right-0 mt-2 z-20 whitespace-nowrap rounded-lg bg-black/80 text-white text-xs px-2.5 py-1.5">
            {esCL.shareLinkCopied}
          </div>
        )}
      </div>
    </div>
  );
}
