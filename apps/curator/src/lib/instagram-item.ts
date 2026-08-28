// Maps an Apify Instagram post to the shared BrightSourceItem shape
// (event-discovery/extractors.ts) so curateBrightSourceItems (discover.ts)
// can judge it with the exact same scope/date criteria as every other
// bright source, no new prompt needed.
import { truncateSafely, type BrightSourceItem } from "../event-discovery/extractors.js";
import type { ApifyInstagramPost } from "./apify-instagram.js";
import type { InstagramAccountConfig } from "./instagram-accounts.js";

const TITLE_MAX_LENGTH = 120;

// Real bug found 2026-08-23, auditing production data: a caption's first
// substantive line is very often a full invitation sentence ("Los
// invitamos este 20 de Agosto... a la Performace 'VILO: el peso del
// fragmento' del artista..."), not the exhibition's actual name — the
// real name almost always appears quoted somewhere in the caption
// instead. Scans for the EARLIEST quoted span across the quote styles
// actually seen in these captions (straight/curly double quotes,
// guillemets, curly single quotes) and uses its contents as the title
// when found. Does not cover every case (some captions state the real
// title unquoted, e.g. "la exposición Hiperia de la artista..." — left
// to the first-substantive-line fallback below, same accepted
// imperfection as before).
// Real bug found 2026-08-28 (antennaorg): some accounts run a recurring
// weekly-roundup column ("Viernes de Antenna Recomienda") whose own fixed
// label is the FIRST quoted phrase in the caption, ahead of the actual
// exhibition title quoted further down ("La deriva de una línea y otros
// vértigos"). A day-of-week + "de" label is never a real exhibition title,
// so it's skipped in favor of the next quoted span.
const DAY_ROUNDUP_LABEL_PATTERN = /^(lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo) de /i;

function extractQuotedTitle(caption: string): string | null {
  const quotePairs: [string, string][] = [
    ["“", "”"],
    ["«", "»"],
    ["‘", "’"],
    ['"', '"'],
  ];
  const candidates: { index: number; text: string }[] = [];
  for (const [open, close] of quotePairs) {
    let searchFrom = 0;
    while (true) {
      const openIndex = caption.indexOf(open, searchFrom);
      if (openIndex === -1) break;
      const closeIndex = caption.indexOf(close, openIndex + open.length);
      if (closeIndex === -1) break;
      const inner = caption.slice(openIndex + open.length, closeIndex).trim();
      if (/[\p{L}\p{N}]/u.test(inner)) {
        candidates.push({ index: openIndex, text: inner });
      }
      searchFrom = closeIndex + close.length;
    }
  }
  candidates.sort((a, b) => a.index - b.index);
  const realTitle = candidates.find((c) => !DAY_ROUNDUP_LABEL_PATTERN.test(c.text));
  return (realTitle ?? candidates[0])?.text ?? null;
}

// Pre-Haiku deterministic filter, added 2026-08-24 after reviewing real
// rejected_candidates reasons for the instagram pipeline — two patterns
// stood out as safe to catch before spending an Anthropic call:
//
// 1. A caption too thin to possibly describe a real event ("Ítem es solo
//    un handle de redes sociales sin información de evento" — a real
//    rejection reason seen in production). MIN_CAPTION_LENGTH mirrors
//    selection.ts's MIN_DESCRIPTION_LENGTH bar for the same reason: below
//    this there's essentially no chance of a date+location+event.
// 2. "Lanzamiento de libro"/"presentación de publicación" — book-launch
//    announcements, seen twice in real rejections, always rejected, never
//    approved: unambiguous phrasing, unlike "taller" or "concierto" (both
//    appear inside otherwise-valid exhibition posts as a side detail, or
//    as part of a real venue's own name like @wall.galeriataller — too
//    risky to keyword-filter blind).
const MIN_CAPTION_LENGTH = 30;
const BOOK_LAUNCH_PATTERN = /lanzamiento de (un )?libro|presentaci[oó]n de (la )?publicaci[oó]n|presentaci[oó]n de libro/i;

export function isCaptionWorthCurating(caption: string | null): boolean {
  if (!caption || caption.trim().length < MIN_CAPTION_LENGTH) return false;
  if (BOOK_LAUNCH_PATTERN.test(caption)) return false;
  return true;
}

export function toBrightSourceItem(post: ApifyInstagramPost, account: InstagramAccountConfig): BrightSourceItem {
  const caption = post.caption ?? "";
  // Instagram has no "title" field — derived from the caption. Imperfect,
  // but Haiku still sees the FULL caption via description/rawDateText
  // below, so an approximate title hides nothing from it — same kind of
  // imperfection already accepted for other sources with no clean title
  // in the source itself (Aninat, Estación Mapocho). truncateSafely, not
  // a raw .slice() — see its own doc comment (a real crash, found via
  // mugupla's emoji-dense captions).
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
  const title = truncateSafely(extractQuotedTitle(caption) || firstSubstantiveLine || account.username, TITLE_MAX_LENGTH);

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
    // Not baked into `location` directly — an account's fixedLocation is
    // an ASSUMPTION (this account usually posts about its own venue), not
    // certain per-item data, and a touring/co-hosted show can contradict
    // it (real bug found 2026-08-16, Factoría Santa Rosa/Valparaíso — see
    // extractors.ts's BrightSourceItem.defaultLocation doc comment).
    // Passed as defaultLocation instead, so discover.ts's
    // mergeBrightSourceCandidate can let Haiku's own in-text extraction
    // override it when the post's own text clearly says otherwise.
    location: null,
    placeName: null,
    defaultLocation: account.fixedLocation ?? null,
    // Real gap found 2026-08-15 building the admin analytics dashboard:
    // a post's own permalink never embeds which tracked account posted
    // it, so this is the only place that real information exists at
    // all — captured here so it can flow through to events/
    // rejected_candidates/out_of_scope_signals instead of being lost.
    sourceAccount: account.username,
  };
}
