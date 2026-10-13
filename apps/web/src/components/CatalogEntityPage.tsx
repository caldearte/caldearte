import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { jsonLdScriptContent } from "@/lib/eventJsonLd";
import { instagramProfileUrl } from "@/lib/venueJsonLd";
import type { EventRecord } from "@/lib/events";
import { AgendaGrid } from "./AgendaSection";
import { TileGrid } from "./CarteleraSection";
import { splitAgendaAndCartelera } from "@/lib/event-utils";
import { todayInSantiago } from "@/lib/date";
import EventPageFooter from "./EventPageFooter";
import SiteWordmark from "@/components/SiteWordmark";

// Past shows listed on a venue/artist page: the most recent ones only, so
// an entity with a long history doesn't turn into an endless page.
const MAX_PAST_EVENTS = 24;

const SUBHEAD = "font-lato font-black text-[22px] md:text-[26px] text-text-primary mb-[16px]";

interface CatalogEntityPageProps {
  jsonLd: unknown;
  // Small mono line above the title (a venue's comuna); absent for artists.
  eyebrow?: string | null;
  title: string;
  countText: string;
  instagramHandle: string | null;
  current: EventRecord[];
  past: EventRecord[];
  noCurrentText: string;
  correctionNote: string;
}

// The body shared by /espacios/[slug] and /artistas/[slug]: same layout,
// same sections, same cards — only the copy and the data differ.
export default function CatalogEntityPage({
  jsonLd,
  eyebrow,
  title,
  countText,
  instagramHandle,
  current,
  past,
  noCurrentText,
  correctionNote,
}: CatalogEntityPageProps) {
  const today = todayInSantiago();
  const { agenda, cartelera } = splitAgendaAndCartelera(current, today);

  return (
    <main className="min-h-screen w-full bg-surface-sage px-[18px] py-8 md:px-[40px] xl:px-[80px] max-w-[1600px] mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }} />

      <div className="mb-[40px] md:mb-[60px]">
        <SiteWordmark />
      </div>

      <header className="flex flex-col gap-[12px] md:gap-[16px]">
        {eyebrow && <p className="font-fragment-mono text-[14px] uppercase text-text-primary">{eyebrow}</p>}
        <h1 className="font-lato font-black text-[32px] md:text-[48px] leading-tight text-text-primary">{title}</h1>
        <p className="font-fragment-mono text-[14px] text-text-primary">{countText}</p>
        {instagramHandle && (
          <a
            href={instagramProfileUrl(instagramHandle)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-fragment-mono text-[14px] text-text-primary underline w-fit"
          >
            {esCL.venuePageInstagramLink(instagramHandle)}
          </a>
        )}
      </header>

      {/* Same two card styles as the home (2026-10-12): upcoming
          inauguraciones and visitas guiadas in the agenda's cards, running
          shows in the cartelera's; section labels in the home's small caps,
          subsections in its Lato Black. */}
      <section className="mt-12 md:mt-16">
        <h2 className="font-geist font-semibold text-[13px] tracking-[2px] uppercase text-text-secondary mb-[16px]">{esCL.venuePageCurrentLabel}</h2>
        {current.length > 0 ? (
          <div className="flex flex-col gap-[40px]">
            {agenda.length > 0 && (
              <div>
                {cartelera.length > 0 && <h3 className={SUBHEAD}>{esCL.catalogPageUpcomingLabel}</h3>}
                <AgendaGrid events={agenda} />
              </div>
            )}
            {cartelera.length > 0 && (
              <div>
                {agenda.length > 0 && <h3 className={SUBHEAD}>{esCL.catalogPageRunningLabel}</h3>}
                <TileGrid events={cartelera} today={today} />
              </div>
            )}
          </div>
        ) : (
          <p className="font-fragment-mono text-[14px] text-text-primary">{noCurrentText}</p>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-16">
          <h2 className="font-geist font-semibold text-[13px] tracking-[2px] uppercase text-text-secondary mb-[16px]">{esCL.venuePagePastLabel}</h2>
          <TileGrid events={past.slice(0, MAX_PAST_EVENTS)} today={today} showPeriod />
        </section>
      )}

      <Link
        href="/"
        className="mt-[40px] md:mt-[60px] inline-block font-fragment-mono text-[14px] uppercase text-text-primary underline"
      >
        {esCL.eventPageBackToHome} →
      </Link>

      <p className="mt-10 max-w-[640px] font-fragment-mono text-[13px] text-text-primary">{correctionNote}</p>

      <EventPageFooter />
    </main>
  );
}
