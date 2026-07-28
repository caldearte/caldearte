// Generic, config-driven content extraction for bright sources — the
// registry that replaces one-off parser functions. A source's markup/
// field-shape is described as DATA (an ExtractorConfig) in
// lib/known-sources.ts, not as a new function; adding a new bright source
// with known structure means writing a config entry, not a parser.
//
// Two shapes, matching the two kinds of structure bright sources have
// shown so far (docs/region-discovery.md#fuentes-brillantes):
// - "articleList": an HTML listing page where each event lives in its own
//   repeating block (uchile.cl's <article> tags).
// - "wordpressRestApi": a WordPress REST endpoint returning structured
//   JSON, fields named per-site (Parque Cultural Valparaíso's meta.*
//   fields aren't a WordPress standard, just this site's own naming).
//
// sources.ts's fetchHtmlSource/fetchJsonApiSource dispatch to these when a
// source has a matching config, falling back to sources.ts's own
// whole-page-flatten when it doesn't (or the config doesn't match) — that
// fallback stays in sources.ts since it isn't config-driven, it's the
// generic last resort.
//
// Real production pattern (2026-07-24, three separate bugs in one week —
// see docs/region-discovery.md): both extractors below used to parse this
// exact structure and then immediately THROW IT AWAY, flattening title/
// link/date/image into one prose line and asking Haiku to re-extract them
// from that prose — with deterministic "grounding" checks bolted on
// afterward to catch Haiku mis-transcribing a fact the code already had.
// Now they return the structure itself (`BrightSourceItem[]`) — sourceUrl/
// imageUrl/title/structured dates never touch Haiku at all for a
// source with a real extractor config; see discover.ts's
// curateBrightSourceItems for the curatorial-only Haiku call these feed.
import { isJunkImage, type ImageCandidate } from "./discover.js";

// One real event, already resolved to its true per-event identity by the
// extractor — never the listing/API page's own URL. `rawDateText` is
// whatever free text the source states (daysRegex capture, WordPress
// description field, etc.) for discover.ts to hand Haiku when there's no
// structured date to fall back on; `structuredStartDate`/`structuredEndDate`
// are populated only when the source itself gives an exact date (so far,
// only wordpressRestApi's YYYYMMDD meta fields) and are used as-is,
// bypassing Haiku's interpretation entirely. `locationHint` is raw venue/
// place text captured from the source (e.g. an articleList's placeRegex) —
// used only as a hint for Haiku's location inference on aggregator
// sources (several different comunas in one feed); ignored entirely for a
// source with a fixed known comuna (known-sources.ts's `fixedLocation`).
export interface BrightSourceItem {
  title: string;
  sourceUrl: string;
  imageUrl: string | null;
  description: string | null;
  locationHint: string | null;
  rawDateText: string;
  structuredStartDate: string | null; // YYYY-MM-DD
  structuredEndDate: string | null; // YYYY-MM-DD
  // Already-resolved, trusted comuna/placeName — distinct from
  // `locationHint` (raw text for HAIKU to interpret). Populated only when
  // the source itself gives a clean per-item value (so far: a JSON API
  // with its own commune/venue fields, e.g. chilecultura.gob.cl's
  // `commune`/`venue_name` — see WordpressRestConfig's locationField/
  // placeNameField below). When set, discover.ts's mergeBrightSourceCandidate
  // uses it directly, same precedence tier as a source-level
  // `fixedLocation`, just resolved per item instead of one constant for
  // the whole source. null for every source that doesn't have this
  // (articleList sources keep using locationHint/locationExtractor/Haiku
  // as before).
  location: string | null;
  placeName: string | null;
}

export function collapseWhitespace(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Pull <img src/alt> pairs out BEFORE stripping tags — the original crude
// tag-strip threw away real per-exhibition thumbnails sitting right in the
// HTML (a real bug, found against artes.uchile.cl's agenda).
//
// src attributes are real HTML, so a site is free to (correctly) escape
// query-string "&" as "&amp;" — a real bug found against mnba.gob.cl's
// Drupal image-style URLs (?h=...&amp;itok=...): stored verbatim, that
// "&amp;" is literal text, not the "&" the real URL needs, breaking it.
function decodeHtmlEntities(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export function extractImgTags(html: string): Array<{ url: string; description: string | null }> {
  const images: Array<{ url: string; description: string | null }> = [];
  const imgTagRegex = /<img\b[^>]*>/gi;
  // data-src wins over src when both are present — a real lazy-load pattern
  // (mallecoescultura.cl, confirmed 2026-07-27): `src` holds a tiny base64
  // placeholder ("lazyload" class), the real image URL only lives in
  // `data-src`, filled in by client-side JS on scroll. Preferring `src`
  // unconditionally would have stored the base64 placeholder itself as
  // imageUrl — a garbage multi-KB "URL" the frontend could never render.
  const dataSrcRegex = /\bdata-src=["']([^"']+)["']/i;
  const srcRegex = /\bsrc=["']([^"']+)["']/i;
  const altRegex = /\balt=["']([^"']*)["']/i;

  for (const match of html.matchAll(imgTagRegex)) {
    const tag = match[0];
    const src = tag.match(dataSrcRegex)?.[1] ?? tag.match(srcRegex)?.[1];
    if (!src) continue;
    const alt = tag.match(altRegex)?.[1] ?? null;
    images.push({ url: decodeHtmlEntities(src), description: alt && alt.trim().length > 0 ? alt.trim() : null });
  }

  return images;
}

// Aggregator pages legitimately list many events, each with its own small
// first-party thumbnail — the per-result cap/description-required filter
// used for noisy social/CDN search results is the wrong fit here. Only
// drop obvious site chrome, resolve relative URLs against the page's own
// origin. ("vacio" is a real literal alt value seen on artes.uchile.cl —
// an alt that says "empty" carries no signal, treat as none.)
export function filterKnownSourceImages(
  images: Array<{ url: string; description: string | null }>,
  pageUrl: string,
): ImageCandidate[] {
  const seen = new Set<string>();
  const out: ImageCandidate[] = [];
  for (const img of images) {
    const trimmedUrl = img.url.trim();
    if (isJunkImage(trimmedUrl)) continue;
    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(trimmedUrl, pageUrl).href;
    } catch {
      continue;
    }
    if (seen.has(absoluteUrl)) continue;
    seen.add(absoluteUrl);
    out.push({ url: absoluteUrl, description: img.description === "vacio" ? null : img.description });
  }
  return out;
}

// --- Deterministic date-range parsing (2026-07-24) -----------------------
//
// Real production regression: every articleList source's date text is
// captured (daysRegex) but never PARSED — handed to Haiku as free text to
// interpret into runStartDate/runEndDate, same "ask Haiku to do a
// mechanical job" mistake this whole file's BrightSourceItem redesign was
// built to eliminate elsewhere. Running a real batch against
// arteinformado.com (~28 items) showed Haiku silently returning null dates
// for nearly every item despite the raw text being completely
// unambiguous ("11 jul de 2026 - 11 oct de 2026") — a task worth making
// deterministic once code has to keep re-proving it can't trust Haiku with
// it. Each known source already needs its OWN regex to find the date text
// at all (formats genuinely differ site to site); parsing what that regex
// finds into YYYY-MM-DD is the same kind of per-source, hand-verified
// config work as blockRegex/titleLinkRegex already are — not a bigger
// engineering investment, just carrying the pattern one step further.
//
// Two shapes, matching what's actually been found across 4 real sources
// so far: startIso/endIso (a source that ALREADY embeds a machine-readable
// date somewhere in its markup, e.g. mnba.gob.cl's own <time datetime="...">
// attribute — use it verbatim, nothing to parse) or
// startDay/startMonth/startYear/endDay/endMonth/endYear (everything else
// — startMonth/endMonth may be a plain number, "07", or a 3-letter Spanish
// abbreviation, "jul": resolveMonthGroup below handles either without the
// config needing to say which). `year` is a single shared-year fallback
// for a source whose markup states the year once for both dates (e.g.
// molinomachmar.cl's separate "evento-ano" element).
const ES_MONTH_ABBR: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
};

export interface DateRangeConfig {
  // Matched against the block's raw markup (tags intact, same reasoning
  // as DescriptionConfig in lib/description-extract.ts — a source like
  // mnba.gob.cl needs the `<time datetime="...">` ATTRIBUTE, not its
  // stripped inner text).
  pattern: RegExp;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function resolveMonthGroup(raw: string | undefined): number | null {
  if (!raw) return null;
  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw);
    return n >= 1 && n <= 12 ? n : null;
  }
  return (ES_MONTH_ABBR[raw.toLowerCase()] ?? -1) + 1 || null;
}

function buildDateString(day: string | undefined, month0based1: number | null, year: string | undefined): string | null {
  if (!day || month0based1 === null || !year) return null;
  const dayNum = Number(day);
  if (Number.isNaN(dayNum) || dayNum < 1 || dayNum > 31) return null;
  return `${year}-${pad2(month0based1)}-${pad2(dayNum)}`;
}

// Pure, never throws — null on no match or any unparseable piece, same
// defensive posture as opening-time.ts's extractors. A caller degrading
// to Haiku's own free-text interpretation as a fallback (or to null, and
// letting enforceDateCompleteness reject the candidate) is a reasonable
// safety net for a source's markup changing — never a crash.
export function extractDateRange(html: string, config: DateRangeConfig): { runStartDate: string; runEndDate: string } | null {
  const match = html.match(config.pattern);
  if (!match?.groups) return null;
  const g = match.groups;

  if (g.startIso && g.endIso) {
    return { runStartDate: g.startIso, runEndDate: g.endIso };
  }

  // Single-date shorthand — a source whose "event" is one dated happening
  // (an inauguración/presentation, not a multi-week exhibition run) only
  // ever gives ONE date, not a range. mallecoescultura.cl (confirmed
  // 2026-07-27, The Events Calendar plugin's list markup: one <time
  // datetime="..."> per event, no separate end date). Treating that single
  // day as both runStartDate and runEndDate satisfies
  // enforceDateCompleteness's "both start and end" requirement honestly —
  // the event genuinely runs (or opens) that one day.
  if (g.dayIso) {
    return { runStartDate: g.dayIso, runEndDate: g.dayIso };
  }

  const startMonth = resolveMonthGroup(g.startMonth);
  const endMonth = resolveMonthGroup(g.endMonth);
  const runStartDate = buildDateString(g.startDay, startMonth, g.startYear ?? g.year);
  const runEndDate = buildDateString(g.endDay, endMonth, g.endYear ?? g.year);
  return runStartDate && runEndDate ? { runStartDate, runEndDate } : null;
}

// --- articleList: repeating HTML blocks, one event per block ------------

export interface ArticleListConfig {
  kind: "articleList";
  blockRegex: RegExp; // wraps one event's markup; capture group 1 is the block body (falls back to the whole match if there's no group)
  titleLinkRegex: RegExp; // within a block: captures [href, title]
  daysRegex?: RegExp; // within a block: captures the date-range text (display/fallback — see dateRangeExtractor below for the deterministic parse)
  placeRegex?: RegExp; // within a block: captures the place text
  // Optional — most articleList sources' LISTING page has no prose at all
  // (only title/dates/place), in which case description recovery happens
  // separately, per-event, from the detail page (see lib/known-sources.ts's
  // descriptionExtractor + lib/page-fetch.ts). A source whose listing page
  // DOES carry real prose per event (confirmed 2026-07-24: molinomachmar.cl)
  // captures it here instead — no extra fetch needed.
  descriptionRegex?: RegExp;
  // Optional — deterministically parses the block's date text into
  // structuredStartDate/EndDate (see DateRangeConfig above), matched
  // against the same block already isolated by blockRegex. When absent or
  // when it doesn't match a particular block, structuredStartDate/EndDate
  // stay null and rawDateText (daysRegex) is the only signal left —
  // curateBrightSourceItems's prompt still asks Haiku to interpret that as
  // a fallback, since a source's markup can always drift.
  dateRangeExtractor?: DateRangeConfig;
}

// matchAll requires a global regex — a config author forgetting the "g"
// flag would otherwise throw at runtime instead of just not matching.
function ensureGlobalFlag(re: RegExp): RegExp {
  return re.global ? re : new RegExp(re.source, `${re.flags}g`);
}

export function extractArticleList(html: string, pageUrl: string, config: ArticleListConfig): BrightSourceItem[] | null {
  const items: BrightSourceItem[] = [];
  const blockRegex = ensureGlobalFlag(config.blockRegex);

  for (const blockMatch of html.matchAll(blockRegex)) {
    const block = blockMatch[1] ?? blockMatch[0];
    const titleMatch = block.match(config.titleLinkRegex);
    if (!titleMatch) continue;
    const [, href, rawTitle] = titleMatch;
    const title = decodeHtmlEntities(collapseWhitespace(rawTitle ?? ""));

    const days = config.daysRegex ? collapseWhitespace(block.match(config.daysRegex)?.[1] ?? "") : "";
    const place = config.placeRegex ? collapseWhitespace(block.match(config.placeRegex)?.[1] ?? "") : "";
    const descriptionMatch = config.descriptionRegex ? collapseWhitespace(block.match(config.descriptionRegex)?.[1] ?? "") : "";
    const dateRange = config.dateRangeExtractor ? extractDateRange(block, config.dateRangeExtractor) : null;

    let individualUrl: string;
    try {
      individualUrl = new URL(href, pageUrl).href;
    } catch {
      individualUrl = pageUrl;
    }

    const [firstImage] = filterKnownSourceImages(extractImgTags(block), pageUrl);

    items.push({
      title,
      sourceUrl: individualUrl,
      imageUrl: firstImage?.url ?? null,
      description: descriptionMatch || null,
      locationHint: place || null,
      rawDateText: days || "fecha no indicada",
      structuredStartDate: dateRange?.runStartDate ?? null,
      structuredEndDate: dateRange?.runEndDate ?? null,
      location: null,
      placeName: null,
    });
  }

  if (items.length === 0) return null;
  return items;
}

// --- wordpressRestApi: structured JSON, fields named per-site -----------

export interface WordpressRestConfig {
  kind: "wordpressRestApi";
  titleField: string; // dotted path, e.g. "title.rendered"
  linkField: string; // e.g. "meta.link_al_evento"
  imageField: string; // e.g. "meta.imagen_evento"
  descriptionField?: string; // e.g. "meta.extracto_corto"
  startDateField?: string; // e.g. "meta.fecha_de_inicio" (YYYYMMDD or YYYY-MM-DD)
  endDateField?: string; // e.g. "meta.fecha_de_termino" (YYYYMMDD or YYYY-MM-DD)
  // Real find, chilecultura.gob.cl (2026-07-28): unlike parquecultural.cl,
  // this JSON API already gives a clean, bare comuna per item (`commune`)
  // and a real venue name (`venue_name`) — a genuine aggregator (national,
  // many comunas), but with no per-item guessing needed at all, not even
  // the detail-page fetch aggregators like arteinformado.com still need.
  // When set, BrightSourceItem.location/placeName are populated directly
  // and discover.ts's curateBrightSourceItems skips asking Haiku for
  // either field.
  locationField?: string; // e.g. "commune"
  placeNameField?: string; // e.g. "venue_name"
  // Real bug, found 2026-07-28 running chilecultura.gob.cl in production:
  // fetchJsonApiSource assumed the response body itself is the items
  // array (true for parquecultural.cl, the only prior wordpressRestApi
  // source) — chilecultura.gob.cl's real response instead wraps it in
  // `{ total_count, page_count, next, previous, results: [...] }`,
  // crashing with "items.map is not a function". Dotted path (same idiom
  // as titleField etc.) to the array within the response body; absent
  // means the body itself is the array, unchanged default behavior.
  resultsField?: string; // e.g. "results"
}

// Same traversal as getStringPath below, but returns the raw value
// instead of requiring it to be a string — used to pull the items array
// out of a wrapped JSON response body via resultsField.
export function getPath(obj: unknown, path: string | undefined): unknown {
  if (!path) return obj;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function getStringPath(obj: unknown, path: string | undefined): string | undefined {
  if (!path) return undefined;
  const value = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
  return typeof value === "string" ? value : undefined;
}

// YYYYMMDD -> YYYY-MM-DD (parquecultural.cl), or already YYYY-MM-DD[...]
// passed through as-is (chilecultura.gob.cl, confirmed 2026-07-28: its
// start_date/end_date are already ISO date strings, not the 8-digit form)
// — null when absent or neither shape matches. Not a display placeholder:
// this feeds BrightSourceItem's structuredStartDate/EndDate directly, used
// as real data, not prose.
function formatWpDate(raw: string | undefined): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return null;
}

// Decodes the common named entities that show up in real Spanish-language
// rich-text HTML (chilecultura.gob.cl's `description` field, confirmed
// 2026-07-28: "&oacute;n", "&iacute;a", etc. — a genuinely different case
// from decodeHtmlEntities above, which only ever needed to handle
// "&amp;" inside image-style query strings) — then strips tags via
// collapseWhitespace. Applied only to WordpressRestApi description fields
// so far; parquecultural.cl's own extracto_corto is already plain text,
// so this is a harmless no-op for it (no tags, no named entities).
const SPANISH_HTML_ENTITIES: Record<string, string> = {
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
  iexcl: "¡", iquest: "¿", ldquo: "“", rdquo: "”",
  lsquo: "‘", rsquo: "’", hellip: "…", nbsp: " ",
  deg: "°", ordm: "º", ordf: "ª", ndash: "–", mdash: "—",
};

function htmlToPlainText(html: string): string {
  const withEntities = html
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&(aacute|eacute|iacute|oacute|uacute|Aacute|Eacute|Iacute|Oacute|Uacute|ntilde|Ntilde|uuml|Uuml|iexcl|iquest|ldquo|rdquo|lsquo|rsquo|hellip|nbsp|deg|ordm|ordf|ndash|mdash);/g, (_, name: string) => SPANISH_HTML_ENTITIES[name])
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return collapseWhitespace(withEntities);
}

// A WordPress REST API response is already structured — no HTML parsing,
// no guessing which image belongs to which event, no need for Haiku to
// interpret startDate/endDate at all when the source gives them exactly
// (structuredStartDate/EndDate below). Real find (Parque Cultural
// Valparaíso): hora_de_inicio/hora_de_termino are the venue's daily
// opening hours, NOT the inauguración time — the real one, when there is
// one, lives in the description field's free text (rawDateText), so
// Haiku still reads that for openingDatetime specifically.
export function extractWordpressItems(items: unknown[], config: WordpressRestConfig, fallbackUrl: string): BrightSourceItem[] {
  return items.map((item) => {
    const title = getStringPath(item, config.titleField) ?? "(sin título)";
    const rawDescription = getStringPath(item, config.descriptionField);
    const description = rawDescription ? htmlToPlainText(rawDescription) || null : null;
    return {
      title,
      sourceUrl: getStringPath(item, config.linkField) ?? fallbackUrl,
      imageUrl: getStringPath(item, config.imageField) ?? null,
      description,
      // wordpressRestApi sources are either fixedLocation single-venue
      // (no per-item venue text to infer from) or, like chilecultura.gob.cl,
      // already give a clean per-item location/placeName below — locationHint
      // (a raw hint for Haiku to interpret) has never applied to this shape.
      locationHint: null,
      rawDateText: description ?? "",
      structuredStartDate: formatWpDate(getStringPath(item, config.startDateField)),
      structuredEndDate: formatWpDate(getStringPath(item, config.endDateField)),
      location: getStringPath(item, config.locationField) ?? null,
      placeName: getStringPath(item, config.placeNameField) ?? null,
    };
  });
}

export type ExtractorConfig = ArticleListConfig | WordpressRestConfig;
