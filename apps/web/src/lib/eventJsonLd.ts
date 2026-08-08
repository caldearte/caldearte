import type { EventRecord } from "./events";
import { activeRange } from "./date";
import { resolveCardImage } from "./image-source";

// Schema.org structured data for /eventos/[id] — added 2026-08-08 (SEO
// audit: zero structured data on the site until now). VisualArtsEvent is
// schema.org's own subtype for exhibitions (no ExhibitionEvent type
// exists). Lets Google show these in event-rich results, and gives AI
// answer engines (which increasingly ground on schema.org markup rather
// than free text) a structured, unambiguous source for date/place instead
// of having to infer it from prose.
//
// Deliberately conservative, same anti-fabrication posture as the rest of
// the site: dates use activeRange() (date-only, the same "showing" range
// every other feature already derives from openingDatetime/runStartDate/
// runEndDate — never a fabricated hour), and image is included only when
// resolveCardImage says it's a real photo, never one of the generic
// domain/city placeholders.
export function buildEventJsonLd(event: EventRecord) {
  const range = activeRange(event);
  const image = resolveCardImage(event);
  const url = `https://www.caldearte.com/eventos/${event.id}`;

  return {
    "@context": "https://schema.org",
    "@type": "VisualArtsEvent",
    name: event.title,
    description: event.description ?? event.title,
    url,
    ...(range ? { startDate: range.start, endDate: range.end } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    // freeformLocation alone, not concatenated with event.regionName — that
    // field is actually the comuna name (events.ts's own naming; see its
    // comment), which free-text location strings already tend to include
    // ("Talca, Región del Maule"), so appending it produced redundant
    // addresses ("Talca, Región del Maule, Talca").
    location: {
      "@type": "Place",
      name: event.placeName ?? event.freeformLocation,
      address: event.freeformLocation,
    },
    ...(image.type === "photo" ? { image: [image.url] } : {}),
  };
}

// `</script>` inside a JSON string would otherwise close the tag early —
// standard safe-embedding escape for JSON-in-HTML.
export function jsonLdScriptContent(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
