import type { ArtistRecord } from "./artistPage";
import { instagramProfileUrl } from "./venueJsonLd";

// Schema.org structured data for /artistas/[slug]. Only what the catalog
// holds and is safe to publish: the name, the page URL, and the Instagram
// profile as sameAs when artists_public exposes a handle (never a
// heuristic one — that filter lives in the view). No jobTitle, no
// description, no "artist" subtype claims beyond Person: the catalog knows
// that this person showed work, not what they call themselves.
export function buildArtistJsonLd(artist: ArtistRecord, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: artist.name,
    url,
    ...(artist.instagramHandle ? { sameAs: [instagramProfileUrl(artist.instagramHandle)] } : {}),
  };
}
