import type { ReactNode } from "react";
import { esCL } from "@/i18n/es-CL";
import { instagramProfileUrl } from "@/lib/venueJsonLd";

// The Instagram camera glyph, sized to the text around it. The site search
// shows it before a venue's or artist's "@" without a link (Daniel,
// 2026-11-16: the search should send people to our page first).
export function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// An Instagram account as a link: the glyph, then "@handle" (2026-11-16,
// Daniel: "el link de IG antes del @"). Used on the venue and artist pages.
// `children` replaces the plain "@handle" text.
export default function InstagramLink({ handle, className = "", children }: { handle: string; className?: string; children?: ReactNode }) {
  return (
    <a
      href={instagramProfileUrl(handle)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={esCL.venuePageInstagramLink(handle)}
      data-track="outbound_instagram"
      className={`inline-flex items-center gap-[6px] hover:text-brand-magenta ${className}`}
    >
      <InstagramGlyph />
      <span className="truncate">{children ?? `@${handle}`}</span>
    </a>
  );
}
