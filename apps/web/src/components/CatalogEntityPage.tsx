import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { jsonLdScriptContent } from "@/lib/eventJsonLd";
import { instagramProfileUrl } from "@/lib/venueJsonLd";
import type { EventRecord } from "@/lib/events";
import ExpoCard from "./ExpoCard";
import EventPageFooter from "./EventPageFooter";

// Past shows listed on a venue/artist page: the most recent ones only, so
// an entity with a long history doesn't turn into an endless page.
const MAX_PAST_EVENTS = 24;

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
  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }} />

      <div className="mb-[40px] md:mb-[60px]">
        <Link href="/" className="font-lato font-black leading-none text-brand-magenta text-[28px]">
          {esCL.appName}
        </Link>
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

      <section className="mt-12 md:mt-16">
        <h2 className="font-lato font-black text-[28px] md:text-[41px] text-text-primary mb-6">{esCL.venuePageCurrentLabel}</h2>
        {current.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-[20px]">
            {current.map((e) => (
              <ExpoCard key={e.id} event={e} />
            ))}
          </div>
        ) : (
          <p className="font-fragment-mono text-[14px] text-text-primary">{noCurrentText}</p>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-16">
          <h2 className="font-lato font-black text-[28px] md:text-[41px] text-text-primary mb-6">{esCL.venuePagePastLabel}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-[20px]">
            {past.slice(0, MAX_PAST_EVENTS).map((e) => (
              <ExpoCard key={e.id} event={e} hideTodayBadge />
            ))}
          </div>
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
