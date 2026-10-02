import type { VenueRecord } from "./venuePage";

// Schema.org structured data for /espacios/[slug]. `Place` rather than
// ArtGallery/Museum on purpose: the catalog mixes galleries, museums,
// cultural centers and open-air spots, and guessing a subtype per venue
// would be fabrication. Only facts the catalog really holds go in — the
// comuna as addressLocality (no street address is stored on a venue) and
// the Instagram profile as sameAs when a handle is known.
export function buildVenueJsonLd(venue: VenueRecord, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: venue.name,
    url,
    address: {
      "@type": "PostalAddress",
      ...(venue.comuna ? { addressLocality: venue.comuna } : {}),
      addressCountry: "CL",
    },
    ...(venue.instagramHandle ? { sameAs: [instagramProfileUrl(venue.instagramHandle)] } : {}),
  };
}

export function instagramProfileUrl(handle: string): string {
  return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
}
