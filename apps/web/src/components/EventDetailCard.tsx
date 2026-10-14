"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CardImage from "./CardImage";
import { DirectionsGlyph, CalendarGlyph, ShareGlyph, WhatsAppGlyph, XGlyph, FacebookGlyph, CopyGlyph } from "./CardActionIcons";
import AdminRemoveReasonMenu from "./AdminRemoveReasonMenu";
import { useEventCardActions } from "@/lib/useEventCardActions";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { useAdminToggleSensitive, ADMIN_SENSITIVE_TAG } from "@/lib/useAdminToggleSensitive";
import { dateOnlyFromIso, todayInSantiago } from "@/lib/date";
import { esCL } from "@/i18n/es-CL";
import { resolveArtistDisplay } from "@/lib/social/flyerText";
import type { EventRecord } from "@/lib/events";
import type { ArtistLink } from "@/lib/artistPage";

interface EventDetailCardProps {
  event: EventRecord;
  domain: string | null;
  // The venue's own page (/espacios/[slug]), when it has more than this
  // event to show — decided server-side by lib/venuePage.ts's
  // findVenueLinkForEvent, so this component stays presentational.
  venueLink?: { href: string; name: string } | null;
  // Pages of the artists credited on this event, only those with more than
  // this event to show (lib/artistPage.ts's findArtistLinksForEvent).
  artistLinks?: ArtistLink[];
  // "List mode" — only set when the visitor actually reached this event
  // from the home page's own city+week "Exposiciones actuales" list (see
  // app/eventos/[id]/page.tsx's membership check). Absent for a direct
  // hit (search result, shared link) — in that case this renders exactly
  // like the page always has, no position row at all.
  listPosition?: {
    current: number;
    total: number;
    cityName: string;
    prevHref: string | null;
    nextHref: string | null;
  };
}

// Same visible-button treatment as InauguracionBentoCard's ActionButton
// (border/text-primary, font-fragment-mono) — this page has no whole-card
// link to compete with (it IS the destination), so no z-index gymnastics
// needed here, just plain buttons.
function ActionButton({
  href,
  onClick,
  disabled,
  destructive = false,
  icon,
  label,
}: {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  // Admin-only "Quitar" reuses this same button shape in red, instead of
  // its own bespoke markup — see EventDetailCard's own admin block below.
  destructive?: boolean;
  icon?: React.ReactNode;
  label: string;
}) {
  const className = `flex items-center gap-[10px] border px-[18px] py-[14px] text-[15px] md:text-[16px] font-fragment-mono whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-default ${
    destructive ? "border-red-600 text-red-600" : "border-text-primary text-text-primary"
  }`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {icon}
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {icon}
      {label}
    </button>
  );
}

// The home's dark pill CTA (EspaciosSection), a size smaller.
const MORE_PILL =
  "rounded-full border-2 border-text-primary bg-text-primary px-[18px] py-[9px] font-lato font-black text-[15px] md:text-[16px] leading-[1.3] uppercase tracking-[0.3px] text-surface-sage transition-colors hover:bg-brand-magenta hover:border-brand-magenta hover:text-white";

// Rediseño 2.0.0 — the /eventos/[id] standalone page's own event display,
// rebuilt in the same visual language as the home bento cards (image +
// text panel, magenta date line, fragment-mono title, visible action
// buttons instead of a kebab menu — this page has no whole-card link to
// avoid, unlike the home grid's cards). Shows the FULL description
// (no truncation) and the full date range (dateLine, not the compact
// bento's untilDateLine) — this page's whole purpose is "more info", so
// it should give more than the home cards already show, not the same
// amount.
//
// Admin "Quitar" added 2026-08-06 (real user request, from mobile
// testing) — this page's own ActionButton row, not a kebab item, since
// this page never had a kebab to begin with.
export default function EventDetailCard({ event, domain, venueLink, artistLinks, listPosition }: EventDetailCardProps) {
  const router = useRouter();
  // Same "hasn't happened yet" rule the home grid uses (splitInauguracionesYExpos)
  // — a past-but-still-running exhibition is an "expo", not an "inauguración",
  // regardless of whether it once had an opening date.
  const variant = event.openingDatetime && dateOnlyFromIso(event.openingDatetime) >= todayInSantiago() ? "inauguracion" : "expo";

  const {
    showTodayBadge,
    dateLine,
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
  } = useEventCardActions(event, variant, false);

  const artist = resolveArtistDisplay(event.artist);

  // "Más muestras de [espacio]" / "de [artista]" (Daniel, 2026-10-13) —
  // only for a venue or artist with more than this event to show
  // (venueLink / artistLinks). Placed twice below, one per breakpoint.
  const morePills =
    venueLink || (artistLinks && artistLinks.length > 0) ? (
      <>
        {venueLink && (
          <Link href={venueLink.href} className={MORE_PILL}>
            {esCL.eventPageVenueLink(venueLink.name)}
          </Link>
        )}
        {artistLinks?.map((link) => (
          <Link key={link.href} href={link.href} className={MORE_PILL}>
            {esCL.eventPageArtistLink(link.name)}
          </Link>
        ))}
      </>
    ) : null;

  const isAdmin = useIsAdmin();
  // Reason-picker popover, same trigger-then-switch-panel pattern as the
  // Compartir button just above — see AdminRemoveReasonMenu's own comment.
  const [removeReasonOpen, setRemoveReasonOpen] = useState(false);
  const {
    marked: sensitiveMarked,
    toggling: sensitiveToggling,
    justToggled: sensitiveJustToggled,
    handleToggle: handleToggleSensitive,
  } = useAdminToggleSensitive({
    eventId: event.id,
    initialMarked: event.sensitivityTags.includes(ADMIN_SENSITIVE_TAG),
    onToggled: () => router.refresh(),
  });
  const sensitiveLabel = sensitiveJustToggled
    ? sensitiveMarked
      ? esCL.cardMenuMarkedSensitive
      : esCL.cardMenuUnmarkedSensitive
    : sensitiveToggling
      ? sensitiveMarked
        ? esCL.cardMenuUnmarkingSensitive
        : esCL.cardMenuMarkingSensitive
      : sensitiveMarked
        ? esCL.cardMenuUnmarkSensitive
        : esCL.cardMenuMarkSensitive;

  return (
    <article className="flex flex-col md:flex-row gap-[24px] md:gap-[40px] xl:gap-[60px] items-start">
      {/* Fixed 600px only from xl — on a tablet that left the text column
          ~200px wide, too narrow for the bigger type. */}
      <div className="relative w-full md:w-[45%] xl:w-[600px] shrink-0">
        <CardImage imageUrl={event.imageUrl} sourceUrl={event.sourceUrl} sensitivityTags={event.sensitivityTags} fullSize priority alt={event.title} />
        {showTodayBadge && (
          <span className="absolute top-3 right-3 z-[5] text-[11px] font-bold uppercase tracking-wide bg-white text-text-primary rounded-full px-2.5 py-1">
            {esCL.todayBadge}
          </span>
        )}
        {closingSoon && (
          <span className="absolute top-3 left-3 z-[5] bg-brand-magenta text-white text-[12px] font-bold tracking-[2px] px-[12px] py-[6px]">
            {esCL.ultimosDias}
          </span>
        )}
        {/* "Más muestras de [espacio]" / "de [artista]" pills: under the
            photo from md up; on a phone at the end of the text instead. */}
        {morePills && <div className="hidden md:flex mt-[16px] flex-wrap gap-[10px]">{morePills}</div>}
      </div>

      <div className="flex-1 flex flex-col gap-[20px] md:gap-[24px] min-w-0">
        {listPosition && (
          <div className="flex items-center gap-[12px]">
            <Link
              href={listPosition.prevHref ?? "#"}
              aria-label={esCL.eventPagePrevAriaLabel}
              aria-disabled={!listPosition.prevHref}
              className={`flex items-center justify-center size-[32px] rounded-full border border-text-primary ${
                listPosition.prevHref ? "cursor-pointer" : "opacity-30 pointer-events-none"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img src="/icons/arrow-left.svg" alt="" width={14} height={14} />
            </Link>
            <p className="font-geist text-[15px] md:text-[16px] text-text-primary whitespace-nowrap">
              {esCL.eventPagePosition(listPosition.current, listPosition.total, listPosition.cityName)}
            </p>
            <Link
              href={listPosition.nextHref ?? "#"}
              aria-label={esCL.eventPageNextAriaLabel}
              aria-disabled={!listPosition.nextHref}
              className={`flex items-center justify-center size-[32px] rounded-full border border-text-primary ${
                listPosition.nextHref ? "cursor-pointer" : "opacity-30 pointer-events-none"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img src="/icons/arrow-right.svg" alt="" width={14} height={14} />
            </Link>
          </div>
        )}
        {/* The home card's build, full size (Daniel, 2026-10-13): artist,
            magenta Lato Black title, the magenta date pill, the venue —
            every line bigger than on the cards, to read easily. */}
        <div className="flex flex-col gap-[12px] md:gap-[16px]">
          {artist && (
            <p className="font-geist font-semibold text-[15px] md:text-[17px] leading-[1.3] tracking-[1px] uppercase text-text-secondary">{artist}</p>
          )}
          <h1 className="font-lato font-black uppercase leading-[1.1] tracking-[0.3px] text-[32px] md:text-[44px] text-brand-magenta [text-wrap:balance] [overflow-wrap:anywhere]">{event.title}</h1>
          {dateLine && (
            <p className="w-fit rounded-[16px] bg-brand-magenta px-[14px] py-[6px] font-lato font-black text-[16px] md:text-[19px] leading-[1.35] uppercase tracking-[0.3px] text-white">
              {dateLine}
            </p>
          )}
          <p className="font-geist font-semibold text-[16px] md:text-[18px] leading-[1.35] tracking-[0.5px] uppercase text-text-secondary">{venueLine}</p>
        </div>

        <div className="flex flex-wrap gap-[12px] items-center">
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
                  <button type="button" className="w-full flex items-center gap-2.5 px-3.5 py-3 text-[15px] text-heading-gray cursor-pointer" onClick={handleShareWhatsApp}>
                    <WhatsAppGlyph color="black" />
                    {esCL.cardMenuWhatsApp}
                  </button>
                  <button type="button" className="w-full flex items-center gap-2.5 px-3.5 py-3 text-[15px] text-heading-gray cursor-pointer" onClick={handleShareTwitter}>
                    <XGlyph color="black" />
                    {esCL.cardMenuTwitter}
                  </button>
                  <button type="button" className="w-full flex items-center gap-2.5 px-3.5 py-3 text-[15px] text-heading-gray cursor-pointer" onClick={handleShareFacebook}>
                    <FacebookGlyph color="black" />
                    {esCL.cardMenuFacebook}
                  </button>
                  <button type="button" className="w-full flex items-center gap-2.5 px-3.5 py-3 text-[15px] text-heading-gray cursor-pointer" onClick={handleCopyLink}>
                    <CopyGlyph color="black" />
                    {esCL.cardMenuCopyLink}
                  </button>
                </div>
              </>
            )}
            {linkCopied && (
              <div className="absolute -top-9 left-0 z-20 whitespace-nowrap rounded-lg bg-black/80 text-white text-xs px-2.5 py-1.5">
                {esCL.shareLinkCopied}
              </div>
            )}
          </div>
          {isAdmin && (
            <ActionButton onClick={handleToggleSensitive} disabled={sensitiveToggling} label={sensitiveLabel} />
          )}
          {isAdmin && (
            <div className="relative">
              <ActionButton onClick={() => setRemoveReasonOpen((open) => !open)} destructive label={esCL.cardMenuRemove} />
              {removeReasonOpen && (
                <>
                  <button
                    type="button"
                    aria-label={esCL.cardMoreOptionsAriaLabel}
                    className="fixed inset-0 z-10"
                    onClick={() => setRemoveReasonOpen(false)}
                  />
                  <div className="absolute top-full left-0 mt-2 z-20 min-w-[190px] overflow-hidden rounded-xl bg-white border border-stone-200 shadow-lg py-1">
                    <AdminRemoveReasonMenu
                      eventId={event.id}
                      onBack={() => setRemoveReasonOpen(false)}
                      // Navigates home instead of router.refresh() — this
                      // event no longer exists once removed, so refreshing
                      // IN PLACE would just hit notFound() instead of
                      // showing the admin their change actually landed.
                      onRemoved={() => router.push("/")}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {event.description && (
          <p className="font-geist text-[17px] md:text-[19px] leading-[1.6] text-text-primary whitespace-pre-line">{event.description}</p>
        )}

        {domain && event.sourceUrl && (
          <div className="flex flex-col gap-[6px] border-t border-border-default pt-[20px]">
            <div className="flex items-center gap-[8px] font-geist text-[16px] md:text-[17px] text-text-primary flex-wrap">
              <span className="font-bold">{esCL.eventPageSourceLabel(domain)}</span>
              <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline text-brand-magenta">
                {esCL.eventPageSourceLink}
              </a>
            </div>
            <p className="font-geist text-[15px] md:text-[16px] text-text-muted">{esCL.eventPageAttributionNote(domain)}</p>
          </div>
        )}

        {morePills && <div className="flex md:hidden flex-wrap gap-[10px]">{morePills}</div>}
      </div>
    </article>
  );
}
