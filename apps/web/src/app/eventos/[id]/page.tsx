import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase-client";
import { fetchApprovedEvents, truncateDescription, resolveCityId, displayNameForCity } from "@/lib/events";
import { extractDomain, resolveCardImage } from "@/lib/image-source";
import { esCL } from "@/i18n/es-CL";
import EventDetailCard from "@/components/EventDetailCard";
import EventCityLink from "@/components/EventCityLink";
import Footer from "@/components/Footer";

export const revalidate = 3600; // matches the archive/sitemap revalidate window

interface PageParams {
  id: string;
}

export async function generateStaticParams() {
  const { events } = await fetchApprovedEvents(getSupabaseClient());
  return events.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { id } = await params;
  const { events } = await fetchApprovedEvents(getSupabaseClient());
  const event = events.find((e) => e.id === id);
  if (!event) return {};

  const description = truncateDescription(event.description) ?? event.title;
  const image = resolveCardImage(event);
  const title = `${event.title} | ${esCL.appName}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image.type === "photo" ? [image.url] : undefined,
    },
    // Twitter/X's crawler falls back to og:image for the image itself, but
    // NOT for the card type — without an explicit "summary_large_image"
    // here it renders the small square "summary" thumbnail from
    // layout.tsx's site-wide default instead of the bigger, more visually
    // compelling card (this is what WhatsApp shares' link previews are
    // reusing too — asked about explicitly, 2026-07-21: "se comparte con
    // imagen?").
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image.type === "photo" ? [image.url] : undefined,
    },
  };
}

export default async function EventPage({ params }: { params: Promise<PageParams> }) {
  const { id } = await params;
  const { events } = await fetchApprovedEvents(getSupabaseClient());
  const event = events.find((e) => e.id === id);
  if (!event) notFound();

  const domain = event.sourceUrl ? extractDomain(event.sourceUrl) : null;
  const cityId = resolveCityId(event);
  const cityName = displayNameForCity(event);

  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <div className="flex items-center justify-between gap-2 mb-[40px] md:mb-[60px]">
        <Link href="/" className="font-lato font-black leading-none text-brand-magenta text-[28px]">
          {esCL.appName}
        </Link>
        <EventCityLink cityId={cityId} cityName={cityName} />
      </div>

      <EventDetailCard event={event} domain={domain} />

      <Link
        href="/"
        className="mt-[40px] md:mt-[60px] inline-block font-fragment-mono text-[14px] uppercase text-text-primary underline"
      >
        {esCL.eventPageBackToHome} →
      </Link>

      <Footer />
    </main>
  );
}
