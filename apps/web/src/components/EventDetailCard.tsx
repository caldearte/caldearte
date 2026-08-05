"use client";

import CardImage from "./CardImage";
import { DirectionsGlyph, CalendarGlyph, ShareGlyph, WhatsAppGlyph, XGlyph, FacebookGlyph, CopyGlyph } from "./CardActionIcons";
import { useEventCardActions } from "@/lib/useEventCardActions";
import { dateOnlyFromIso, todayInSantiago } from "@/lib/date";
import { esCL } from "@/i18n/es-CL";
import type { EventRecord } from "@/lib/events";

interface EventDetailCardProps {
  event: EventRecord;
  domain: string | null;
}

// Same visible-button treatment as InauguracionBentoCard's ActionButton
// (border/text-primary, font-fragment-mono) — this page has no whole-card
// link to compete with (it IS the destination), so no z-index gymnastics
// needed here, just plain buttons.
function ActionButton({ href, onClick, icon, label }: { href?: string; onClick?: () => void; icon: React.ReactNode; label: string }) {
  const className =
    "flex items-center gap-[10px] border border-text-primary px-[16px] py-[12px] text-[13px] font-fragment-mono text-text-primary whitespace-nowrap cursor-pointer";
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

// Rediseño 2.0.0 — the /eventos/[id] standalone page's own event display,
// rebuilt in the same visual language as the home bento cards (image +
// text panel, magenta date line, fragment-mono title, visible action
// buttons instead of a kebab menu — this page has no whole-card link to
// avoid, unlike the home grid's cards). Shows the FULL description
// (no truncation) and the full date range (dateLine, not the compact
// bento's untilDateLine) — this page's whole purpose is "more info", so
// it should give more than the home cards already show, not the same
// amount.
export default function EventDetailCard({ event, domain }: EventDetailCardProps) {
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
                  <button type="button" className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray" onClick={handleShareWhatsApp}>
                    <WhatsAppGlyph color="black" />
                    {esCL.cardMenuWhatsApp}
                  </button>
                  <button type="button" className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray" onClick={handleShareTwitter}>
                    <XGlyph color="black" />
                    {esCL.cardMenuTwitter}
                  </button>
                  <button type="button" className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray" onClick={handleShareFacebook}>
                    <FacebookGlyph color="black" />
                    {esCL.cardMenuFacebook}
                  </button>
                  <button type="button" className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray" onClick={handleCopyLink}>
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
