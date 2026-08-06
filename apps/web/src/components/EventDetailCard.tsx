"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import CardImage from "./CardImage";
import { DirectionsGlyph, CalendarGlyph, ShareGlyph, WhatsAppGlyph, XGlyph, FacebookGlyph, CopyGlyph } from "./CardActionIcons";
import { useEventCardActions } from "@/lib/useEventCardActions";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { useAdminRemoveEvent } from "@/lib/useAdminRemoveEvent";
import { useAdminToggleSensitive, ADMIN_SENSITIVE_TAG } from "@/lib/useAdminToggleSensitive";
import { dateOnlyFromIso, todayInSantiago } from "@/lib/date";
import { esCL } from "@/i18n/es-CL";
import type { EventRecord } from "@/lib/events";

interface EventDetailCardProps {
  event: EventRecord;
  domain: string | null;
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
  const className = `flex items-center gap-[10px] border px-[16px] py-[12px] text-[13px] font-fragment-mono whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-default ${
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
export default function EventDetailCard({ event, domain, listPosition }: EventDetailCardProps) {
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

  const isAdmin = useIsAdmin();
  // Navigates home instead of router.refresh() (what the kebab-menu
  // version does) — this page is statically generated (generateStaticParams,
  // revalidate=3600), so refreshing it wouldn't reflect the removal for
  // up to an hour. The home page is server-rendered per request, so it
  // shows the removal immediately.
  const { removing, removed, handleRemove } = useAdminRemoveEvent({
    eventId: event.id,
    eventTitle: event.title,
    onRemoved: () => router.push("/"),
  });
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
    <article className="flex flex-col md:flex-row gap-[24px] md:gap-[60px] items-start">
      <div className="relative w-full md:w-[600px] shrink-0">
        <CardImage imageUrl={event.imageUrl} sourceUrl={event.sourceUrl} sensitivityTags={event.sensitivityTags} fullSize />
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
            <p className="font-geist text-[13px] text-text-primary whitespace-nowrap">
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
        <div className="flex flex-col gap-[12px] md:gap-[16px]">
          {dateLine && <p className="font-geist font-extrabold text-[14px] md:text-[16px] text-brand-magenta">{dateLine}</p>}
          <h1 className="font-fragment-mono leading-[1.1] text-[28px] md:text-[36px] text-text-primary">{event.title}</h1>
          <p className="font-geist text-[15px] md:text-[16px] text-text-muted">{venueLine}</p>
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
                  <button type="button" className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray cursor-pointer" onClick={handleShareWhatsApp}>
                    <WhatsAppGlyph color="black" />
                    {esCL.cardMenuWhatsApp}
                  </button>
                  <button type="button" className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray cursor-pointer" onClick={handleShareTwitter}>
                    <XGlyph color="black" />
                    {esCL.cardMenuTwitter}
                  </button>
                  <button type="button" className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray cursor-pointer" onClick={handleShareFacebook}>
                    <FacebookGlyph color="black" />
                    {esCL.cardMenuFacebook}
                  </button>
                  <button type="button" className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray cursor-pointer" onClick={handleCopyLink}>
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
            <ActionButton
              onClick={handleRemove}
              disabled={removing}
              destructive
              label={removed ? esCL.cardMenuRemoved : removing ? esCL.cardMenuRemoving : esCL.cardMenuRemove}
            />
          )}
        </div>

        {event.description && (
          <p className="font-geist text-[15px] md:text-[16px] leading-[1.6] text-text-primary whitespace-pre-line">{event.description}</p>
        )}

        {domain && event.sourceUrl && (
          <div className="flex flex-col gap-[6px] border-t border-border-default pt-[20px]">
            <div className="flex items-center gap-[8px] font-geist text-[14px] text-text-primary flex-wrap">
              <span className="font-bold">{esCL.eventPageSourceLabel(domain)}</span>
              <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline text-brand-magenta">
                {esCL.eventPageSourceLink}
              </a>
            </div>
            <p className="font-geist text-[13px] text-text-muted">{esCL.eventPageAttributionNote(domain)}</p>
          </div>
        )}
      </div>
    </article>
  );
}
