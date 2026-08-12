import type { MetadataRoute } from "next";
import { fetchApprovedEvents } from "@/lib/events";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // www, not the apex — see robots.ts's comment. Every <loc> here must be
  // the final URL Google actually lands on, not one that 308-redirects.
  const base = "https://www.caldearte.com";
  const { events } = await fetchApprovedEvents();
  // One URL per event's own shareable/indexable permalink (see
  // app/eventos/[id]/page.tsx) — "weekly" since a row can still change
  // after being written (e.g. an opening hour confirmed later).
  const eventUrls: MetadataRoute.Sitemap = events.map((e) => ({
    url: `${base}/eventos/${e.id}`,
    changeFrequency: "weekly",
    priority: 0.4,
  }));
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/privacidad`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/curatoria`, changeFrequency: "yearly", priority: 0.3 },
    ...eventUrls,
  ];
}
