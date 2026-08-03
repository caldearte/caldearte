"use client";

import { useState } from "react";
import Link from "next/link";
import CardImage from "./CardImage";
import { useEventCardActions } from "@/lib/useEventCardActions";
import { DirectionsGlyph, CalendarGlyph, ShareGlyph, WhatsAppGlyph, XGlyph, FacebookGlyph, CopyGlyph, KebabGlyph } from "./CardActionIcons";
import { esCL } from "@/i18n/es-CL";
import type { EventRecord } from "@/lib/events";

interface EventHorizontalListItemProps {
  event: EventRecord;
  variant: "inauguracion" | "expo";
}

// Compact "list view" card (toggle-list in the Inauguraciones/
// Exposiciones toolbar) — a thumbnail + date/badge + title + venue in one
// row, versus the full bento-split card's image-plus-text-panel. No
// exact Figma node for this variant existed at build time; sized/spaced
// to match the density of the reference screenshot the user provided.
export default function EventHorizontalListItem({ event, variant }: EventHorizontalListItemProps) {
  const { dateLine, venueLine, mapsHref, calendarHref, shareSubmenuOpen, setShareSubmenuOpen, linkCopied, handleShareWhatsApp, handleShareTwitter, handleShareFacebook, handleCopyLink } =
    useEventCardActions(event, variant);
  const [menuOpen, setMenuOpen] = useState(false);
  const eventHref = `/eventos/${event.id}`;

  return (
    <div className="relative flex items-center gap-[16px] bg-surface-white p-[12px]">
      <Link href={eventHref} className="relative block shrink-0 w-[96px] h-[72px] overflow-hidden">
        <CardImage imageUrl={event.imageUrl} sourceUrl={event.sourceUrl} sensitivityTags={event.sensitivityTags} />
      </Link>
      <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
        {dateLine && <p className="font-geist font-extrabold text-[12px] text-brand-magenta whitespace-nowrap">{dateLine}</p>}
        <Link href={eventHref} className="font-fragment-mono text-[15px] leading-[1.2] text-text-primary truncate">
          {event.title}
        </Link>
        <p className="font-geist text-[12px] text-text-muted truncate">{venueLine}</p>
      </div>

      <div className="relative shrink-0">
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
