// Maps an Apify Instagram post to the shared BrightSourceItem shape
// (event-discovery/extractors.ts) so curateBrightSourceItems (discover.ts)
// can judge it with the exact same scope/date criteria as every other
// bright source, no new prompt needed.
import type { BrightSourceItem } from "../event-discovery/extractors.js";
import type { ApifyInstagramPost } from "./apify-instagram.js";
import type { InstagramAccountConfig } from "./instagram-accounts.js";

const TITLE_MAX_LENGTH = 120;

export function toBrightSourceItem(post: ApifyInstagramPost, account: InstagramAccountConfig): BrightSourceItem {
  const caption = post.caption ?? "";
  // Instagram has no "title" field — derived from the caption's first
  // line, truncated. Imperfect, but Haiku still sees the FULL caption via
  // description/rawDateText below, so an approximate title hides nothing
  // from it — same kind of imperfection already accepted for other
  // sources with no clean title in the source itself (Aninat, Estación
  // Mapocho).
  const firstLine = caption.split("\n")[0]?.trim();
  const title = (firstLine || account.username).slice(0, TITLE_MAX_LENGTH);

  return {
    title,
    sourceUrl: post.url,
    imageUrl: post.displayUrl,
    description: caption || null,
    locationHint: null,
    // No structured date exists — the real event date, if any, lives
    // somewhere in the caption's free text, same posture as
    // aninatgaleria.org/centex.cultura.gob.cl/estacionmapocho.cl: Haiku
    // interprets it from rawDateText.
    rawDateText: caption,
    structuredStartDate: null,
    structuredEndDate: null,
    location: account.fixedLocation?.location ?? null,
    placeName: account.fixedLocation?.placeName ?? null,
  };
}
