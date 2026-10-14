import { esCL } from "@/i18n/es-CL";
import { jsonLdScriptContent } from "@/lib/eventJsonLd";
import { instagramProfileUrl } from "@/lib/venueJsonLd";
import { santiagoDateOfIso } from "@/lib/date";
import type { EventRecord } from "@/lib/events";
import { AgendaCard } from "./AgendaSection";
import EventPageFooter from "./EventPageFooter";
import EventPageHeader from "./EventPageHeader";

// Past shows listed on a venue/artist page: the most recent ones only, so
// an entity with a long history doesn't turn into an endless page.
const MAX_PAST_EVENTS = 24;

const SECTION_LABEL = "font-geist font-semibold text-[13px] leading-[1.3] tracking-[2px] uppercase text-text-secondary whitespace-nowrap mb-[16px]";

interface CatalogEntityPageProps {
  // Whose page it is — its cards leave out that venue (and comuna) or
  // that artist, since the whole page already is theirs.
  kind: "venue" | "artist";
  jsonLd: unknown;
  // A venue's comuna, shown beside the count; absent for artists.
  eyebrow?: string | null;
  title: string;
  countText: string;
  instagramHandle: string | null;
  current: EventRecord[];
  past: EventRecord[];
  noCurrentText: string;
  // Extra sentence after "…? Escríbenos." (artists: only public shows).
  correctionAfter?: string;
}

// The date a show is placed by on the page: its opening, else its start,
// else its end.
function showDate(e: EventRecord): string {
  return (e.openingDatetime ? santiagoDateOfIso(e.openingDatetime) : null) ?? e.runStartDate ?? e.runEndDate ?? "";
}

const newestFirst = (a: EventRecord, b: EventRecord) => showDate(b).localeCompare(showDate(a));

// The body shared by /espacios/[slug] and /artistas/[slug] (Daniel,
// 2026-10-13): the home's top bar (logo, search, menu), the name as a big
// sticky title, then every show as the home's featured card, newest first,
// in one continuous grid — "EN CARTELERA Y PRÓXIMAS", then right after,
// in the same rows, "MUESTRAS ANTERIORES". Gray page, like the home.
export default function CatalogEntityPage({
  kind,
  jsonLd,
  eyebrow,
  title,
  countText,
  instagramHandle,
  current,
  past,
  noCurrentText,
  correctionAfter,
}: CatalogEntityPageProps) {
  return (
    <main className="min-h-screen w-full bg-surface-sage">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }} />

      <EventPageHeader bottomBorder={false} />

      <div className="max-w-[1600px] mx-auto px-[18px] md:px-[40px] xl:px-[80px] pb-8">
        {/* Sticky under the top bar, one block with it (one line under both). */}
        <h1 className="sticky top-[84px] md:top-[104px] z-30 -mx-[18px] md:-mx-[40px] xl:-mx-[80px] px-[18px] md:px-[40px] xl:px-[80px] py-[14px] md:py-[18px] bg-surface-sage border-b border-text-primary/10 font-lato font-black uppercase text-[32px] md:text-[48px] leading-[1.05] text-text-primary [overflow-wrap:anywhere]">
          {title}
        </h1>

        <div className="mt-[16px] flex flex-wrap items-center gap-x-[16px] gap-y-[6px] font-fragment-mono text-[14px] md:text-[15px] text-text-primary">
          {eyebrow && <span className="uppercase">{eyebrow}</span>}
          <span>{countText}</span>
          {instagramHandle && (
            <a href={instagramProfileUrl(instagramHandle)} target="_blank" rel="noopener noreferrer" className="underline">
              {esCL.venuePageInstagramLink(instagramHandle)}
            </a>
          )}
        </div>

        {/* One continuous grid (Daniel, 2026-10-13: "de corrido"): past
            shows follow right after the current ones in the same rows. A
            part's label sits over its first card — the home agenda's day
            headings — and the other cards get an invisible copy (from sm
            up) so photos in a row still line up. */}
        {current.length === 0 && (
          <>
            <h2 className={`${SECTION_LABEL} mt-[40px] md:mt-[56px]`}>{esCL.venuePageCurrentLabel}</h2>
            <p className="mt-[8px] font-fragment-mono text-[14px] text-text-primary">{noCurrentText}</p>
          </>
        )}
        <div className="mt-[40px] md:mt-[56px] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-[16px] md:gap-x-[20px] gap-y-[36px] md:gap-y-[56px]">
          {[
            ...[...current].sort(newestFirst).map((e, i) => ({ e, label: i === 0 ? esCL.venuePageCurrentLabel : null })),
            ...[...past]
              .sort(newestFirst)
              .slice(0, MAX_PAST_EVENTS)
              .map((e, i) => ({ e, label: i === 0 ? esCL.venuePagePastLabel : null })),
          ].map(({ e, label }) => (
            <div key={e.id}>
              {label ? (
                <h2 className={SECTION_LABEL}>{label}</h2>
              ) : (
                <div aria-hidden="true" className={`${SECTION_LABEL} invisible hidden sm:block`}>
                  {esCL.venuePageCurrentLabel}
                </div>
              )}
              <AgendaCard event={e} history hideVenue={kind === "venue"} hideArtist={kind === "artist"} />
            </div>
          ))}
        </div>

        <div className="mt-[56px] md:mt-[80px]">
          <EventPageFooter note={{ text: esCL.catalogPageCorrectionQuestion, link: esCL.catalogPageCorrectionLink, after: correctionAfter }} />
        </div>
      </div>
    </main>
  );
}
