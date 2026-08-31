"use client";

import type { EventRecord } from "@/lib/events";
import { deriveComuna } from "@/lib/comuna";
import { displayNameForCity } from "@/lib/event-utils";

// Instagram's own carousel limit — same cap the automated Feed pipeline
// already enforces (apps/curator/src/social-publish/selection.ts).
const MAX_CAROUSEL_SLIDES = 10;

function buildFlyerUrl(event: EventRecord, regionName: string): string {
  const comuna = deriveComuna(event.freeformLocation, event.placeName) ?? displayNameForCity(event);
  const params = new URLSearchParams({
    type: "inauguracion",
    title: event.title,
    region: regionName,
    imageUrl: event.imageUrl!,
    openingDatetime: event.openingDatetime!,
    openingTimeConfirmed: String(event.openingTimeConfirmed),
  });
  if (event.artist) params.set("artist", event.artist);
  if (event.placeName) params.set("placeName", event.placeName);
  if (comuna) params.set("comuna", comuna);
  return `/api/social/flyer?${params.toString()}`;
}

// Only events the flyer route can actually render: it 400s/throws without
// a photo (see api/social/flyer/route.tsx) and without openingDatetime for
// type "inauguracion" (see buildFlyerDateLine in social/flyer.tsx) — a rare
// case (grounding forced openingDatetime to null for a date it couldn't
// verify, see curation-policy.ts), but one that would otherwise 500 the
// whole carousel over a single event.
function shareableEvents(events: EventRecord[]): EventRecord[] {
  return events
    .filter((e) => e.imageUrl !== null && e.openingDatetime !== null)
    .sort((a, b) => a.openingDatetime!.localeCompare(b.openingDatetime!))
    .slice(0, MAX_CAROUSEL_SLIDES);
}

export function hasShareableInauguraciones(events: EventRecord[]): boolean {
  return shareableEvents(events).length > 0;
}

export type ShareCarouselOutcome = "shared" | "downloaded" | "cancelled";

// Renders each inauguración through the existing branded-flyer endpoint
// (the same one the automated @caldearte.oficial posts already use — see
// apps/curator/src/social-publish/run.ts), then hands the whole set to the
// OS-level share sheet as image files. On a phone, picking Instagram from
// that sheet drops the visitor straight into Instagram's own post/carousel
// composer with every photo already attached — there is no web API to
// open that composer directly (Instagram exposes no such "intent" the way
// WhatsApp/X do for text+link, only the OS share sheet as a middle step).
// Desktop (and any browser without File support in the Web Share API)
// falls back to downloading every image instead, since Instagram doesn't
// support posting from desktop web at all regardless of what a website
// could hand it.
export async function shareInauguracionesCarousel(events: EventRecord[], regionName: string): Promise<ShareCarouselOutcome> {
  const targets = shareableEvents(events);

  const files = await Promise.all(
    targets.map(async (event, i) => {
      const res = await fetch(buildFlyerUrl(event, regionName));
      if (!res.ok) throw new Error(`Flyer render failed for "${event.title}" (${res.status})`);
      const blob = await res.blob();
      return new File([blob], `caldearte-inauguracion-${i + 1}.png`, { type: "image/png" });
    }),
  );

  if (typeof navigator.canShare === "function" && navigator.canShare({ files })) {
    try {
      await navigator.share({ files });
      return "shared";
    } catch (err) {
      // AbortError — the visitor closed the share sheet themselves, not a
      // real failure. Any other error falls through to the download
      // fallback below rather than surfacing as a broken feature.
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }

  for (const file of files) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    // Staggered — firing every download in the same tick has been seen to
    // get several silently dropped by the browser's own multi-download
    // popup-blocker heuristic.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return "downloaded";
}
