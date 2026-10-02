import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchArtistData } from "@/lib/artists";
import { buildArtistPageData, findArtistBySlug } from "@/lib/artistPage";
import { artistSlug } from "@/lib/venueSlug";
import { buildArtistJsonLd } from "@/lib/artistJsonLd";
import { todayInSantiago } from "@/lib/date";
import { esCL } from "@/i18n/es-CL";
import CatalogEntityPage from "@/components/CatalogEntityPage";

interface PageParams {
  slug: string;
}

// Same ISR settings and reasoning as app/espacios/[slug]/page.tsx and
// app/eventos/[id]/page.tsx: ~400 artist pages must not be pre-rendered on
// every build (the 2026-09-18 ISR Writes incident), only on first request.
export const revalidate = 600;
export const dynamicParams = true;

export function generateStaticParams(): Array<{ slug: string }> {
  return [];
}

const SITE = "https://www.caldearte.com";

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { slug } = await params;
  const { artists, eventsByArtistId } = await fetchArtistData();
  const artist = findArtistBySlug(artists, slug);
  if (!artist) return {};

  const page = buildArtistPageData(artist, eventsByArtistId[artist.id] ?? [], todayInSantiago());
  const title = `${artist.name} | ${esCL.appName}`;
  const description = esCL.artistPageMetaDescription(artist.name, page.totalEvents);
  const canonical = `${SITE}/artistas/${artistSlug(artist)}`;

  return {
    title,
    description,
    alternates: { canonical },
    // See isArtistIndexable: one show and no published handle stays out of
    // the index.
    robots: page.indexable ? undefined : { index: false, follow: true },
    openGraph: { title, description },
    twitter: { card: "summary", title, description },
  };
}

export default async function ArtistPage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const { artists, eventsByArtistId } = await fetchArtistData();
  const artist = findArtistBySlug(artists, slug);
  if (!artist) notFound();

  const { current, past, totalEvents } = buildArtistPageData(artist, eventsByArtistId[artist.id] ?? [], todayInSantiago());

  return (
    <CatalogEntityPage
      jsonLd={buildArtistJsonLd(artist, `${SITE}/artistas/${artistSlug(artist)}`)}
      title={artist.name}
      countText={esCL.venuePageEventCount(totalEvents)}
      instagramHandle={artist.instagramHandle}
      current={current}
      past={past}
      noCurrentText={esCL.artistPageNoCurrent}
      correctionNote={esCL.artistPageCorrectionNote}
    />
  );
}
