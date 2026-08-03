"use client";

import Link from "next/link";
import CardImage from "./CardImage";
import { DirectionsGlyph, CalendarGlyph, ShareGlyph, WhatsAppGlyph, XGlyph, FacebookGlyph, CopyGlyph } from "./CardActionIcons";
import { useEventCardActions } from "@/lib/useEventCardActions";
import { truncateChars } from "@/lib/truncate";
import { esCL } from "@/i18n/es-CL";
import type { EventRecord } from "@/lib/events";

interface InauguracionBentoCardProps {
  event: EventRecord;
  // Alternates text-left/image-right vs. image-left/text-right — the
  // asymmetric "bento-split" layout confirmed against Figma (174:2851 /
  // 174:2870), not a uniform grid. Mobile always stacks image-top,
  // text-below regardless of this prop (mobile has no left/right variant
  // in the design, 178:72).
  reversed?: boolean;
  hideTodayBadge?: boolean;
}

const DESCRIPTION_MAX_CHARS = 220;

function ActionButton({ href, onClick, icon, label }: { href?: string; onClick?: () => void; icon: React.ReactNode; label: string }) {
  const className =
    "relative z-10 flex items-center gap-[10px] border border-text-primary px-[8px] py-[4px] text-[12px] font-fragment-mono text-text-primary whitespace-nowrap shrink-0";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {icon}
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {icon}
      {label}
    </button>
  );
}

export default function InauguracionBentoCard({ event, reversed = false, hideTodayBadge = false }: InauguracionBentoCardProps) {
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
  } = useEventCardActions(event, "inauguracion", hideTodayBadge);

  const { truncated, wasCut } = truncateChars(event.description ?? "", DESCRIPTION_MAX_CHARS);
  const eventHref = `/eventos/${event.id}`;

  const imagePanel = (
    <div className="relative flex-1 h-[220px] md:h-[500px] shrink-0">
      {/* No fullSize — that flag is for the standalone page's natural,
          uncropped aspect ratio; this bento layout needs the image
          cropped (object-cover) to fill the fixed h-[220px]/h-[500px]
          box, matching the Figma design. */}
      <CardImage imageUrl={event.imageUrl} sourceUrl={event.sourceUrl} sensitivityTags={event.sensitivityTags} />
      {showTodayBadge && (
        <span className="absolute top-2 right-2 z-[5] text-[11px] font-bold uppercase tracking-wide bg-white text-heading-gray rounded-full px-2.5 py-1">
          {esCL.todayBadge}
        </span>
      )}
    </div>
  );

  const textPanel = (
    <div className="bg-surface-white flex flex-col gap-[20px] md:gap-[40px] items-start p-[20px] md:p-[48px] w-full md:w-[440px] shrink-0">
      <div className="flex flex-col gap-[12px] md:gap-[16px] items-start w-full">
        {dateLine && <p className="font-geist font-extrabold text-[13px] text-brand-magenta whitespace-nowrap">{dateLine}</p>}
        <p className="font-fragment-mono leading-[1.1] text-[18px] md:text-[25px] text-text-primary w-full">{event.title}</p>
        <p className="font-geist text-[13px] text-text-muted md:text-text-primary w-full">{venueLine}</p>
      </div>
      {truncated && (
        <p className="font-geist text-[14px] md:text-[15px] leading-[1.5] md:leading-[1.6] text-text-primary w-full">
          {truncated}
          {wasCut && "… "}
          <span className="font-bold underline text-brand-magenta">{esCL.verMas}</span>
        </p>
      )}
      <div className="flex flex-wrap md:flex-nowrap gap-[8px] md:gap-[12px] items-center md:justify-end w-full">
        {mapsHref && <ActionButton href={mapsHref} icon={<DirectionsGlyph color="#3d373d" />} label={esCL.cardMenuDirections} />}
        {calendarHref && <ActionButton href={calendarHref} icon={<CalendarGlyph color="#3d373d" />} label={esCL.cardMenuAddToCalendar} />}
        <div className="relative">
          <ActionButton onClick={() => setShareSubmenuOpen((open) => !open)} icon={<ShareGlyph color="#3d373d" />} label={esCL.cardMenuShare} />
          {shareSubmenuOpen && (
            <>
              <button
                type="button"
                aria-label={esCL.cardMoreOptionsAriaLabel}
                className="fixed inset-0 z-10"
                onClick={() => setShareSubmenuOpen(false)}
              />
              <div className="absolute top-full left-0 mt-2 z-20 min-w-[190px] overflow-hidden rounded-xl bg-white border border-stone-200 shadow-lg py-1">
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
          {linkCopied && (
            <div className="absolute -top-8 left-0 z-20 whitespace-nowrap rounded-lg bg-black/80 text-white text-xs px-2.5 py-1.5">
              {esCL.shareLinkCopied}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`relative flex flex-col rounded-[2px] md:rounded-none overflow-hidden bg-surface-white md:bg-transparent md:gap-[48px] md:items-start ${
        reversed ? "md:flex-row-reverse" : "md:flex-row"
      }`}
    >
      {/* Whole-card link — absolutely positioned overlay (not a wrapper),
          z-0 so the action buttons below (z-10+) sit as SIBLINGS and take
          click precedence, same pattern as EventCardBase's kebab overlay.
          Real bug found 2026-08-03: these buttons were z-20, same as the
          section's own sticky toolbar and the fixed top nav, so on a
          scrolled page whichever painted last (later in DOM = the cards)
          won the tie and rendered ON TOP of both. Full stack, low to
          high: card overlay(0) < card buttons(10) < card popovers(20) <
          section sticky toolbar(30) < fixed top nav(40). */}
      <Link href={eventHref} aria-label={esCL.eventCardAriaLabel(event.title)} className="absolute inset-0 z-0 cursor-pointer" />
      {imagePanel}
      {textPanel}
    </div>
  );
}
