"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CardImage from "./CardImage";
import { useEventCardActions } from "@/lib/useEventCardActions";
import { useIsAdmin } from "@/lib/useIsAdmin";
import AdminRemoveMenuItem from "./AdminRemoveMenuItem";
import AdminRemoveReasonMenu from "./AdminRemoveReasonMenu";
import AdminSensitiveMenuItem from "./AdminSensitiveMenuItem";
import { ADMIN_SENSITIVE_TAG } from "@/lib/useAdminToggleSensitive";
import { DirectionsGlyph, ExternalLinkGlyph, CalendarGlyph, WhatsAppGlyph, XGlyph, FacebookGlyph, CopyGlyph, ShareGlyph, BackArrowGlyph, KebabGlyph } from "./CardActionIcons";
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
  const [removeReasonOpen, setRemoveReasonOpen] = useState(false);
  const isAdmin = useIsAdmin();
  const router = useRouter();

  return (
    <div className="relative bg-black rounded-2xl overflow-hidden flex flex-col h-full">
      {/* Whole-card link to the event's own /eventos/[id] permalink — an
          absolutely positioned overlay, not a wrapper, specifically so the
          kebab button/menu below (both explicitly z-20) can sit as SIBLINGS
          and take click precedence over this z-10 overlay instead of being
          invalidly nested inside an <a> (real <a>/<button> menu items can't
          nest inside another <a>). */}
      <Link href={`/eventos/${event.id}`} aria-label={esCL.eventCardAriaLabel(event.title)} className="absolute inset-0 z-10" />
      <div className={`relative shrink-0 h-[185.53px] ${imageAspectClass}`}>
        <CardImage imageUrl={event.imageUrl} sourceUrl={event.sourceUrl} sensitivityTags={event.sensitivityTags} />
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
          quiero para desktop tambien"). */}
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
                setRemoveReasonOpen(false);
              }}
            />
            <div role="menu" className="absolute bottom-10 right-0 z-20 min-w-[190px] overflow-hidden rounded-xl bg-white shadow-lg py-1">
              {removeReasonOpen ? (
                <AdminRemoveReasonMenu
                  eventId={event.id}
                  onBack={() => setRemoveReasonOpen(false)}
                  onRemoved={() => {
                    setMenuOpen(false);
                    // Card lists are server-fetched props all the way from
                    // app/page.tsx — a full refetch is the simplest correct
                    // way to make the removed card actually disappear.
                    router.refresh();
                  }}
                />
              ) : !shareSubmenuOpen ? (
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
                  {event.sourceUrl && (
                    <a
                      href={event.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      role="menuitem"
                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray cursor-pointer"
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
                    <AdminSensitiveMenuItem
                      eventId={event.id}
                      initialMarked={event.sensitivityTags.includes(ADMIN_SENSITIVE_TAG)}
                      onToggled={() => setMenuOpen(false)}
                    />
                  )}
                  {isAdmin && <AdminRemoveMenuItem onClick={() => setRemoveReasonOpen(true)} />}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray cursor-pointer"
                    onClick={() => setShareSubmenuOpen(false)}
                  >
                    <BackArrowGlyph color="black" />
                    {esCL.cardMenuBack}
                  </button>
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
          <div className="absolute bottom-10 right-0 z-20 whitespace-nowrap rounded-lg bg-black/80 text-white text-xs px-2.5 py-1.5">
            {esCL.shareLinkCopied}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setMenuOpen((open) => !open);
            setShareSubmenuOpen(false);
            setRemoveReasonOpen(false);
          }}
          aria-label={esCL.cardMoreOptionsAriaLabel}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="relative z-20 w-[40px] h-[40px] rounded-full border border-white/70 flex items-center justify-center cursor-pointer"
        >
          <KebabGlyph />
        </button>
      </div>
    </div>
  );
}
