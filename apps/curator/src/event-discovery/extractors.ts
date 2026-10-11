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
// - "safaAgendaApi": safa.cl's festival agenda (a Laravel app whose agenda
//   page renders client-side from two public JSON endpoints) — see the
//   section at the bottom of this file.
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
import { isJunkImage, ES_MONTHS, type ImageCandidate } from "./discover.js";

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
  // A source's own ASSUMED default location — distinct from `location`
  // above (which is only ever set from real per-item structured data).
  // Set when a source is presumed to only ever cover one venue (e.g. an
  // Instagram account with instagram-accounts.ts's `fixedLocation`) but
  // that assumption isn't certain the way a structured API field is —
  // real bug found 2026-08-16: a touring/co-hosted show posted by
  // Factoría Santa Rosa's account was actually in Valparaíso, not
  // Santiago. discover.ts's mergeBrightSourceCandidate uses this as a
  // default that Haiku's own in-text extraction (row.location) can
  // override when it clearly names a different real Chilean place — see
  // locationsOverlap (lib/locations.ts). null for every source that
  // doesn't have this assumption at all.
  defaultLocation?: { location: string; placeName: string; address?: string } | null;
  // Real, already-known date — the SOURCE POST'S OWN publish date, not an
  // event date at all. Optional (undefined for every existing source
  // shape, no other constructor site needs updating): only populated by
  // extractWordpressItems when config.publishedDateField is set (so far
  // just noticias.udec.cl, 2026-08-13). Used exactly once, by
  // discover.ts's fillRunStartFromPublishedDate, as a defensible
  // stand-in for a genuinely missing runStartDate when the source states
  // a real runEndDate but never says when the show opened — see that
  // function's own doc comment.
  publishedDate?: string | null;
  // The specific account/handle this item came from, when the pipeline
  // has that concept — see EventCandidate.sourceAccount's own doc
  // comment (discover.ts) for the real gap this closes. Optional,
  // undefined for every source shape except Instagram
  // (lib/instagram-item.ts sets it to account.username).
  sourceAccount?: string | null;
  // Real street address of this item's venue, when the source states one
  // per item (safa.cl's `direccion`) — the per-item counterpart of
  // `fixedLocation.address`/`defaultLocation.address`, used only for the
  // Google Maps directions link (see KnownSource.fixedLocation's doc
  // comment). Optional, undefined for every other source shape.
  address?: string | null;
  // The source's own EXACT inauguración, "YYYY-MM-DDTHH:mm" Chile-local
  // (same format Haiku reports openingDatetime in), when it labels one
  // explicitly with a real start hour (safa.cl's "Inauguración" activity
  // type). discover.ts's mergeBrightSourceCandidate uses it as-is, with
  // openingTimeConfirmed true, over whatever Haiku reports — same
  // "deterministic fields never touch Haiku" posture as the structured
  // run dates above. Optional, undefined for every other source shape.
  structuredOpeningDatetime?: string | null;
}

// Entities decoded AFTER tags are stripped, never before — decoding
// first would turn a real "&lt;script&gt;" into a live-looking "<script>"
// tag right before the tag-strip regex runs, same ordering
// lib/description-extract.ts's own stripTagsAndCollapse already uses.
//
// Real bug found 2026-08-08 (espacioo.com): this never decoded entities
// at all, unlike the `title` field a few lines below (which explicitly
// wraps its own collapseWhitespace call in decodeHtmlEntities) — every
// OTHER field an articleList source pulls through this function
// (daysRegex, placeRegex, descriptionRegex) shipped with raw "&oacute;"-
// style entities still in it. espacioo.com's own listing-level
// description (span.description.prose) is what surfaced it, but the gap
// applied to every source using descriptionRegex/placeRegex, not just
// this one — decoding now happens once, here, for all of them.
export function collapseWhitespace(text: string): string {
  return decodeHtmlEntities(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

// Real production crash, found 2026-08-14 (mugupla, a real Instagram
// account whose captions are dense with emoji): plain `.slice(0, n)`
// truncates by UTF-16 code UNIT, not by character — landing exactly
// between the two code units of a surrogate-pair emoji produces a
// string with a lone, unpaired surrogate. That string serialized fine
// locally (JSON.stringify silently escapes it), but the Anthropic API's
// own request-body parser rejected it outright ("no low surrogate in
// string") — an uncaught 400 that crashed the ENTIRE curation call for
// the whole batch, not just the one candidate, taking down every other
// due account's results with it. The spread operator iterates a string
// by Unicode code point, so it can never split a surrogate pair — used
// here instead of a raw `.slice()` anywhere free text (not a known-ASCII
// value like a URL or ISO date) gets truncated to a fixed length.
export function truncateSafely(text: string, maxLength: number): string {
  return [...text].slice(0, maxLength).join("");
}

// Pull <img src/alt> pairs out BEFORE stripping tags — the original crude
// tag-strip threw away real per-exhibition thumbnails sitting right in the
// HTML (a real bug, found against artes.uchile.cl's agenda).
//
// src attributes are real HTML, so a site is free to (correctly) escape
// query-string "&" as "&amp;" — a real bug found against mnba.gob.cl's
// Drupal image-style URLs (?h=...&amp;itok=...): stored verbatim, that
// "&amp;" is literal text, not the "&" the real URL needs, breaking it.
//
// Numeric character references (&#8211; / &#x2014;) resolved generically
// by codepoint — real gap found 2026-08-08 (dieecke.art's titles use
// "&#8211;" for an en dash): this function only ever covered a handful of
// named entities, silently leaving any numeric reference undecoded in
// TITLES (this function is also used for image URLs, unaffected — no
// numeric refs seen there so far). `lib/description-extract.ts` already
// had this exact fix for DESCRIPTIONS (its own separate copy, added
// 2026-07-28 for centronacionaldearte.cultura.gob.cl) but it was never
// backported to this sibling function — same lesson as that fix's own
// comment: a decoding gap found in one copy doesn't automatically apply
// to a duplicate.
// Named Spanish-language entities — merged in 2026-08-08 from this same
// file's own now-removed `htmlToPlainText`/`SPANISH_HTML_ENTITIES`
// (originally added 2026-07-28 for chilecultura.gob.cl's WordPress REST
// description field, "&oacute;n", "&iacute;a", etc). Now that
// collapseWhitespace (above) decodes entities for every articleList
// field, that separate copy was pure duplication — consolidated into
// this one table instead of drifting further apart.
const NAMED_ENTITIES: Record<string, string> = {
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
  iexcl: "¡", iquest: "¿", ldquo: "“", rdquo: "”",
  lsquo: "‘", rsquo: "’", hellip: "…", nbsp: " ",
  deg: "°", ordm: "º", ordf: "ª", ndash: "–", mdash: "—",
};

// Exported for lib/google-alerts.ts (2026-08-14): the Atom feed's own
// <link href="..."> and <content> fields are XML-entity-escaped around
// content that's ITSELF HTML (a Google redirect URL's own "&" as
// "&amp;amp;", a <b> highlight tag as "&lt;b&gt;") — needs one decode
// pass to reach real HTML/URL text before that text can be parsed
// (extract the redirect's real `url` param) or tag-stripped
// (collapseWhitespace, which decodes AGAIN for entities inside that,
// e.g. "&amp;nbsp;" -> "&nbsp;" -> " ") — see that module's own comment.
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&(\w+);/g, (full, name: string) => NAMED_ENTITIES[name] ?? full)
    // Last, so each call peels exactly one layer: decoding &amp; first made
    // "&amp;quot;" or "&amp;nbsp;" collapse two layers in one call (CodeQL
    // js/double-escaping). Callers that need two layers already call twice.
    .replace(/&amp;/g, "&");
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
  // Same lazy-load problem, different attribute name — aldeaencuentro.cl's
  // theme (Sneeit) uses `data-s` instead of the more common `data-src`,
  // confirmed 2026-08-10: `src=""` (empty) and no `data-src` at all, real
  // image only in `data-s`. `\bdata-s=` requires the `=` immediately after
  // the s, so it can't accidentally match a longer attribute like
  // `data-sizes=`.
  const dataSRegex = /\bdata-s=["']([^"']+)["']/i;
  const srcRegex = /\bsrc=["']([^"']+)["']/i;
  const altRegex = /\balt=["']([^"']*)["']/i;

  for (const match of html.matchAll(imgTagRegex)) {
    const tag = match[0];
    const src = tag.match(dataSrcRegex)?.[1] ?? tag.match(dataSRegex)?.[1] ?? tag.match(srcRegex)?.[1];
    if (!src) continue;
    const alt = tag.match(altRegex)?.[1] ?? null;
    images.push({ url: decodeHtmlEntities(src), description: alt && alt.trim().length > 0 ? alt.trim() : null });
  }

  // Fallback, appended after real <img> tags (never ahead of them — a
  // source with genuine <img> markup keeps winning on tie): a source that
  // renders its thumbnail as a CSS background-image instead of an <img>
  // tag (cclm.cl, confirmed 2026-07-28 — a <figure style="background-
  // image:url(...)"> with no <img> anywhere in the block at all, real
  // gap this closes generically rather than one-off for that source).
  // Unquoted, single-, and double-quoted url() forms are all valid CSS.
  const backgroundImageRegex = /background-image:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  for (const match of html.matchAll(backgroundImageRegex)) {
    images.push({ url: decodeHtmlEntities(match[1]), description: null });
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

// Pre-curation date filter, 2026-09-30: a source whose page lists its
// FULL historical archive (galeriametropolitana.org: 68 items, 2005 to
// today; galeriahifas.cl similarly archival) sends every item to Haiku
// every run regardless of age — measured 2026-09-30, one day's run: 41
// candidates from galeriametropolitana.org and 9 from galeriahifas.cl
// were approved by Haiku on content grounds and only THEN discarded by
// isCurrentOrUpcoming (discover.ts) for having already-past dates,
// wasting a real curation call on something a deterministic date check
// could have skipped for free. Runs BEFORE curateBrightSourceItems
// (run.ts), using only what the extractor itself already produced — a
// structured end date when dateRangeExtractor exists (galeriahifas.cl),
// or rawDateText's "MES AAAA" text otherwise (galeriametropolitana.org,
// month+year only, no day — see its known-sources.ts note on why there's
// no dateRangeExtractor there). Never used to mark a DECIDED verdict
// (that stays Haiku's + isCurrentOrUpcoming's job for anything not
// obviously stale) — only to skip items clearly past a generous grace
// window, the same posture as every other deterministic pre-filter in
// this file (never invent a date, only act on one the source already
// gave).
const RAW_MONTH_YEAR_REGEX = new RegExp(`\\b(${ES_MONTHS.join("|")})\\s+(\\d{4})\\b`, "i");
// Month+year alone can't say exactly when a show closes, and a run of
// several weeks/months past its stated opening month is normal — only
// flag something clearly stale, not merely "opened a while ago."
const RAW_DATE_EXPIRY_GRACE_MONTHS = 3;

export function isObviouslyExpiredByDate(item: Pick<BrightSourceItem, "structuredEndDate" | "rawDateText">, now: Date): boolean {
  if (item.structuredEndDate) {
    return item.structuredEndDate < now.toISOString().slice(0, 10);
  }
  const match = item.rawDateText.match(RAW_MONTH_YEAR_REGEX);
  if (!match) return false;
  const monthIndex = ES_MONTHS.indexOf(match[1].toLowerCase());
  const year = Number(match[2]);
  if (monthIndex === -1 || Number.isNaN(year)) return false;
  const monthsSince = (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() - monthIndex);
  return monthsSince > RAW_DATE_EXPIRY_GRACE_MONTHS;
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
  // Optional — real gap found 2026-08-17 (galeriapready.cl): its listing
  // unavoidably spans every year at once (2018-2026, see that source's own
  // known-sources.ts note), and a real recurring chunk of those items are
  // artist-roster/profile entries whose "exhib-tab-descr" date field is
  // genuinely empty on the page itself — not a missing-but-inferable date,
  // there is NO date anywhere for these, ever (confirmed: they have no
  // detail-page date either). Sending them to Haiku costs a real judgment
  // call every ~90 days forever (the rejected-candidate dedup window), for
  // an item that can structurally never become approvable. Skips the item
  // entirely, before it ever becomes a BrightSourceItem, when daysRegex is
  // configured but captures nothing — false only for sources where a
  // missing date is still worth Haiku's judgment (most sources), so this
  // must be opted into per-source, not a default.
  skipIfNoDate?: boolean;
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
    if (config.skipIfNoDate && config.daysRegex && !days) continue;
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
  // Real need, noticias.udec.cl (2026-08-13): a general-interest news
  // category (unlike parquecultural.cl/chilecultura.gob.cl, both
  // already-curated events feeds) mixes real visual-art exhibitions with
  // a lot of unrelated content (theater, concerts, cinema, sports,
  // institutional news) — sending everything to Haiku meant rejecting
  // ~5 out of 6 items every run. A deterministic keyword prefilter on
  // title+content, applied BEFORE Haiku ever sees the item (not a scope
  // decision itself — Haiku still judges everything that passes this),
  // cut real volume ~75% with a measured false-negative rate of ~1 in 30
  // (tested against a full year of real posts, 2026-08-13). Absent means
  // no prefilter — unchanged default behavior for every other source.
  includeFilter?: { pattern: RegExp; fields: string[] }; // fields are dotted paths, e.g. ["title.rendered", "content.rendered"]
  // The negative counterpart, applied after includeFilter: drop an item
  // when ANY rule's pattern matches its fields. Real need,
  // chilecultura.gob.cl (2026-09-14): its `disciplines=4` is a
  // discipline tag ("Artes visuales"), not an event type, so the feed
  // mixes real exhibitions with talleres, conferencias, cine, and —
  // via `venue_name` — purely online "venues" (Canal de Youtube,
  // Virtual, Galería/Radio Suyai TV, an online platform publishing PDF
  // artist books as "exhibitions"). 51% approval on an official feed
  // was that, not Haiku being strict. Measured before adding (see
  // known-sources.ts's entry): the venue rule blocks 14/37 live items
  // and ZERO physically-held approved events in the source's whole
  // history (only the 5 virtual ones, one already removed by hand);
  // the title rule would have spared 10/37 recent rejections and the one
  // approved title it matches was itself removed by hand as scope creep.
  // Still not a scope decision — Haiku judges everything that passes.
  excludeFilters?: Array<{ pattern: RegExp; fields: string[] }>;
  // Dotted path to the source post's own publish date (e.g. "date" —
  // WordPress's standard field, "YYYY-MM-DDTHH:mm:ss"). Feeds
  // BrightSourceItem.publishedDate — see that field's own doc comment.
  // Absent means publishedDate stays null, unchanged default behavior.
  publishedDateField?: string;
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

// A WordPress REST API response is already structured — no HTML parsing,
// no guessing which image belongs to which event, no need for Haiku to
// interpret startDate/endDate at all when the source gives them exactly
// (structuredStartDate/EndDate below). Real find (Parque Cultural
// Valparaíso): hora_de_inicio/hora_de_termino are the venue's daily
// opening hours, NOT the inauguración time — the real one, when there is
// one, lives in the description field's free text (rawDateText), so
// Haiku still reads that for openingDatetime specifically.
export function extractWordpressItems(items: unknown[], config: WordpressRestConfig, fallbackUrl: string): BrightSourceItem[] {
  const includedItems = config.includeFilter
    ? items.filter((item) => {
        const text = config.includeFilter!.fields.map((field) => getStringPath(item, field) ?? "").join(" ");
        return config.includeFilter!.pattern.test(text);
      })
    : items;
  const filteredItems = config.excludeFilters
    ? includedItems.filter((item) => {
        const excluded = config.excludeFilters!.some((rule) => {
          const text = rule.fields.map((field) => getStringPath(item, field) ?? "").join(" ");
          return rule.pattern.test(text);
        });
        if (excluded) {
          console.log(`[event-discovery] ${fallbackUrl}: excluded before curation by excludeFilters: ${JSON.stringify(getStringPath(item, config.titleField) ?? "(sin título)")}`);
        }
        return !excluded;
      })
    : includedItems;

  return filteredItems.map((item) => {
    const title = getStringPath(item, config.titleField) ?? "(sin título)";
    const rawDescription = getStringPath(item, config.descriptionField);
    const description = rawDescription ? collapseWhitespace(rawDescription) || null : null;
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
      publishedDate: formatWpDate(getStringPath(item, config.publishedDateField)),
      location: getStringPath(item, config.locationField) ?? null,
      placeName: getStringPath(item, config.placeNameField) ?? null,
    };
  });
}

export type ExtractorConfig = ArticleListConfig | WordpressRestConfig | SafaAgendaConfig;

// --- safaAgendaApi: safa.cl's festival agenda ---------------------------
//
// Santiago Festival de las Artes (SAFA, first edition 6-11 Oct 2026: 150+
// spaces, 800+ activities). Its /programa/agenda page is an empty shell
// filled in client-side from two public, unauthenticated JSON endpoints
// (found 2026-10-11 via the page's own programme-agenda.js; robots.txt
// allows everything), so a plain fetch is enough — no headless browser:
//
// 1. `/programa/agenda.json` — the whole programme, one row per
//    (activity, day) slot, plus `eventsFilterMeta`: activity id -> its
//    `tipos` and its days. Thin: no description, no address.
// 2. `/programa/eventos/detalle?ids=1,2,...` (batch; 40 ids per call
//    verified) — per activity: description, photo, venue (`espacio`,
//    `direccion`, `comuna`) and `fechas`, each with its real hour label.
//
// What SAFA calls an "event" is an ACTIVITY of any kind (exposición,
// inauguración, visita mediada, taller, charla, música, cine...). Only the
// two exhibition-shaped tipos are kept (config.includeTipos): measured on
// the 2026-10-11 snapshot, 127 of 243 activities, and every dropped one
// was a guided visit, workshop, talk, screening or open-studio encounter
// — out of scope by the format test (docs/overview.md). Same posture as
// every other prefilter here: not a scope decision (Haiku still judges
// the rest), just not paying to ask about the obviously-out-of-scope.
//
// Dates are the festival's own, NOT the exhibition's: none of the 102
// "Exposición" descriptions states a real run, so structured start/end are
// the first/last day SAFA lists the activity open — the honest reading of
// "open to the public during SAFA". An "Inauguración" activity's first
// listed day+hour is the opening (structuredOpeningDatetime).
//
// There is no public per-activity page (clicking a card only opens a
// modal), so sourceUrl is the venue's public /programa/espacio/<id> page,
// which lists its activities, plus `?evento=<id>&edicion=<year>` — unique
// per activity, which matters because rejected_candidates is keyed by
// source_url (a bare venue URL would let one rejection block every other
// activity at the same space) — and the year keeps a future edition that
// reuses ids from colliding with this one's.
export interface SafaAgendaConfig {
  kind: "safaAgendaApi";
  detailUrl: string; // batch endpoint, e.g. "https://www.safa.cl/programa/eventos/detalle"
  venuePageBaseUrl: string; // e.g. "https://www.safa.cl/programa/espacio"
  includeTipos: string[]; // keep an activity when ANY of its tipos is listed
}

// Max ids per detail request (40 verified on the live endpoint).
export const SAFA_DETAIL_CHUNK_SIZE = 40;

export interface SafaFecha {
  date?: string; // YYYY-MM-DD
  label?: string; // "08/10/2026 19:30 – 22:00"
}

export interface SafaEventDetail {
  id?: number;
  title?: string;
  description?: string;
  photo_url?: string | null;
  espacio?: string;
  espacio_id?: number;
  direccion?: string | null;
  direccion_confidencial?: boolean;
  comuna?: string | null;
  tipos?: string[];
  fechas?: SafaFecha[];
}

// Ids (as strings, the JSON keys) of the activities worth fetching details
// for. Null when the payload doesn't have the expected shape — the caller
// treats that as a source failure rather than "no events".
export function selectSafaEventIds(agenda: unknown, config: SafaAgendaConfig): string[] | null {
  const meta = (agenda as { eventsFilterMeta?: unknown } | null)?.eventsFilterMeta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const ids: string[] = [];
  for (const [id, row] of Object.entries(meta as Record<string, { tipos?: unknown }>)) {
    const tipos = Array.isArray(row?.tipos) ? row.tipos : [];
    if (tipos.some((tipo) => typeof tipo === "string" && config.includeTipos.includes(tipo))) ids.push(id);
  }
  return ids;
}

// Descriptions are free text typed by the venues; a contact email can sit
// in one (seen once on the 2026-10-11 snapshot, in an activity this
// config filters out anyway). Never carried into the calendar.
const EMAIL_REGEX = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

function cleanSafaDescription(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\r\n?/g, "\n")
    .replace(EMAIL_REGEX, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned ? truncateSafely(cleaned, 1500) : null;
}

const SAFA_LABEL_START_TIME = /(\d{1,2}):(\d{2})/;

interface SafaDay {
  date: string;
  startTime: string | null; // "HH:MM", null when the label has none
  label: string;
}

function parseSafaDays(fechas: SafaFecha[] | undefined): SafaDay[] {
  const days: SafaDay[] = [];
  for (const fecha of fechas ?? []) {
    if (!fecha.date || !/^\d{4}-\d{2}-\d{2}$/.test(fecha.date)) continue;
    const label = (fecha.label ?? "").trim();
    // The label repeats the date ("08/10/2026 19:30 – 22:00"), so the
    // first HH:MM in it is the start hour.
    const time = label.match(SAFA_LABEL_START_TIME);
    days.push({ date: fecha.date, startTime: time ? `${time[1].padStart(2, "0")}:${time[2]}` : null, label });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeSafaTitle(title: string): string {
  return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

interface SafaItemDraft {
  item: BrightSourceItem;
  venueKey: string; // espacio_id + normalized title, for the merge below
  hasOpening: boolean;
}

export function extractSafaItems(details: Record<string, SafaEventDetail>, config: SafaAgendaConfig, fallbackUrl: string): BrightSourceItem[] {
  const drafts: SafaItemDraft[] = [];

  for (const [id, event] of Object.entries(details)) {
    const title = event.title?.trim();
    if (!title) continue;
    const tipos = event.tipos ?? [];
    if (!tipos.some((tipo) => config.includeTipos.includes(tipo))) continue;
    // A private studio address is the one thing this site marks as not
    // for publication — an activity at one is skipped whole.
    if (event.direccion_confidencial) continue;
    const days = parseSafaDays(event.fechas);
    if (days.length === 0) continue;

    const first = days[0];
    const last = days[days.length - 1];
    const isInauguracion = tipos.includes("Inauguración");
    // 00:00 is the all-day placeholder ("00:00 – 23:59"), not an hour a
    // ceremony starts at.
    const hasOpening = isInauguracion && first.startTime !== null && first.startTime !== "00:00";

    const comuna = event.comuna?.trim() || null;
    const direccion = event.direccion?.replace(/\s+/g, " ").trim() || null;
    const venuePage = event.espacio_id !== undefined ? `${config.venuePageBaseUrl}/${encodeURIComponent(String(event.espacio_id))}` : fallbackUrl;

    drafts.push({
      venueKey: `${event.espacio_id ?? ""}|${normalizeSafaTitle(title)}`,
      hasOpening,
      item: {
        title,
        sourceUrl: `${venuePage}?evento=${encodeURIComponent(id)}&edicion=${first.date.slice(0, 4)}`,
        imageUrl: event.photo_url || null,
        description: cleanSafaDescription(event.description),
        locationHint: null,
        rawDateText: `Abierto durante SAFA: ${days.map((day) => day.label || day.date).join("; ")}`,
        structuredStartDate: first.date,
        structuredEndDate: last.date,
        structuredOpeningDatetime: hasOpening ? `${first.date}T${first.startTime}` : null,
        location: comuna,
        placeName: event.espacio?.trim() || null,
        address: direccion ? (comuna ? `${direccion}, ${comuna}` : direccion) : null,
      },
    });
  }

  // The same exhibition is often listed twice at one space — once as an
  // "Exposición" (its open days) and once as an "Inauguración" (its
  // opening night) — 14 of 26 inauguraciones on the 2026-10-11 snapshot
  // had an identically-titled Exposición. One item per exhibition: the
  // first-seen item stays, absorbing the other's opening and day span.
  const merged: SafaItemDraft[] = [];
  const byKey = new Map<string, SafaItemDraft>();
  for (const draft of drafts) {
    const existing = byKey.get(draft.venueKey);
    if (!existing) {
      byKey.set(draft.venueKey, draft);
      merged.push(draft);
      continue;
    }
    // Two different opening nights under one title are two events.
    if (existing.hasOpening && draft.hasOpening) {
      merged.push(draft);
      continue;
    }
    const a = existing.item;
    const b = draft.item;
    a.structuredStartDate = [a.structuredStartDate, b.structuredStartDate].filter((d): d is string => d !== null).sort()[0] ?? null;
    a.structuredEndDate = [a.structuredEndDate, b.structuredEndDate].filter((d): d is string => d !== null).sort().reverse()[0] ?? null;
    a.structuredOpeningDatetime = a.structuredOpeningDatetime ?? b.structuredOpeningDatetime ?? null;
    a.description = (a.description?.length ?? 0) >= (b.description?.length ?? 0) ? a.description : b.description;
    a.imageUrl = a.imageUrl ?? b.imageUrl;
    existing.hasOpening = existing.hasOpening || draft.hasOpening;
  }
  return merged.map((draft) => draft.item);
}
