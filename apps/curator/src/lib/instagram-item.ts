// Maps an Apify Instagram post to the shared BrightSourceItem shape
// (event-discovery/extractors.ts) so curateBrightSourceItems (discover.ts)
// can judge it with the exact same scope/date criteria as every other
// bright source, no new prompt needed.
import { truncateSafely, type BrightSourceItem } from "../event-discovery/extractors.js";
import type { ApifyInstagramPost } from "./apify-instagram.js";
import type { InstagramAccountConfig } from "./instagram-accounts.js";

const TITLE_MAX_LENGTH = 120;

export function toBrightSourceItem(post: ApifyInstagramPost, account: InstagramAccountConfig): BrightSourceItem {
  const caption = post.caption ?? "";
  // Instagram has no "title" field — derived from the caption's first
  // SUBSTANTIVE line (containing at least one letter/digit), not just the
  // literal first line, truncated. Imperfect, but Haiku still sees the
  // FULL caption via description/rawDateText below, so an approximate
  // title hides nothing from it — same kind of imperfection already
  // accepted for other sources with no clean title in the source itself
  // (Aninat, Estación Mapocho). truncateSafely, not a raw .slice() — see
  // its own doc comment (a real crash, found via mugupla's emoji-dense
  // captions).
  //
  // Real bug found 2026-08-14 (institutodearte.pucv): every one of its
  // captions opens with a lone "•" as a decorative first line before the
  // real title — a plain "first line" pick made EVERY post's title
  // literally "•", which (a) is useless in the UI and (b) caused a false
  // title-exact-match dedup collision between two genuinely different
  // real exhibitions (Hiperia and Cómo ordenar un miedo), silently
  // dropping one. Skipping decoration-only lines (no letter/digit at
  // all — bullets, dashes, emoji-only lines) fixes both.
  const lines = caption.split("\n").map((line) => line.trim());
  const firstSubstantiveLine = lines.find((line) => /[\p{L}\p{N}]/u.test(line));
  const title = truncateSafely(firstSubstantiveLine || account.username, TITLE_MAX_LENGTH);

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
    // Real gap found 2026-08-14 (factor__f's "Formas de habitar la
    // materia se despide" post — a real closing date confirmed in prose,
    // "hasta el 9 de agosto", but no opening date anywhere in the text,
    // the exact same shape found for noticias.udec.cl). The post's own
    // publish timestamp is real, already-known data — same backfill
    // mechanism (discover.ts's fillRunStartFromPublishedDate), just fed
    // from Instagram's own timestamp instead of a WordPress date field.
    publishedDate: post.timestamp.slice(0, 10),
    location: account.fixedLocation?.location ?? null,
    placeName: account.fixedLocation?.placeName ?? null,
  };
}
