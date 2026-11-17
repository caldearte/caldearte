import type { ReactNode } from "react";
import { esCL } from "@/i18n/es-CL";
import { instagramProfileUrl } from "@/lib/venueJsonLd";

// An Instagram account as a link: the camera glyph, then "@handle"
// (2026-11-16, Daniel: "el link de IG antes del @"). Used on the venue and
// artist pages and on their rows in the site search. `children` replaces
// the plain "@handle" text (the search passes it highlighted).
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
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
      </svg>
      <span className="truncate">{children ?? `@${handle}`}</span>
    </a>
  );
}
