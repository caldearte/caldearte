"use client";

import { useState } from "react";
import Link from "next/link";
import CardImage from "./CardImage";
import { DirectionsGlyph, CalendarGlyph, ShareGlyph, WhatsAppGlyph, XGlyph, FacebookGlyph, CopyGlyph, KebabGlyph } from "./CardActionIcons";
import { useEventCardActions } from "@/lib/useEventCardActions";
import { useIsAdmin } from "@/lib/useIsAdmin";
import AdminRemoveMenuItem from "./AdminRemoveMenuItem";
import { esCL } from "@/i18n/es-CL";
import type { EventRecord } from "@/lib/events";

interface ExpoBentoCardProps {
  event: EventRecord;
  hideTodayBadge?: boolean;
  // Desktop-only image height — the section assigns this per grid slot
  // (large/tall cards vs. the smaller ones), mobile always uses its own
  // fixed 160px (178:131) regardless. No column-width prop here — that's
  // the section's own grid-column-span, not something the card decides.
  desktopImageHeightClass?: string;
}

// "Exposiciones actuales" bento card — keeps the kebab menu (unlike
// InauguracionBentoCard's visible action buttons: confirmed with the
// user this section stays kebab-only) and has no description/"ver mas".
// Mobile always stacks image-top/text-below, one column width, per
// Figma's own mobile spec (178:130) — no asymmetric sizing there either.
export default function ExpoBentoCard({ event, hideTodayBadge = false, desktopImageHeightClass = "md:h-[200px]" }: ExpoBentoCardProps) {
  const {
    showTodayBadge,
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
  } = useEventCardActions(event, "expo", hideTodayBadge);
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = useIsAdmin();
  const eventHref = `/eventos/${event.id}`;

  return (
    <div className="relative flex flex-col bg-surface-white cursor-pointer h-full">
      {/* Whole-card link — same z-index stack as InauguracionBentoCard/
          EventHorizontalListItem: overlay(1) < kebab(10) < popovers(20).
          z-[1] (not z-0) — see InauguracionBentoCard's own comment: the
          image wrapper below is `position:relative` for its own badges,
          and at equal "auto" stacking level DOM order made it paint over
          a plain z-0 overlay, silently blocking clicks on the photo. */}
      <Link href={eventHref} aria-label={esCL.eventCardAriaLabel(event.title)} className="absolute inset-0 z-[1] cursor-pointer" />

      <div className={`relative h-[160px] ${desktopImageHeightClass} shrink-0`}>
        <CardImage imageUrl={event.imageUrl} sourceUrl={event.sourceUrl} sensitivityTags={event.sensitivityTags} />
        {showTodayBadge && (
          <span className="absolute top-2 right-2 z-[5] text-[11px] font-bold uppercase tracking-wide bg-white text-heading-gray rounded-full px-2.5 py-1">
            {esCL.todayBadge}
          </span>
        )}
        {/* Desktop only — mobile folds "ÚLTIMOS DÍAS" into the date line
            below instead of overlaying the image (178:142). */}
        {closingSoon && (
          <span className="hidden md:block absolute top-[12px] left-[12px] bg-brand-magenta text-white text-[12px] font-bold tracking-[2px] px-[12px] py-[6px]">
            {esCL.ultimosDias}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-[10px] p-[16px] md:p-[20px] flex-1">
        {untilDateLine && (
          <p className={`font-geist font-extrabold text-[13px] ${closingSoon ? "text-brand-magenta" : "text-text-primary"}`}>
            {/* Mobile-only combined "ÚLTIMOS DÍAS — Hasta X" (178:142) */}
            <span className="md:hidden">{closingSoon ? `${esCL.ultimosDias} — ` : ""}</span>
            {untilDateLine}
          </p>
        )}
        <p className="font-fragment-mono text-[16px] leading-[1.2] text-text-primary">{event.title}</p>
        <div className="flex items-center justify-between gap-2 mt-auto">
          <p className="font-geist text-[13px] text-text-muted truncate">{venueLine}</p>

          <div className="relative z-10 shrink-0">
            {/* Single button, same circle/border at every breakpoint —
                used to be two separate buttons (a real 30px circle on
                desktop, a bare unstyled icon on mobile with basically no
                tap target at all). Found via mobile testing 2026-08-06:
                "es muy dificil apretar el kebab menu... toma que presione
                la card". */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen((open) => !open);
                setShareSubmenuOpen(false);
              }}
              aria-label={esCL.cardMoreOptionsAriaLabel}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="w-[40px] h-[40px] rounded-full border border-text-primary flex items-center justify-center cursor-pointer"
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
                          className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray cursor-pointer"
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
                          className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray cursor-pointer"
                          onClick={() => setMenuOpen(false)}
                        >
                          <CalendarGlyph color="black" />
                          {esCL.cardMenuAddToCalendar}
                        </a>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray cursor-pointer"
                        onClick={() => setShareSubmenuOpen(true)}
                      >
                        <ShareGlyph color="black" />
                        {esCL.cardMenuShare}
                      </button>
                      {isAdmin && (
                        <AdminRemoveMenuItem eventId={event.id} eventTitle={event.title} onRemoved={() => setMenuOpen(false)} />
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray cursor-pointer"
                        onClick={handleShareWhatsApp}
                      >
                        <WhatsAppGlyph color="black" />
                        {esCL.cardMenuWhatsApp}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray cursor-pointer"
                        onClick={handleShareTwitter}
                      >
                        <XGlyph color="black" />
                        {esCL.cardMenuTwitter}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray cursor-pointer"
                        onClick={handleShareFacebook}
                      >
                        <FacebookGlyph color="black" />
                        {esCL.cardMenuFacebook}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray cursor-pointer"
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
      </div>
    </div>
  );
}
