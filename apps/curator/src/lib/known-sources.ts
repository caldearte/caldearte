// Persisted list of "fuentes brillantes" — sources that have already
// proven to reliably list multiple real events in one place, fetched
// directly every run regardless of what search turns up. Not scoped to
// any single comuna/city; grows by hand as more of these get found.
//
// Also excluded from regular Tavily searches (via excludeDomains) since we
// already cover them via direct fetch — avoids paying to re-discover the
// same content through search. Doesn't apply to social platforms (a
// domain like instagram.com is shared by thousands of unrelated accounts,
// excluding it would exclude everything, not just one known-good source).
//
// lastReviewedAt: manual review cadence — every 3-6 months, confirm the
// URL still works and is still worth fetching directly. Not automated;
// just a note for whoever does the periodic check.
//
// `extractor`: which registry parser (event-discovery/extractors.ts) knows
// how to pull individual events out of this source's real structure —
// config, not a new one-off function per site. Its `kind` also decides HOW
// the source gets fetched: "wordpressRestApi" -> REST call, anything else
// (an "articleList" config, or no extractor at all) -> plain HTML page
// fetch, falling back to a whole-page flatten when there's no config or it
// doesn't match. A type-only import from event-discovery/ is the one place
// this file points "up" instead of down — extractor shapes are inherently
// owned by the extraction registry, not worth duplicating here.
import type { ExtractorConfig, DateRangeConfig } from "../event-discovery/extractors.js";
import type { OpeningTimeConfig } from "./opening-time.js";
import type { DescriptionConfig } from "./description-extract.js";

export interface KnownSource {
  url: string;
  note: string;
  lastReviewedAt: string;
  extractor?: ExtractorConfig;
  additionalPages?: string[];
  // Sibling to `extractor`, not nested inside it: the opening date+time
  // lives on a DIFFERENT page than the listing markup `extractor`
  // describes (each event's own detail page, reachable only via the
  // candidate's post-curation sourceUrl) — see lib/page-fetch.ts's
  // enrichCandidates and docs/region-discovery.md. Opt-in per source since
  // the phrasing varies too much across sites for one universal regex.
  openingTimeExtractor?: OpeningTimeConfig;
  // Present only for a confirmed single fixed-venue source — its comuna
  // never varies per event, so there's nothing for Haiku to infer or
  // report: attached directly in code by discover.ts's
  // curateBrightSourceItems, same posture as sourceUrl/imageUrl already
  // being deterministic from the extractor (2026-07-24). Deliberately
  // absent for real aggregators (arteinformado.com, uchile.cl root,
  // artes.uchile.cl) whose events span many different comunas/venues —
  // resolving "MAC Quinta Normal" -> "Santiago" needs real-world venue
  // knowledge a regex can't have, so those sources keep asking Haiku.
  fixedLocation?: { location: string; placeName: string };
  // Sibling to openingTimeExtractor, same reasoning: a real description
  // only exists on the event's own detail page for these sources (their
  // LISTING page never carries prose, confirmed 2026-07-24 by fetching
  // real pages — see docs/region-discovery.md) — recovered by
  // page-fetch.ts's enrichCandidates during the SAME detail-page fetch
  // already done for opening-time/image recovery, not a separate request.
  descriptionExtractor?: DescriptionConfig;
  // Same mechanism as descriptionExtractor (reuses DescriptionConfig — the
  // extraction shape is identical: capture raw text off the detail page,
  // strip tags, decode entities) but for a real aggregator's per-event
  // comuna, recovered deterministically instead of asked of Haiku
  // (2026-07-24). Captures whatever address/location text the detail page
  // states — often a full street address, not just a bare comuna name —
  // page-fetch.ts's enrichCandidates runs that through
  // lib/locations.ts's extractComunaName to pull out just the real,
  // canonical comuna for `location`, same short "Comuna" display
  // convention every other candidate already uses (not the full address).
  // Absent on a `fixedLocation` source — there's nothing to look up,
  // the comuna is already a constant.
  locationExtractor?: DescriptionConfig;
  // Sibling to openingTimeExtractor/descriptionExtractor: for a source
  // whose LISTING page states only an incomplete date (mssa.cl's slider,
  // confirmed 2026-07-28: "Abierta hasta el 2 de agosto 2026" — a real
  // end date, but never a start date, unlike every other articleList
  // source's dateRangeExtractor which parses a full range straight off
  // the listing block), recover the full runStartDate/runEndDate from the
  // event's own detail page instead — same DateRangeConfig shape as
  // ArticleListConfig's own dateRangeExtractor (extractDateRange is
  // generic over any HTML string, listing block or detail page), just
  // fetched pre-curation (lib/page-fetch.ts's enrichBrightSourceItemDetails)
  // rather than parsed from the block. Necessary here specifically
  // because a missing runStartDate would otherwise make
  // enforceDateCompleteness reject an otherwise-real exhibition before
  // curation ever gets to see the detail page's real dates.
  detailDateRangeExtractor?: DateRangeConfig;
}

export const KNOWN_SOURCES: KnownSource[] = [
  {
    url: "https://artes.uchile.cl/agenda/30dias/1",
    note: "Rolling 30-day agenda, Universidad de Chile — lists multiple real exhibitions per entry, updates dynamically.",
    lastReviewedAt: "2026-07-24",
    // Real bug, found 2026-07-24 (user caught it from a screenshot): the
    // trailing number is real pagination (confirmed live — links up to
    // page 30+), not an arbitrary suffix. This was "/6" — no page 1, no
    // justification for 6 anywhere in history — likely a leftover from
    // whatever page a manual test happened to load originally. Each real
    // exhibition repeats across many pages (the agenda lists every open
    // day within the 30-day window as its own entry), so "/6" alone
    // wasn't silently broken (it still had ~14/15 real exhibitions), but
    // "/1" is the correct, current, non-arbitrary starting page. Even so,
    // page 1 alone was still missing 1 real exhibition ("Materia
    // sensible") that only showed on later pages — additionalPages: page
    // 2 closes that gap (page 1 + page 2 together had all 15/15 real
    // exhibitions in the live check), same pattern as arteinformado.com.
    additionalPages: ["https://artes.uchile.cl/agenda/30dias/2"],
    extractor: {
      kind: "articleList",
      blockRegex: /<article class="mod-cal-result__item">([\s\S]*?)<\/article>/g,
      titleLinkRegex: /<h4 class="mod__item-title"><a href="([^"]+)">([^<]*)<\/a><\/h4>/,
      // Real markup has a typo — some entries use "item-place", most use
      // "item-placer" — match both rather than assuming the source will fix it.
      daysRegex: /class="mod-cal-result__item-days"[^>]*>([\s\S]*?)<\/p>/,
      placeRegex: /class="mod-cal-result__item-place[a-z]*"[^>]*>([\s\S]*?)<\/p>/,
      // Real markup, confirmed 2026-07-24: "Todos los días (excepto el
      // lunes) del 11/07/2026 al 11/10/2026" — DD/MM/YYYY, always a range.
      dateRangeExtractor: {
        pattern: /del\s+(?<startDay>\d{1,2})\/(?<startMonth>\d{1,2})\/(?<startYear>\d{4})\s+al\s+(?<endDay>\d{1,2})\/(?<endMonth>\d{1,2})\/(?<endYear>\d{4})/i,
      },
    },
    // Real markup, confirmed 2026-07-24 against a live detail page — the
    // listing page itself never carries description prose (only title/
    // days/place), so this needs its own detail-page fetch, same as
    // openingTimeExtractor below (same CMS/template as uchile.cl root).
    descriptionExtractor: {
      pattern: /<div class="content__description"[^>]*>([\s\S]*?)<\/div>\s*<!--\/ description -->/,
    },
    // Real markup, confirmed 2026-07-24: the detail page's own address
    // microdata (<address itemprop="address">...comuna appears at the
    // end, e.g. "..., Santiago, Chile"...</address>) — fed through
    // lib/locations.ts's extractComunaName to pull out just "Santiago",
    // not the whole address text. A real aggregator (this source spans
    // many different comunas), so unlike fixedLocation sources this
    // still needs a per-event lookup — just no longer one Haiku has to
    // infer from general knowledge of where a venue is.
    locationExtractor: {
      pattern: /itemprop="address">\(?([\s\S]*?)\)?<\/address>/,
    },
  },
  {
    url: "https://uchile.cl/agenda/30dias/1",
    note: 'Rolling 30-day agenda, Universidad de Chile\'s ROOT domain (not artes.uchile.cl — same underlying CMS/template, confirmed identical markup, but this feed aggregates exhibitions across faculties, e.g. Arquitectura y Urbanismo\'s Galería Micromedios, which artes.uchile.cl (Facultad de Artes only) never surfaces). Real production bug (found 2026-07-20): "Exhibición \'Alzar curva la mirada\'..." (Galería Micromedios, FAU) had sourceUrl=https://uchile.cl/agenda/exposiciones/10 — a listing page, not its own detail page — because this root domain had no dedicated entry yet, so it came in via regular per-comuna Tavily search instead of a direct fetch, and Tavily\'s plain-text extraction of a listing page drops per-event hrefs (same root cause as the arteinformado.com bug above). A dedicated extractor here fixes it the same way: each block\'s own <h4 class="mod__item-title"><a href="..."> is the correct per-event detail page, resolved against this page\'s own URL since the hrefs are relative (e.g. "/agenda/241838/exhibicion-alzar-curva-la-mirada-del-artista-francisco-belarmino").',
    lastReviewedAt: "2026-07-24",
    // Real bug, found 2026-07-24 — see artes.uchile.cl's own comment above
    // (identical issue, same CMS): "/6" was an arbitrary, undocumented
    // page number, not page 1. Fixed to "/1" + additionalPages page 2.
    additionalPages: ["https://uchile.cl/agenda/30dias/2"],
    extractor: {
      kind: "articleList",
      blockRegex: /<article class="mod-cal-result__item">([\s\S]*?)<\/article>/g,
      titleLinkRegex: /<h4 class="mod__item-title"><a href="([^"]+)">([^<]*)<\/a><\/h4>/,
      daysRegex: /class="mod-cal-result__item-days"[^>]*>([\s\S]*?)<\/p>/,
      placeRegex: /class="mod-cal-result__item-place[a-z]*"[^>]*>([\s\S]*?)<\/p>/,
      // Same CMS/template as artes.uchile.cl — see its own dateRangeExtractor comment.
      dateRangeExtractor: {
        pattern: /del\s+(?<startDay>\d{1,2})\/(?<startMonth>\d{1,2})\/(?<startYear>\d{4})\s+al\s+(?<endDay>\d{1,2})\/(?<endMonth>\d{1,2})\/(?<endYear>\d{4})/i,
      },
    },
    // Real markup, confirmed 2026-07-20 against
    // .../agenda/241838/exhibicion-alzar-curva-la-mirada-del-artista-francisco-belarmino:
    // the opening time is NOT in an "Inauguración:" line (there isn't one)
    // — it's phrased as an invitation, "Los esperamos este miércoles 01 de
    // julio a las 18.00h. en Galería Micromedios...". The month is spelled
    // out in full ("julio", not "jul"), so the month group only captures
    // its first 3 letters (matching extractOpeningDatetime's existing
    // 3-letter lookup) while `[a-zé]*` consumes the rest. Only hand-verified
    // against this single real page — the phrasing may vary across other
    // uchile.cl event pages, unlike arteinformado.com's 20-page sample;
    // revisit if a future enrichment run turns up a non-matching format.
    openingTimeExtractor: {
      pattern:
        /esperamos\s+este\s+\S+\s+(?<day>\d{1,2})\s+de\s+(?<month>[a-zé]{3})[a-zé]*\s+a\s+las\s+(?<hour>\d{1,2})[.:](?<minute>\d{2})\s*h?/i,
    },
    // Same CMS/template as artes.uchile.cl, confirmed 2026-07-24 against a
    // real detail page on this root domain too.
    descriptionExtractor: {
      pattern: /<div class="content__description"[^>]*>([\s\S]*?)<\/div>\s*<!--\/ description -->/,
    },
    // Same CMS/template as artes.uchile.cl — see its own locationExtractor comment.
    locationExtractor: {
      pattern: /itemprop="address">\(?([\s\S]*?)\)?<\/address>/,
    },
  },
  {
    url: "https://parquecultural.cl/wp-json/wp/v2/events_list?_fields=title,meta&per_page=20",
    note: 'WordPress REST API behind Parque Cultural Valparaíso\'s events widget (the widget itself is JS-rendered, invisible to a plain fetch — found via the browser\'s Network tab). Structured fields: title.rendered, meta.imagen_evento (image), meta.extracto_corto (free-text description, often states the real "Inauguración" date/time — meta.hora_de_inicio/hora_de_termino are just the venue\'s daily opening hours, NOT the inauguración time), meta.fecha_de_inicio/fecha_de_termino (YYYYMMDD).',
    lastReviewedAt: "2026-07-12",
    extractor: {
      kind: "wordpressRestApi",
      titleField: "title.rendered",
      linkField: "meta.link_al_evento",
      imageField: "meta.imagen_evento",
      descriptionField: "meta.extracto_corto",
      startDateField: "meta.fecha_de_inicio",
      endDateField: "meta.fecha_de_termino",
    },
    // Single physical venue, one comuna — see BrightSourceItem.locationHint
    // doc comment in extractors.ts for why this is deterministic here but
    // not for a real aggregator.
    fixedLocation: { location: "Valparaíso", placeName: "Parque Cultural de Valparaíso" },
  },
  {
    url: "https://www.mnba.gob.cl/cartelera",
    note: 'Museo Nacional de Bellas Artes\' full listing page (NOT /cartelera/proximos — that variant only shows 1 near-term addition; the plain /cartelera page has the real current lineup, 6 events at last check, 5 of them "Exposición"). Drupal site, clean semantic markup per event.',
    lastReviewedAt: "2026-07-16",
    extractor: {
      kind: "articleList",
      blockRegex: /<article\s+class="node node--evento[^"]*">([\s\S]*?)<\/article>/g,
      titleLinkRegex: /<h2 class="destacado__title"><a href="([^"]+)">([^<]*)<\/a><\/h2>/,
      daysRegex: /field--name-field-fechas"[^>]*>([\s\S]*?)<\/div>/,
      placeRegex: /field--name-institucion"><a[^>]*>([^<]*)<\/a>/,
      // Real markup, confirmed 2026-07-24: the site's own Drupal date
      // field already embeds machine-readable ISO instants —
      // <time datetime="2025-07-10T12:00:00Z">10/Julio/2025</time> hasta
      // el <time datetime="...">31/Julio/2027</time> — no month-name
      // parsing needed at all, just read the attributes directly.
      dateRangeExtractor: {
        pattern: /<time datetime="(?<startIso>\d{4}-\d{2}-\d{2})[^"]*"[^>]*>[\s\S]*?<time datetime="(?<endIso>\d{4}-\d{2}-\d{2})[^"]*"[^>]*>/,
      },
    },
    fixedLocation: { location: "Santiago", placeName: "Museo Nacional de Bellas Artes" },
    // Real markup, confirmed 2026-07-24 against a live detail page —
    // listing page has no prose, only a topic/type tag and an address.
    descriptionExtractor: {
      pattern: /<div class="text-long">([\s\S]*?)<\/div>/,
    },
  },
  {
    url: "https://www.museoregionalaysen.gob.cl/cartelera",
    note: 'Museo Regional de Aysén (Coyhaique) — same SNPC/Drupal template as mnba.gob.cl, confirmed 2026-07-27 (identical block/title/days/place markup, verbatim-reusable regexes). /cartelera lists current exhibitions (2 at last check, both real exposiciones, spanning two on-site venues — "Bodega" and "Cocina de Peones" — hence fixedLocation.placeName stays the museum\'s own name, not the sub-venue). additionalPages: /cartelera/proximos (empty at last check, but a real separate view for upcoming-not-yet-open exhibitions — same pattern as this session\'s other paginated/multi-view sources).',
    lastReviewedAt: "2026-07-27",
    additionalPages: ["https://www.museoregionalaysen.gob.cl/cartelera/proximos"],
    extractor: {
      kind: "articleList",
      blockRegex: /<article\s+class="node node--evento[^"]*">([\s\S]*?)<\/article>/g,
      titleLinkRegex: /<h2 class="destacado__title"><a href="([^"]+)">([^<]*)<\/a><\/h2>/,
      daysRegex: /field--name-field-fechas"[^>]*>([\s\S]*?)<\/div>/,
      placeRegex: /field--name-institucion"><a[^>]*>([^<]*)<\/a>/,
      // Same CMS/template as mnba.gob.cl — see its own dateRangeExtractor
      // comment (machine-readable <time datetime="..."> pair, no month-name
      // parsing needed).
      dateRangeExtractor: {
        pattern: /<time datetime="(?<startIso>\d{4}-\d{2}-\d{2})[^"]*"[^>]*>[\s\S]*?<time datetime="(?<endIso>\d{4}-\d{2}-\d{2})[^"]*"[^>]*>/,
      },
    },
    fixedLocation: { location: "Coyhaique", placeName: "Museo Regional de Aysén" },
    // Real markup, confirmed 2026-07-27 against a live detail page — same
    // "text-long" container as mnba.gob.cl.
    descriptionExtractor: {
      pattern: /<div class="text-long">([\s\S]*?)<\/div>/,
    },
    // Real markup, confirmed 2026-07-27: unlike mnba.gob.cl/arteinformado.com
    // (which state "Inauguración: <day> de <month>[, <hour>]" on one line),
    // this source's day and hour sit in two SEPARATE <p> elements —
    // "Inauguración: Jueves 19 de marzo" then "Hora: 18:30 h." — adjacent
    // once tags collapse to whitespace, so one pattern spanning both still
    // works without a per-source detail-page restructure.
    openingTimeExtractor: {
      pattern: /Inauguración:\s*\S+\s+(?<day>\d{1,2})\s+de\s+(?<month>[a-zé]{3})[a-zé]*\s+Hora:\s*(?<hour>\d{1,2}):(?<minute>\d{2})/i,
    },
  },
  {
    url: "https://www.museodeancud.gob.cl/cartelera",
    note: 'Museo Regional de Ancud (Chiloé) — same SNPC/Drupal template as mnba.gob.cl and museoregionalaysen.gob.cl, confirmed 2026-07-27 (identical block/title/days/place/date markup, verbatim-reusable regexes). /cartelera lists current exhibitions (1 at last check). additionalPages: /cartelera/proximos (empty at last check, same pagination pattern as the other SNPC sources). Unlike museoregionalaysen.gob.cl, this source\'s one sampled detail page never states an inauguración hour — no openingTimeExtractor added, since one hasn\'t been confirmed against real markup (see docs/region-discovery.md\'s escalation checklist: don\'t guess a pattern, verify it).',
    lastReviewedAt: "2026-07-27",
    additionalPages: ["https://www.museodeancud.gob.cl/cartelera/proximos"],
    extractor: {
      kind: "articleList",
      blockRegex: /<article\s+class="node node--evento[^"]*">([\s\S]*?)<\/article>/g,
      titleLinkRegex: /<h2 class="destacado__title"><a href="([^"]+)">([^<]*)<\/a><\/h2>/,
      daysRegex: /field--name-field-fechas"[^>]*>([\s\S]*?)<\/div>/,
      placeRegex: /field--name-institucion"><a[^>]*>([^<]*)<\/a>/,
      // Same CMS/template as mnba.gob.cl/museoregionalaysen.gob.cl — see
      // their own dateRangeExtractor comments.
      dateRangeExtractor: {
        pattern: /<time datetime="(?<startIso>\d{4}-\d{2}-\d{2})[^"]*"[^>]*>[\s\S]*?<time datetime="(?<endIso>\d{4}-\d{2}-\d{2})[^"]*"[^>]*>/,
      },
    },
    fixedLocation: { location: "Ancud", placeName: "Museo Regional de Ancud" },
    // Real markup, confirmed 2026-07-27 against a live detail page — same
    // "text-long" container as the other SNPC sources.
    descriptionExtractor: {
      pattern: /<div class="text-long">([\s\S]*?)<\/div>/,
    },
  },
  {
    url: "https://www.molinomachmar.cl/cartelera/",
    note: 'Centro de Arte Molino Machmar (CAMM), Frutillar — events/expositions listing page. Mix of exposiciones (visual art, in scope) and performances/charlas (out of scope), which Haiku filters correctly. Real production bug (found 2026-07-16): this page is long (9 mixed-category events, ~68k chars) and the exposiciones happen to sit past the whole-page-flatten\'s 4000-char cutoff (lib/sources.ts) — without a structured extractor, all 3 real exhibitions ("Ausencia y Presencia", "Paisaje en Erupción", "Una Paloma en el Molino") were silently truncated out and never reached Haiku. Per-event title+link live in the SAME <a> tag (its title attribute is "Leer: <event title>"), letting titleLinkRegex read both from one match instead of needing separate title/link patterns.',
    lastReviewedAt: "2026-07-16",
    extractor: {
      kind: "articleList",
      blockRegex: /<article class="page-evento[^"]*">([\s\S]*?)<\/article>/g,
      titleLinkRegex: /<a href="([^"]+)" title="Leer: ([^"]*)" class="page-evento__enlace/,
      daysRegex: /class="evento-fecha[^"]*"[^>]*>([\s\S]*?class="evento-ano[^"]*"[^>]*>[\s\S]*?)<\/p>/,
      // Unlike every other articleList source, this LISTING page already
      // carries real description prose per event (confirmed 2026-07-24) —
      // captured directly here, no separate detail-page fetch needed.
      descriptionRegex: /class="ff-secondary fz-medium lh-high text-uppercase mb-0-last rmb-32">([\s\S]*?)<\/div>\s*<div class="page-evento__entradas">/,
      // Real markup, confirmed 2026-07-24: day+3-letter-month appear in two
      // separate <span> elements, with a single shared year in a sibling
      // element (evento-ano). A single-day event (concert/talk, not an
      // exhibition) puts an hour ("18 HRS") in the second span instead of
      // a month — resolveMonthGroup correctly fails to parse that as a
      // month, so this just yields null for those (harmless: they're
      // rejected on scope grounds anyway, never real exhibitions).
      dateRangeExtractor: {
        pattern:
          /class="evento-fecha[^"]*"[^>]*>[\s\S]*?<span>\s*(?<startDay>\d{1,2})\s+(?<startMonth>[A-ZÁÉÍÓÚ]{3})[\s\S]*?<\/span>\s*<span>\s*(?<endDay>\d{1,2})\s+(?<endMonth>[A-ZÁÉÍÓÚ]{3})[\s\S]*?<\/span>[\s\S]*?evento-ano[^"]*"[^>]*>\s*(?<year>\d{4})/,
      },
    },
    fixedLocation: { location: "Frutillar", placeName: "Centro de Arte Molino Machmar" },
  },
  {
    url: "https://www.arteinformado.com/agenda/exposiciones/exposiciones-de-arte-en-chile-cl_1",
    note: 'ARTEINFORMADO, a large Ibero-American art-events aggregator ("4226 Exposiciones en Chile", paginated —423 pages total; fetches page 1 + page 2 only, see additionalPages below, deliberately not more). Real production bug (found 2026-07-16): this domain was auto-detected as a bright source from REGULAR per-unit Tavily search hits (its listing page kept surfacing across several comuna searches) before this dedicated entry existed. Tavily\'s plain-text extraction of a listing page like this drops each event\'s own detail-page href entirely — only the single aggregator page URL survives as "the block\'s own URL" — so Haiku had no per-event link to report, and (pre-enforceSourceUrlInvariant fix) silently approved several events with sourceUrl=null instead of falling back to that block URL as instructed: "Sín-tesis", "Existen otros mundos, pero están en este", "Hallazgo, réplica, ficción", and others — manually deleted from production once found. A dedicated extractor fixes this at the root: each event block\'s own <h3><a href="..."> IS the correct per-event detail page (confirmed real, e.g. .../agenda/f/existen-otros-mundos-pero-estan-en-este-243857), giving Haiku a specific link and image per event instead of one shared page-level URL.',
    lastReviewedAt: "2026-07-17",
    extractor: {
      kind: "articleList",
      blockRegex: /<div class="col-md-2 col-sm-4 bottom30">([\s\S]*?)(?=<div class="col-md-2 col-sm-4 bottom30">|$)/g,
      titleLinkRegex: /<h3><a href="([^"]+)"[^>]*>([^<]*)<\/a><\/h3>/,
      daysRegex: /class="txt-date txt-gris">([^<]*)<\/span>/,
      placeRegex: /class="font17">([\s\S]*?)<\/div>/,
      // Real markup, confirmed 2026-07-24: "11 jul de 2026 - 11 oct de
      // 2026" — day + 3-letter Spanish month + "de" + year, both ends.
      // Real production regression, same day: with dates left to Haiku to
      // interpret, a real ~28-item batch against this source came back
      // with EVERY item's runStartDate/runEndDate null despite this exact
      // unambiguous text — a mechanical parsing task Haiku shouldn't have
      // been doing in the first place, now fully deterministic.
      dateRangeExtractor: {
        pattern:
          /(?<startDay>\d{1,2})\s+(?<startMonth>[a-zé]{3})\.?\s+de\s+(?<startYear>\d{4})\s*-\s*(?<endDay>\d{1,2})\s+(?<endMonth>[a-zé]{3})\.?\s+de\s+(?<endYear>\d{4})/i,
      },
    },
    // Real production check (2026-07-17): "Sín-tesis" (Galería NAC) was
    // missing from page 1 and only showed up on page 2. The site's sort
    // order isn't chronological/vigencia-first (page 5 already had events
    // that ended ~2 months before today) — pagination URL format is
    // "..._1/N" (a trailing /N, NOT "_N"), confirmed against the page's own
    // pagination links, not guessed.
    additionalPages: ["https://www.arteinformado.com/agenda/exposiciones/exposiciones-de-arte-en-chile-cl_1/2"],
    // Real bug (found 2026-07-19): the listing page's daysRegex above only
    // gives a date RANGE ("15 jul de 2026 - 22 ago de 2026") — every one of
    // the 10 approved arteinformado.com events in production had
    // opening_datetime = null as a result. The specific opening date+time
    // only exists on each event's own detail page, in a structured
    // "Inauguración : ..." line — confirmed against real markup, which is
    // why this pattern is matched against collapsed-whitespace text (see
    // extractOpeningDatetime), not the raw HTML directly (there's a </span>
    // and <br/> between "Inauguración" and the date).
    //
    // Real bug #2 (found 2026-07-19, hours after shipping the fix above):
    // the FIRST version of this regex only matched the "19 a 21 h." range
    // format seen on .../agenda/f/dejar-atras-245428 — but a sample of 20
    // real detail pages (both listing pages' events) showed that format is
    // the outlier (1/20). The overwhelming majority (17/20) use a plain
    // "HH:MM" time ("24 abr de 2026 / 19:00"), one uses "HH:MMh" with no
    // space before the "h" (.../agenda/f/cuerpos-velados-santiago-figueroa-245451),
    // and one has no time at all, just a date (.../agenda/f/sin-tesis-245342)
    // — that last case is a real editorial gap on arteinformado.com's own
    // page, not something to fabricate an hour for; it correctly yields
    // null (event still counts as an "expo actual", just not as an
    // "inauguración", since we genuinely don't know when it opened). The
    // time portion of this regex is one optional group so any of these
    // (range / HH:MM / HH:MMh / absent) matches without needing a separate
    // config entry.
    openingTimeExtractor: {
      pattern:
        /Inauguraci[oó]n\s*:?\s*(?<day>\d{1,2})\s+(?<month>[a-zé]{3})\.?\s+de\s+(?<year>\d{4})(?:\s*\/\s*(?<hour>\d{1,2})(?::(?<minute>\d{2}))?(?:\s*h(?:rs?)?\.?)?(?:\s*a\s*\d{1,2}\s*h(?:rs?)?\.?)?)?/i,
    },
    // Real markup, confirmed 2026-07-24 against a live detail page —
    // labeled "Descripción de la Exposición" right before it, plain text
    // (no nested tags) inside the span itself.
    descriptionExtractor: {
      pattern: /<span class="event-text">([\s\S]*?)<\/span>/,
    },
    // Real markup, confirmed 2026-07-24: the detail page carries a real
    // JSON-LD Event block with a proper schema.org PostalAddress —
    // "addressLocality" is already the exact comuna name, cleaner than
    // any of the other sources' free-text addresses (no streetAddress or
    // "Chile" suffix to strip via extractComunaName, though running it
    // through that function anyway is harmless and keeps this source
    // consistent with the other two).
    locationExtractor: {
      pattern: /"addressLocality":"([^"]+)"/,
    },
  },
  {
    url: "https://mallecoescultura.cl/eventos/categoria/exposicion/",
    note: 'Malleco es Cultura — a regional cultural-tourism portal covering 8 comunas (Angol, Collipulli, Lonquimay, Los Sauces, Purén, Renaico, Traiguén, Victoria). Runs "The Events Calendar" (Modern Tribe/StellarWP) WordPress plugin, confirmed 2026-07-27 against real markup (verified via the plugin\'s own /eventos/lista/?eventDisplay=past archive, since the live upcoming list is empty at time of writing — see below). The site\'s OTHER "exhibición"/"exposición" URLs (/categoria/exhibicion/, /etiqueta/exposicion/) are a DIFFERENT, unrelated thing — a retrospective blog archive (past tense, "FUE INAUGURADA") with no per-item date field at all; deliberately NOT used here. This is the real forward-looking calendar instead, pre-filtered server-side to the "Exposición" event category — reduces (but doesn\'t eliminate) noise from other event types, since the site cross-tags some concerts/talks with "exposicion" too; Haiku still does the real scope judgment same as any other bright source.',
    lastReviewedAt: "2026-07-27",
    // Confirmed EMPTY at time of writing ("No hay eventos programados.") —
    // added anyway per explicit instruction: a fetch that finds nothing
    // costs one HTTP GET + zero Haiku tokens (no items to curate), and the
    // moment a real exhibition gets scheduled here, it's already wired up
    // with no further work. Same reasoning already applied to
    // museoregionalaysen.gob.cl's low-traffic cadence (see
    // docs/region-discovery.md's cadence-decision note there).
    extractor: {
      kind: "articleList",
      blockRegex: /<article\s+class="tribe-events-calendar-list__event[^"]*"\s*>([\s\S]*?)<\/article>/g,
      titleLinkRegex: /tribe-events-calendar-list__event-title[^"]*"\s*>\s*<a\s+href="([^"]+)"[\s\S]*?>\s*([^<]+?)\s*<\/a>/,
      daysRegex: /tribe-events-calendar-list__event-datetime-wrapper[^"]*"\s*>([\s\S]*?)<\/div>/,
      placeRegex: /tribe-events-calendar-list__event-venue-title[^"]*"\s*>\s*([^<]+?)\s*<\/span>/,
      // Unlike most articleList sources, this LISTING page already carries
      // real description prose per event (confirmed 2026-07-27, verified
      // against the plugin's past-events archive) — same as
      // molinomachmar.cl, no separate detail-page fetch needed for this
      // field specifically (still needed for location, below).
      descriptionRegex: /tribe-events-calendar-list__event-description[^"]*"\s*>\s*<p>([\s\S]*?)<\/p>/,
      // Real markup, confirmed 2026-07-27: The Events Calendar always gives
      // exactly ONE date per event (an inauguración/presentation, not a
      // multi-week exhibition run) — no separate end date anywhere. The
      // `dayIso` shorthand (extractDateRange, extractors.ts, added
      // alongside this source) treats that single day as both
      // runStartDate and runEndDate, satisfying enforceDateCompleteness
      // honestly rather than leaving the candidate without a parseable
      // date at all.
      dateRangeExtractor: {
        pattern: /tribe-events-calendar-list__event-datetime"\s*datetime="(?<dayIso>\d{4}-\d{2}-\d{2})"/,
      },
    },
    // A real aggregator (8 comunas), not a fixedLocation — the listing
    // gives a venue NAME (placeRegex, above) but the comuna itself only
    // appears on the event's own detail page, in a clean, already-isolated
    // field: `<span class="tribe-locality">Victoria</span>` (confirmed
    // 2026-07-27) — even cleaner than the other aggregators' full street
    // addresses, no extractComunaName stripping strictly required, though
    // running it through that function anyway keeps this source
    // consistent with the others (arteinformado.com, uchile.cl).
    locationExtractor: {
      pattern: /tribe-locality">([^<]+)<\/span>/,
    },
  },
  {
    url: "https://chilecultura.gob.cl/api/v1.0/eventos/search?page=1&page_size=100&disciplines=4&status=approved",
    note: 'Agenda oficial del Ministerio de las Culturas, las Artes y el Patrimonio — agregador nacional (no un solo venue). Real REST API found by intercepting the live site\'s own network request (2026-07-27) — `disciplines=4` filters to "Artes visuales" (NOT `discipline_id`/`main_discipline`, which silently return everything unfiltered); `region` uses the site\'s own internal numbering, not official Chilean region codes, so left unset here (national scope) rather than risk a wrong id. With `page_size=100` all ~50 filtered results return on page 1 (`page_count: 1`, confirmed against the real response) — no pagination needed. Response body is `{ total_count, page_count, next, previous, results: [...] }`, NOT a bare array like parquecultural.cl (real bug found 2026-07-28 running this in production — see `resultsField` below). Real per-item shape: `name`/`url`/`image`/`description` (rich HTML), `start_date`/`end_date` (YYYY-MM-DD, unlike WordPress\'s YYYYMMDD), `commune`/`venue_name` already given per item — cleanest per-item location data of any bright source so far, no locationExtractor/detail-page fetch needed at all (see BrightSourceItem.location/placeName, extractors.ts). Real cost, computed against all 50 fetched items through the project\'s own estimateCostUsd (2026-07-27): ~$0.046/week (~$0.20/month) — negligible against the ~$5-9/mo baseline.',
    lastReviewedAt: "2026-07-27",
    extractor: {
      kind: "wordpressRestApi",
      resultsField: "results",
      titleField: "name",
      linkField: "url",
      imageField: "image",
      descriptionField: "description",
      startDateField: "start_date",
      endDateField: "end_date",
      locationField: "commune",
      placeNameField: "venue_name",
    },
    // No fixedLocation — genuine national aggregator, real per-item
    // commune/venue_name from the API itself (locationField/placeNameField
    // above), same posture as arteinformado.com/uchile.cl but with cleaner
    // data: Haiku isn't even asked (curateBrightSourceItems's needsLocation
    // is suppressed once every item in a batch already has item.location).
  },
  {
    url: "https://www.mamchiloe.cl/category/hoy/",
    note: 'Museo de Arte Moderno de Chiloé (MAM Chiloé), Castro — single fixed venue, confirmed 2026-07-28 against the real "Información práctica" page: "Parque Municipal de Castro s/n, Chiloé". Genuinely low-cadence: MAM mounts ONE flagship "Muestra Anual" exhibition per summer season (real archive since 1989, /category/muestras_mam/), so this listing typically has 0-1 new items per YEAR — added anyway per the same zero-marginal-cost reasoning as mallecoescultura.cl/museoregionalaysen.gob.cl: one fetch costs nothing when empty, and it\'s already wired up the moment the next Muestra Anual is announced. Real markup (old-school WordPress "Kubrick"-family theme, `box-N post-NNNN` blocks, N increments per item) — confirmed against both /category/hoy/ (1 item) and /category/muestras_mam/ (5 items, full archive) — already carries the FULL post body on the listing page itself (title, real image, complete curatorial text), no separate detail-page fetch needed at all, same posture as molinomachmar.cl. `daysRegex` captures the entry\'s own opening summary line (e.g. "38ª Muestra Anual del MAM Chiloé, desde el 17 de enero al 17 de junio.") when present — no year in that specific phrase, but the post title itself always states the year (e.g. "2026 MUESTRA ANUAL 38"), which Haiku always sees too; left for Haiku to interpret rather than a dedicated regex given the volume is too low to be worth it.',
    lastReviewedAt: "2026-07-28",
    extractor: {
      kind: "articleList",
      blockRegex:
        /<div class="box-\d+ post-\d+ post type-post status-publish format-standard hentry[^"]*" id="post-\d+">([\s\S]*?)(?=<div class="box-\d+ post-\d+ post type-post status-publish format-standard hentry|<div id="footer")/,
      titleLinkRegex: /<h2 class="posttitle"><a href="([^"]+)"[^>]*>([^<]*)<\/a><\/h2>/,
      daysRegex: /<div class="entry">\s*<p><b>([^<]+)<\/b><\/p>/,
    },
    fixedLocation: { location: "Castro", placeName: "Museo de Arte Moderno de Chiloé" },
  },
  {
    url: "https://centronacionaldearte.cultura.gob.cl/categoria/programacion/exposiciones/",
    note: 'Centro Nacional de Arte Contemporáneo (CNAC), Cerrillos — official Ministerio de las Culturas institution, single fixed venue confirmed 2026-07-28 against the real "Información para el visitante" page: "Pedro Aguirre Cerda 6100, Cerrillos, Santiago, Región Metropolitana, Chile". Real, active, dedicated "Exposiciones" category (posts from 2023 through May 2026 at time of review, 4 archive pages, not stale). Listing page gives title/image/a real per-item date (`<p>miércoles 27 de mayo de 2026</p>`, absolute but the PUBLISH date, not necessarily the exhibition\'s own dates) — no prose at all on the listing, unlike MAM Chiloé, so a real `descriptionExtractor` (below) recovers the actual body text from each detail page pre-curation. That body prose states real exhibition dates, but INCONSISTENTLY phrased (sometimes a full "Del 4 de noviembre de 2023 al 5 de mayo 2024" range, sometimes relative — "El próximo 30 de mayo a las 12hrs", "este sábado 27 de septiembre se inauguró" — with no year in that specific phrase, resolvable only via the nearby publish-date context) — too inconsistent for a dedicated dateRangeExtractor regex; left for Haiku to interpret from the recovered description text (which includes the publish-date line) plus the item\'s own rawDateText, same posture as uchile.cl/mnba.gob.cl before those got deterministic dates. `titleLinkRegex` uses a lookahead to capture href from the `<a class="mas" href="...">+ Más</a>` link while the visible title text lives in a separate preceding `<span>` (not inside that same `<a>`, unlike every other articleList source so far).\n\nReal bug found building this (2026-07-28): CNAC\'s WordPress install encodes every accented character as a HEX NUMERIC HTML entity (`&#xE1;` for á, `&#x2014;` for an em dash, etc.), not a named one — `lib/description-extract.ts`\'s `decodeHtmlEntities` only had a named-entity lookup table and silently left numeric references undecoded. Fixed generically (numeric hex/decimal references resolved by codepoint, before the named-entity table), not just for CNAC — any future source using numeric entities benefits too.',
    lastReviewedAt: "2026-07-28",
    extractor: {
      kind: "articleList",
      blockRegex: /<div class="box1">([\s\S]*?)<\/div> <!-- box1 -->/,
      titleLinkRegex: /(?=<span>[^<]+<\/span>[\s\S]*?<a class="mas" href="([^"]+)">)<span>([^<]+)<\/span>/,
      daysRegex: /<p>([^<]+)<\/p>/,
    },
    fixedLocation: { location: "Cerrillos", placeName: "Centro Nacional de Arte Contemporáneo" },
    descriptionExtractor: {
      pattern: /class="info-box2">([\s\S]*?)<!-- \/Section: contenido-->/,
    },
  },
  {
    url: "https://www.mssa.cl/exposiciones/",
    note: 'Museo de la Solidaridad Salvador Allende (MSSA), Santiago — single fixed venue, evaluated 2026-07-27/28 as the ORIGINAL source for exhibitions that chilecultura.gob.cl (the national aggregator, already a known source) also re-lists; adding it matters because of the new replace-priority dedup (2026-07-28, see docs/region-discovery.md): a real case found comparing both sources for "América despierta" showed chilecultura.gob.cl carrying a stale run_end_date the museum\'s own page had already corrected — the aggregator wins no ties against MSSA\'s own page now that isAggregatorSource can tell them apart.\n\nListing page (`/exposiciones/`) is a homepage-style slider: the FIRST section ("actuales", `temporalidad-actuales` class) lists the museum\'s 2-3 currently open exhibitions; a second "Anteriores" section (`temporalidad-anteriores`) lists dozens of past, closed ones — blockRegex matches only the `actuales` class so past exhibitions are never scraped as if current. Each `actuales` block gives title/image/link plus ONLY an end date ("Abierta hasta el 2 de agosto 2026") — no start date at all on the listing, unlike every other articleList source\'s dateRangeExtractor so far. Confirmed against the real detail page instead: a clean, structured fact block (`Fecha de Inauguración: 24/04/2026`, `Fecha de inicio: 24/04/2026`, `Fecha de término: 16/08/2026`, all DD/MM/YYYY, no hour ever stated for any of the three — confirmed 2026-07-27 across both sampled exhibitions) — recovered pre-curation via the new `detailDateRangeExtractor` (lib/page-fetch.ts\'s enrichBrightSourceItemDetails), since a missing runStartDate on the listing alone would otherwise make enforceDateCompleteness reject a real, currently-open exhibition before curation ever saw the detail page. `openingTimeExtractor`\'s pattern also matches this same DD/MM/YYYY shape (numeric month, not the Spanish 3-letter abbreviation every other openingTimeExtractor config uses) — required a small generalization to lib/opening-time.ts\'s month resolution (numeric-or-abbreviation, same flexibility extractDateRange already had via resolveMonthGroup) since no other source needed it before.',
    lastReviewedAt: "2026-07-28",
    extractor: {
      kind: "articleList",
      blockRegex: /<li class="[^"]*temporalidad-actuales[^"]*">([\s\S]*?)<\/li>/g,
      titleLinkRegex: /<h2><a href="([^"]+)"[^>]*>([^<]+)/,
      daysRegex: /<div class="cat_slider"><a href="[^"]+">([^<]+)<\/a><\/div>/,
    },
    fixedLocation: { location: "Santiago", placeName: "Museo de la Solidaridad Salvador Allende" },
    openingTimeExtractor: {
      pattern: /Fecha de Inauguraci[oó]n:\s*(?<day>\d{1,2})\/(?<month>\d{1,2})\/(?<year>\d{4})/i,
    },
    detailDateRangeExtractor: {
      pattern:
        /Fecha de inicio:\s*<\/span>\s*(?<startDay>\d{1,2})\/(?<startMonth>\d{1,2})\/(?<startYear>\d{4})[\s\S]*?Fecha de t[eé]rmino:\s*<\/span>\s*(?<endDay>\d{1,2})\/(?<endMonth>\d{1,2})\/(?<endYear>\d{4})/i,
    },
  },
  {
    url: "https://www.cclm.cl/exposiciones/",
    note: 'Centro Cultural La Moneda (CCLM), Santiago — a major, prominent national institution, evaluated at the user\'s request 2026-08-08. Single fixed venue (multiple internal salas — Sala Pacífico, Sala Andes, Galería de Patrimonio, etc — but placeName stays the museum\'s own name, same posture as museoregionalaysen.gob.cl\'s multi-sala precedent, not per-sala). WordPress, real "exposicion" custom post type exists via /wp-json/wp/v2/exposicion, but its REST fields never include the exhibition\'s own run dates (only WP\'s own post date/modified) — the real dates only exist as display text on THIS listing page, so this uses the plain HTML articleList path, not wordpressRestApi, despite the REST endpoint existing.\n\nEach exhibition sits in its own "module--asymmetric" wrapper alternating left/right layout (two markup variants for the title <h3>/<a> — one with them adjacent, one split across lines — titleLinkRegex tolerates both via \\s* between tags). blockRegex captures the OUTER wrapper (not just the inner <article class="module--asymmetric__content">) specifically to bring the thumbnail into scope — it renders as a CSS background-image on a sibling <figure>, not an <img> tag, which is why extractImgTags (extractors.ts) gained generic background-image:url() detection here (a real gap, not cclm.cl-specific — any future source with the same pattern benefits).\n\nDates: a "calendar" span states a real range but with THREE different separators across real sampled items ("Agosto 05 / Octubre 11, 2026", "Junio 19 - Nov 01, 2026", "Mayo 07 a Septiembre 27, 2026") and full Spanish month names (not the 3-letter abbreviations most other sources use) — dateRangeExtractor\'s month groups only capture the first 3 letters ([a-zé]{3}[a-zé]*) so resolveMonthGroup\'s existing abbreviation table still resolves them. One sampled item ("Junio 11, 2026 / mayo, 2027") has no end day at all — genuinely too irregular to regex, correctly falls through to null/Haiku\'s own interpretation of the raw daysRegex text rather than forcing a match.\n\nDescription: no prose on the listing itself — recovered from each detail page\'s `content__excerpt` div (confirmed against 2 real detail pages), which includes the full body (opening text + "Sobre el curador" + artist list for the sampled item) — same "capture the whole prose container" posture as mnba.gob.cl/museoregionalaysen.gob.cl\'s "text-long" div. "10:15 a 18:45 horas" on the listing is the museum\'s own daily opening hours, not a per-exhibition inauguración time (same distinction as parquecultural.cl\'s meta.hora_de_inicio) — no openingTimeExtractor, since no confirmed "Inauguración: <fecha> <hora>" phrasing was found on either sampled detail page.\n\nReal bug found building this against the live page (2026-08-08): the blockRegex\'s lookahead terminator was first guessed as `<section class="section--partners">`, which never actually appears on the real page — with no real terminator, the LAST exhibition\'s block silently swallowed the rest of the page (cclm.cl\'s trailing undated "Cine en Chile"/"Viajes en papel" thematic grid, `<article class="box ...">` cards) into its own non-greedy match. Harmless on this specific page (titleLinkRegex only takes the first match per block, so the last real exhibition still extracted correctly), but a real risk on principle for any future page shape. Fixed with the actual terminator confirmed against the live HTML (`<article class="box `, the real point where the asymmetric list ends) — verified all 6 real listed exhibitions extract as 6 separate items, not 5.',
    lastReviewedAt: "2026-08-08",
    extractor: {
      kind: "articleList",
      blockRegex:
        /<div class="module--asymmetric(?: right)?"[^>]*>([\s\S]*?)(?=<div class="module--asymmetric(?: right)?"[^>]*>|<article class="box )/g,
      titleLinkRegex: /<h3 class="module--asymmetric__title">\s*<a href="([^"]+)"[^>]*>\s*([^<]*?)\s*<\/a>\s*<\/h3>/,
      daysRegex: /class="calendar">([^<]+)<\/span>/,
      // Real markup, confirmed 2026-08-08: three separators across real
      // sampled items ("/", "-", "a"), full Spanish month names (only the
      // first 3 letters captured — see resolveMonthGroup, extractors.ts).
      dateRangeExtractor: {
        pattern:
          /(?<startMonth>[a-zé]{3})[a-zé]*\s+(?<startDay>\d{1,2})\s+(?:\/|-|a)\s+(?<endMonth>[a-zé]{3})[a-zé]*\s+(?<endDay>\d{1,2}),?\s*(?<year>\d{4})/i,
      },
    },
    fixedLocation: { location: "Santiago", placeName: "Centro Cultural La Moneda" },
    descriptionExtractor: {
      pattern: /<div class="content__excerpt">([\s\S]*?)<\/div>/,
    },
  },
  {
    url: "https://dieecke.art/exhibiciones/",
    note: 'Die Ecke, a real contemporary-art gallery in Providencia, Santiago — evaluated at the user\'s request 2026-08-08. WordPress, real "exhibiciones" custom post type via /wp-json/wp/v2/exhibiciones, but — same shape as cclm.cl — the REST API never gives real run dates, only a coarse "year" taxonomy (fecha_exhibiciones) and WordPress\'s own post date/modified; the real per-item date range only exists as listing display text, so this uses the plain HTML articleList path.\n\n**Real, important structural finding: Die Ecke has TWO physical locations, Santiago AND Barcelona** (footer confirms both addresses) — NOT a simple single-comuna fixedLocation source without extra care. Each listing item states "Sede Santiago" or "Sede Barcelona" right after its date. A Barcelona exhibition would be genuinely out of scope (Caldearte is Chile-only, same country-scope precedent as casablancacentrocultural.com\'s Perú rejection) — rather than trust Haiku\'s own scope judgment to catch a country mismatch (this project\'s consistent posture is to make anything regex-determinable deterministic, not delegated), blockRegex itself requires "Sede Santiago" to appear via a lookahead right after the opening tag, so a Barcelona-sede block never gets captured as an item at all — confirmed against the real live page (1 real Santiago item extracted, the 1 real Barcelona item correctly excluded).\n\nListing markup is clean (WordPress + Elementor page builder, but this specific listing block isn\'t Elementor-generated soup): `<div class="col-sm-6"><a href="..." title="..."><div class="exhibicion" style="background-image:url(...)"></div><h2>Title</h2></a><p>Artist<br>DD de MES al DD de MES de YYYY<br>Sede X</p></div>` — same CSS-background-image thumbnail pattern as cclm.cl (extractImgTags\'s background-image detection, added for that source, applies here unchanged). Dates: "23 de junio al 31 de agosto de 2026" — day + "de" + full Spanish month (first 3 letters captured) + "al" + day + "de" + full month + "de" + a single shared year — clean and consistent across every sampled item, no irregular cases found (unlike cclm.cl).\n\nDescription: no prose on the listing — recovered from each detail page\'s `dieecke-overflow` div (confirmed against the one real sampled detail page), matching the REST API\'s own `content.rendered` almost exactly (confirmed by comparison) — same "capture the whole prose container" posture as every other detail-page-description source.\n\n**Real bug found building this, fixed generically, not dieecke.art-specific**: `extractors.ts`\'s own `decodeHtmlEntities` (used for titles and image URLs) only ever covered a handful of named entities (`&amp;`/`&quot;`/`&#39;`/`&lt;`/`&gt;`) — this source\'s titles use `&#8211;` (a numeric en-dash reference), which passed through undecoded. `lib/description-extract.ts` already had the fix for this exact class of bug (added 2026-07-28 for centronacionaldearte.cultura.gob.cl\'s numeric entities) but it was never backported to this sibling copy — now it has the same numeric hex/decimal resolution, benefiting every source\'s titles/image URLs, not just this one.\n\nNo openingTimeExtractor — no confirmed "Inauguración: <fecha> <hora>" phrasing found on the one sampled detail page (only general prose describing the show "inaugurating," and the gallery\'s own generic weekly opening hours, unrelated to any specific exhibition).',
    lastReviewedAt: "2026-08-08",
    extractor: {
      kind: "articleList",
      // Positive lookahead requiring "Sede Santiago" within the block —
      // see the note above: this source spans two countries, and a
      // Barcelona item must never be captured as an item at all, not just
      // hoped-away by Haiku's own scope judgment.
      blockRegex: /<div class="col-sm-6">(?=[\s\S]*?Sede Santiago)([\s\S]*?)(?=<div class="col-sm-6">|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>)/g,
      titleLinkRegex: /<a href="([^"]+)"[^>]*>[\s\S]*?<h2>([^<]*)<\/h2>/,
      // The block's own <p> is "Artist<br>DateRange<br>Sede X" — the
      // SECOND segment (between the first and second <br>) is the date.
      daysRegex: /<p>[^<]*<br>([^<]+)<br>/,
      dateRangeExtractor: {
        pattern:
          /(?<startDay>\d{1,2})\s+de\s+(?<startMonth>[a-zé]{3})[a-zé]*\s+al\s+(?<endDay>\d{1,2})\s+de\s+(?<endMonth>[a-zé]{3})[a-zé]*\s+de\s+(?<year>\d{4})/i,
      },
    },
    fixedLocation: { location: "Santiago", placeName: "Die Ecke" },
    descriptionExtractor: {
      pattern: /<div class="dieecke-overflow">([\s\S]*?)<\/div>/,
    },
  },
  {
    url: "https://www.espacioo.com/exhibitions/",
    note: 'Espacio O, a real gallery in Santiago, Chile — evaluated at the user\'s request 2026-08-08, added anyway per their own explicit call despite the caveat below. Runs on Artlogic (a specialized art-gallery site platform — the first source on this platform, not WordPress like every other source so far).\n\n**Real caveat, not yet resolved**: at evaluation time, `/exhibitions/` had ZERO current exhibitions — the page goes straight to "Pasadas" (past), and the most recent one had already closed months before. This extractor is built and verified against the real "Pasadas" markup (4 real past items, fully confirmed), on the assumption that a "Current" section — once Espacio O has one again — renders with the same per-item card template (a reasonable inference for a templated CMS, not custom code, but genuinely UNVERIFIED — no live current example existed to check against). Revisit once this gallery has a real current show, same posture as fme.cl\'s "revisit once updated" note.\n\nMarkup: `<li ... data-width="N" data-height="N">...</li>` per item (blockRegex tolerates OTHER attributes/classes anywhere in the tag — real bug found building this: the LAST item\'s `<li>` also had `class="last"` inserted before data-width, and a rigid `<li\\s+data-width=...` pattern silently dropped it, extracting 3 items instead of 4). Title/link: `<a href="...">...<h2>Title</h2></a>`. Image: a real `<img>` with `data-src` (lazy-load, already handled by extractImgTags\'s existing data-src precedence — no new capability needed). Date: `<span class="date">DD Mes[ YYYY] - DD Mes YYYY</span>` — the START year is only stated when it differs from the end year (cross-year exhibitions state both; same-year ones state it once, at the end) — dateRangeExtractor\'s `year` group (not `endYear`) is what makes both shapes resolve correctly, same shared-year-fallback mechanism molinomachmar.cl already established. Description: real prose already in the listing (`<span class="description prose">`, truncated with "..." — same tradeoff molinomachmar.cl\'s own listing excerpt already accepts), no detail-page fetch needed. No openingTimeExtractor — no "Inauguración" phrasing found on the one sampled detail page.\n\n**Real bug found and fixed generically, not espacioo.com-specific**: this source\'s description surfaced that `collapseWhitespace` (used for every articleList field except title — daysRegex/placeRegex/descriptionRegex) never decoded HTML entities at all, unlike `title`\'s own explicit decodeHtmlEntities wrap — espacioo.com\'s real description shipped literal "&oacute;n"/"&iacute;a" text. Fixed by having collapseWhitespace decode entities itself (strip tags first, decode after — same order lib/description-extract.ts\'s own stripTagsAndCollapse already uses), and consolidated this file\'s own separate, now-redundant SPANISH_HTML_ENTITIES/htmlToPlainText (added 2026-07-28 for chilecultura.gob.cl, wordpressRestApi descriptions only) into the same decodeHtmlEntities table — one copy instead of two silently drifting ones.',
    lastReviewedAt: "2026-08-08",
    extractor: {
      kind: "articleList",
      blockRegex: /<li[^>]*data-width="\d+"[^>]*>([\s\S]*?)<\/li>/g,
      titleLinkRegex: /<a href="([^"]+)"[^>]*>[\s\S]*?<h2>([^<]*)<\/h2>/,
      daysRegex: /<span class="date">([^<]+)<\/span>/,
      descriptionRegex: /<span class="description prose">([\s\S]*?)<\/span>/,
      // The start year is only stated for a real cross-year exhibition
      // ("3 Diciembre 2025 - 31 Marzo 2026") — a same-year one states it
      // once, at the end, only ("29 Mayo - 31 Agosto 2025"). Naming the
      // trailing year "year" (not "endYear") is what makes extractDateRange
      // correctly fall back to it for BOTH the start and end date in the
      // same-year case, while a real startYear still wins when present.
      dateRangeExtractor: {
        pattern:
          /(?<startDay>\d{1,2})\s+(?<startMonth>[a-zé]{3})[a-zé]*(?:\s+(?<startYear>\d{4}))?\s+-\s+(?<endDay>\d{1,2})\s+(?<endMonth>[a-zé]{3})[a-zé]*\s+(?<year>\d{4})/i,
      },
    },
    fixedLocation: { location: "Santiago", placeName: "Espacio O" },
  },
  {
    url: "https://galeriapready.cl/exhibiciones",
    note: 'Galería Patricia Ready, Vitacura — real gallery with two rooms (Sala Ginkgo / Sala Araucaria), evaluated at the user\'s request 2026-08-10. Runs on Webflow, with the listing rendered as a "Tabs" widget: one tab per YEAR (2018-2026), but Webflow renders every tab\'s content in the raw HTML at once (not JS-loaded on click) — a single fetch of `/exhibiciones` yields all ~67 items across every year, not just the current one. Deliberately NOT bounded to just the active/current tab: no robust, maintainable regex bounding was found (the only real option was an unbounded-length lookbehind spanning the whole page, which is exactly the kind of fragile cleverness this codebase avoids elsewhere) — accepted as a one-time cost on the first run (old items get correctly rejected by Haiku for being years in the past, same as any other real-but-outdated candidate; the pre-curation excludedSourceUrls cache means subsequent weekly runs only ever see genuinely new items).\n\nMarkup: `<a href="/exhibition/slug" class="exhib-tabs-item w-inline-block">...<div class="exhib-tab-title">Title</div><div class="exhib-tab-descr">DATE</div>...</a>` — up to 3 "exhib-tab-descr" divs per item (date, then an optional status label "Próximamente"/"En curso", then an optional Sala name), but only the FIRST is captured (daysRegex matches the first non-"w-dyn-bind-empty" one) — the other two are display-only convenience labels, not load-bearing for curation. The listing\'s own date is in ENGLISH ("August 26, 2026", "July 22, 2026") — Spanish month abbreviations (ES_MONTH_ABBR, extractors.ts) don\'t apply, so no dateRangeExtractor is set here; the raw text (with its real, reliable YEAR) is left as rawDateText for Haiku to interpret, grounded by the real quote.\n\n**Real inconsistency found, the reason there\'s no openingTimeExtractor/detailDateRangeExtractor here**: the detail page\'s own rich-text write-up states a real "Inauguración: [weekday] DD de MES HH:MM hrs" / "Exposición abierta hasta: DD de MES" pair — day+month only, no year, in Spanish — that LOOKS like a clean fit for the existing openingTimeExtractor + its inferYear fallback (same mechanism uchile.cl\'s "esperamos este miércoles..." phrasing already uses). Tried it, verified against 2 real detail pages — and found the DETAIL PAGE\'S own inauguración date can flatly DISAGREE with the LISTING\'s own date field for the same exhibition ("Martín Daiber - Primavera": listing said "July 13, 2026", detail page said "Inauguración: miércoles 10 de junio 18:00 hrs" — June 10, a full month earlier). Worse, inferYear\'s 60-day-past tolerance (tuned for uchile.cl\'s rolling 30-day agenda, where an event is never more than a few weeks out) rolled a real "En curso" (currently running) exhibition\'s June opening forward to 2027 when tested against an August reference date, since by the time a multi-week-long exhibition is still running, its OWN opening can easily be 60+ days in the past — a materially different temporal profile than the rolling-agenda sources this inference was built for. Given the source\'s own two fields can disagree, and the shared year-inference heuristic doesn\'t fit this gallery\'s longer exhibition-run length, deterministically merging them risked writing a confidently-wrong date — safer to leave full date interpretation (including reconciling the listing vs. detail-page discrepancy) to Haiku, backed by the mandatory quote-grounding check, than to risk silent corruption.\n\nDescription: real curatorial write-up recovered from the detail page\'s `<div class="w-richtext">` block, cut off right before "Contacto prensa" (present on every real write-up, absent on an empty/not-yet-written one — matched WITHOUT anchoring to `<p>` immediately before it, since some pages wrap it in `<strong>` and some don\'t: anchoring broke silently on "Martín Daiber - Primavera" specifically until loosened). Real limitation, not fixed: this same richtext block also contains the artist\'s full biography/CV and contact info with no HTML boundary separating it from the exhibition\'s own description — the recovered text is real (not fabricated) but includes more than a strict "exhibition description" would.\n\nAn item whose exhibition hasn\'t been written up yet ("Próximamente", far future) has a completely EMPTY richtext block on its detail page — descriptionExtractor correctly yields nothing for those; Haiku curates on title + listing date alone.',
    lastReviewedAt: "2026-08-10",
    extractor: {
      kind: "articleList",
      blockRegex: /(<a href="\/exhibition\/[^"]+" class="exhib-tabs-item w-inline-block">[\s\S]*?<\/a>)/g,
      titleLinkRegex: /<a href="([^"]+)"[^>]*>[\s\S]*?exhib-tab-title">([^<]*)</,
      daysRegex: /class="exhib-tab-descr">([^<]*)</,
    },
    fixedLocation: { location: "Vitacura", placeName: "Galería Patricia Ready" },
    descriptionExtractor: {
      pattern: /class="[^"]*\bw-richtext\b[^"]*">([\s\S]*?)Contacto prensa/,
    },
  },
  {
    url: "https://www.aninatgaleria.org/2026-1",
    note: 'Aninat Galería, Vitacura — real gallery, evaluated at the user\'s request 2026-08-10. Squarespace site; the listing is a "summary block" gallery grid.\n\nMarkup: the item\'s image-link anchor conveniently carries BOTH the real title (`data-title="..."`, HTML-entity-encoded) AND the detail-page href in one tag — `<a href="/exhibiciones-2026-aux/slug" class="summary-thumbnail-container..." data-title="Artist | &quot;Show&quot;">...<img data-src="...">...</a>` — captured as the whole block so extractImgTags\' generic data-src precedence picks up the same real photo, no separate titleLinkRegex/img-tag hunting needed.\n\n**Real trap found and avoided: the listing\'s own `<time datetime="...">` is NOT the exhibition\'s date.** It looked exactly like mnba.gob.cl/mallecoescultura.cl\'s reliable `dayIso` shorthand (`<time class="summary-metadata-item summary-metadata-item--date" datetime="2026-08-05">5 de agosto de 2026</time>`) — but cross-checking against the exhibition\'s own detail page proved it\'s the Squarespace BLOG POST\'s publish timestamp, not the inauguración date: "Magdalena Correa | KOS" listed `datetime="2026-08-05"`, while its own detail page states in real prose "La inauguración se realizará el jueves 13 de agosto a las 18:30 horas" — 8 days later. Had this been trusted as `dayIso`, every exhibition on this source would have shipped a systematically wrong date. No daysRegex/dateRangeExtractor set at all — Haiku sees no listing-level date signal (deliberately; exposing the misleading timestamp risked Haiku confidently confirming the WRONG date itself, which would then skip enrichCandidates\' own openingTimeExtractor recovery entirely, since that only runs when `!c.openingTimeConfirmed`).\n\n**Also tried and reverted: openingTimeExtractor for the detail page\'s real "inaugurará ... el [weekday] DD de MES a las HH:MM horas" sentence.** The pattern itself works (verified against 2 real pages) and correctly resolves the CURRENT exhibition\'s year via inferYear. But this source\'s items run on a roughly monthly cadence, and testing an OLDER, already-closed item (a March opening, tested against an August reference date — the realistic shape of the FIRST run, which curates every item on the page at once regardless of age) showed inferYear\'s 60-day-past tolerance rolling it forward a full YEAR, to 2027 — turning a genuinely past, closed exhibition into what looks like a real upcoming one. That\'s a worse failure than galeriapready.cl\'s own inferYear finding (a real quote silently landing on the wrong year for a still-open show): here it risked fabricating an entirely fake future event on the live site. Reverted — no openingTimeExtractor at all; the real "inaugurará..." sentence still reaches Haiku via descriptionExtractor below, so the date isn\'t lost, just no longer resolved by code with a mechanism proven unsafe for this source\'s exhibition-run cadence.\n\nDescription: the detail page\'s real prose is split across MULTIPLE Squarespace text blocks interleaved with image blocks (a short title-header block first, THEN the block containing the real "inauguración..." sentence, THEN more prose) — no single clean div wraps just "the description". Captured from the first `data-sqsp-text-block-content` marker through to `BlogItem-share` (a stable end-of-article marker, confirmed present on every sampled page) instead, sweeping in every interleaved block; image tags contribute no stray text once stripped, so this is safe and gives Haiku the real inauguración sentence for grounding. Same known, unfixed limitation as galeriapready.cl: also includes the artist\'s full bio, not just the exhibition write-up.',
    lastReviewedAt: "2026-08-10",
    extractor: {
      kind: "articleList",
      blockRegex: /(<a\s+href="(\/exhibiciones[^"]+)"\s+class="\s*summary-thumbnail-container[\s\S]*?<\/a>)/g,
      titleLinkRegex: /href="([^"]+)"[\s\S]*?data-title="([^"]*)"/,
    },
    fixedLocation: { location: "Vitacura", placeName: "Aninat Galería" },
    descriptionExtractor: {
      pattern: /data-sqsp-text-block-content>([\s\S]*?)BlogItem-share/,
    },
  },
  {
    url: "https://www.estacionmapocho.cl/?page_id=16",
    note: 'Centro Cultural Estación Mapocho, Santiago — evaluated at the user\'s request 2026-08-10. Custom WordPress theme, a dedicated "Artes Visuales" listing (not a mixed cultura category — good density: 5/6 sampled items were real exhibitions, only 1 a workshop, which Haiku\'s own scope judgment should catch on its own merits like any other real-but-out-of-scope candidate). Only page 1 of the listing\'s pagination (7 pages total) is fetched — deliberately NOT walking all 7 pages the way artes.uchile.cl\'s additionalPages does: items are already roughly chronological, and page 1 alone covers 6 months of real shows (Jan-Jun 2026 at eval time), matching this project\'s posture against pulling in a full historical archive when a source\'s own default ordering already surfaces what\'s current.\n\nListing gives a real title, image, and a coarse `MM/YYYY` date field (e.g. "03/2026", captured via daysRegex) — cross-checked against 2 real detail pages and confirmed to be a genuine editorially-set "month this exhibition happens" field (not a CMS/blog-publish-date trap like aninatgaleria.org\'s own `<time>` turned out to be): "Sueños" listed 03/2026, its detail page opens "En marzo, el Centro Cultural Estación Mapocho recibe...— Del 12 de marzo al 24 de mayo"; "Kadogo..." listed 01/2026, detail page confirms a January-into-March run ("hasta el 8 de marzo"). Left as rawDateText only (no dateRangeExtractor) — a month alone can\'t build a real day-precision ISO date without fabricating a day.\n\n**No openingTimeExtractor/detailDateRangeExtractor**: sampled 4 real detail pages, found no "Inauguración: <fecha> <hora>" phrasing on any of them (consistent with a real Tavily-discovered candidate from this same domain, curated earlier the same day via the regular per-comuna path — "Tiempo entre puntadas" — which Haiku itself noted had "inauguración el 8 de agosto sin hora exacta"). The real day-level date text DOES exist on the detail page (next to a calendar icon, `<div class="w90">`), but its phrasing is genuinely inconsistent across items — a full "Del D de MES al D de MES" range for one exhibition, just "hasta el D de MES" (no start at all) for another — the same class of cross-item inconsistency that ruled out a rigid dateRangeExtractor for galeriapready.cl and an openingTimeExtractor for aninatgaleria.org. Rather than risk a pattern that silently mishandles whichever shape it wasn\'t built against, that real day-level text is folded into descriptionExtractor below instead, so Haiku still sees and can ground a quote from it — interpretation, not extraction, handles the shape variance.\n\nDescription: captured from the calendar-icon row through the end of the real prose block (`<div class="w40">`, confirmed to hold ONLY the curatorial write-up — no nested divs, no artist-bio bleed the way galeriapready.cl/aninatgaleria.org both have). Real, harmless noise: the page duplicates this same location/date/hours block for a mobile layout variant, so the captured text repeats "Del 12 de marzo al 24 de mayo"-style fragments twice — not a bug, doesn\'t affect grounding (a real quote still matches; Haiku isn\'t confused by the same true fact stated twice).',
    lastReviewedAt: "2026-08-10",
    extractor: {
      kind: "articleList",
      blockRegex: /(<div class="eventosPosts">[\s\S]*?<\/a>\s*<\/div>)/g,
      titleLinkRegex: /<a href="([^"]+)">[\s\S]*?<h2>([^<]*)<\/h2>/,
      daysRegex: /bi-calendar4-week[\s\S]*?w90"><p>([^<]*)<\/p>/,
    },
    fixedLocation: { location: "Santiago", placeName: "Centro Cultural Estación Mapocho" },
    descriptionExtractor: {
      pattern: /(bi-calendar4-week[\s\S]*?<div class="w40">[\s\S]*?<\/div>)/,
    },
  },
  {
    url: "https://factoriasantarosa.cl/exposiciones",
    note: 'Factoría Santa Rosa, Santiago — evaluated at the user\'s request 2026-08-10. WordPress + Elementor + JetEngine (a common combo for CMS-driven listing grids) — a genuinely clean, fully-structured source, unlike the three sources added earlier the same session (galeriapready.cl, aninatgaleria.org, estacionmapocho.cl), all of which had to leave date interpretation to Haiku after finding real inconsistencies. This one has NEITHER problem: the listing itself has zero date info at all (title/image/link only — nothing to mistake for a real date), and the detail page\'s date fields are fully structured, machine-readable, and consistent across every sampled item (4 real detail pages checked, including one — "diga-queer-con-la-lengua-afuera" — with a genuinely empty end-date field, which the extractor correctly returns null for rather than guessing).\n\nListing markup: two adjacent JetEngine widgets share the same href — `<a href="/exposiciones/slug" class="jet-listing-dynamic-image__link"><img src="..."></a>` immediately followed by `<a href="/exposiciones/slug" class="jet-listing-dynamic-link__link"><span class="jet-listing-dynamic-link__label">TITLE</span></a>` — captured as one block spanning both, same "single anchor pair, same href" shape as aninatgaleria.org\'s own listing. All 26 items live on one page (no pagination) — NOT chronologically ordered (a 2024 exhibition appeared near the top, ahead of a 2025 one), so every item gets curated on the first run; acceptable at this size (unlike galeriapready.cl\'s ~67-item, 9-tab archive).\n\n**Real, fully deterministic date recovery** (`detailDateRangeExtractor`, matching mssa.cl\'s own precedent): the detail page has explicit "Inicio"/"Termino" labels next to `<div class="jet-listing-dynamic-field__content">DD-MM-YYYY</div>` values. Deliberately does NOT anchor on the "Inicio" label text itself — the site\'s own nav menu also contains a link literally labeled "Inicio" ("Home" in Spanish), which a naive label-anchored regex matched first, on the wrong occurrence, in real testing. Anchors on two CONSECUTIVE `jet-listing-dynamic-field__content` values matching the `DD-MM-YYYY` shape instead — safe because the description field (recovered separately, see below) also uses this exact CSS class but never starts with a bare date-shaped string (it opens with a `<p>` tag), so there\'s no risk of the date pattern accidentally matching into the description or vice versa.\n\nDescription: recovered from the SAME `jet-listing-dynamic-field__content` class, disambiguated from the date fields by anchoring on the "Descripción" heading that precedes it (`<h5>...Descripción</h5>`) — real prose, cleanly bounded (closes at its own `</div></div></div>`, no bio-bleed the way galeriapready.cl/aninatgaleria.org both have).',
    lastReviewedAt: "2026-08-10",
    extractor: {
      kind: "articleList",
      blockRegex:
        /(<a href="(https:\/\/factoriasantarosa\.cl\/exposiciones\/[^"]+)" class="jet-listing-dynamic-image__link">[\s\S]*?jet-listing-dynamic-link__label">[^<]*<\/span>\s*<\/a>)/g,
      titleLinkRegex: /<a href="([^"]+)"[\s\S]*?jet-listing-dynamic-link__label">([^<]*)<\/span>/,
    },
    fixedLocation: { location: "Santiago", placeName: "Factoría Santa Rosa" },
    detailDateRangeExtractor: {
      pattern:
        /jet-listing-dynamic-field__content"\s*>(?<startDay>\d{1,2})-(?<startMonth>\d{1,2})-(?<startYear>\d{4})<[\s\S]*?jet-listing-dynamic-field__content"\s*>(?<endDay>\d{1,2})-(?<endMonth>\d{1,2})-(?<endYear>\d{4})</,
    },
    descriptionExtractor: {
      pattern: /Descripción<\/h5>[\s\S]*?jet-listing-dynamic-field__content"\s*>([\s\S]*?)<\/div><\/div><\/div>/,
    },
  },
  {
    url: "https://centex.cultura.gob.cl/category/muestras-y-exposiciones/",
    note: 'Centex, Valparaíso — Ministerio de las Culturas, evaluated at the user\'s request 2026-08-10 (same WordPress theme family as centronacionaldearte.cultura.gob.cl / CNAC, added 2026-07-28 — see that entry\'s own note). Added despite a real, flagged density concern: of 12 sampled posts in this category, only ~7-8 were genuine exhibition announcements/recaps — the rest were coverage of Feria Sobreimpresiones (a graphic-arts FAIR, not an exhibition), a Feria de Artes y Oficios (crafts fair), an interview about that fair, and a recap of a school group visiting an already-covered exhibition. User confirmed "agrega" after reviewing this density finding — Haiku\'s own scope judgment is relied on to filter the fair/interview/recap noise, same posture as any other source with imperfect density.\n\nListing markup: `<a class="b2" href="...">` wraps an image plus `<div class="info"><span class="b2fecha">DATE</span>TITLE</div>` — captured as one block. No dateRangeExtractor: `b2fecha` is confirmed to be the post\'s PUBLISH date, not the exhibition\'s own date (same trap as aninatgaleria.org\'s `<time>` — cross-checked directly: "Centex inaugura exposición póstuma de Juan Castillo" listed `7 julio, 2026`/`5 julio, 2026`-style publish text while its detail page states the real opening as "sábado 11 de julio" — days later, for the same post).\n\n**No openingTimeExtractor either — a fourth same-session confirmation of the inconsistent-phrasing pattern**: the Juan Castillo detail page has a clean `*Inauguración: sábado 11 de julio, 12:00 horas` line, but a second sampled page ("ParvuArt Gallery") has an entirely different shape with no "Inauguración" label at all — `"Desde este martes 4 y hasta el domingo 9 de agosto permanecerá abierta..."`. Same class of per-item inconsistency already found for galeriapready.cl/aninatgaleria.org/estacionmapocho.cl this session — left to Haiku+grounding via descriptionExtractor instead of a regex tuned to only the first shape sampled.\n\nDescription: the real article body (`<div class="container single-content fitvids">`) is NOT safely boundable by a simple "first closing </div>" rule — real testing found genuinely nested `<div>` blocks inside the prose itself (embedded `wp-block-media-text` image-with-caption blocks mid-article), so a naive bound would cut the real content off far too early. Properly closing this div requires actual nesting-depth tracking, which a single regex can\'t do — bounded instead on the reliable `</main>` tag that closes the whole content area on every sampled page, confirmed (via the same nesting-depth check, done manually) to land at exactly the same real end-of-article point without ever sweeping into the site-wide footer/address block that sits just outside `</main>`.',
    lastReviewedAt: "2026-08-10",
    extractor: {
      kind: "articleList",
      blockRegex: /(<a class="b2" href="([^"]+)">[\s\S]*?<\/a>)/g,
      titleLinkRegex: /href="([^"]+)"[\s\S]*?<\/span>([^<]*)<\/div>/,
    },
    fixedLocation: { location: "Valparaíso", placeName: "Centex" },
    descriptionExtractor: {
      pattern: /single-content fitvids">([\s\S]*?)<\/main>/,
    },
  },
  {
    url: "https://www.museoschile.gob.cl/cartelera/red-nacional",
    note: 'Red Nacional de Museos (Ministerio de las Culturas) — evaluated at the user\'s request 2026-08-10. A national aggregator spanning many individual SNPC/Drupal-platform museum sites (the SAME underlying CMS/template already known from mnba.gob.cl, museoregionalaysen.gob.cl, museodeancud.gob.cl) — but this specific "Red Nacional" view mixes disciplines: natural history, zoology, anthropology, and general archives alongside actual visual-art exhibitions, since it aggregates ALL museums in the national network, not just art ones.\n\n**Real, deterministic scope filter, not left to Haiku**: each item carries its own genuine, structured `field--name-field-tematica` tag ("Ciencia", "Zoología", "Antropología", "Ciencias Naturales", "Archivos", "Artes visuales", "Exposición" — 7 distinct values sampled, 4 of 10 sampled items "Artes visuales"/"Exposición"). blockRegex requires the tematica to be "Artes visuales" or the generic "Exposición" via a positive lookahead (same technique as dieecke.art\'s country-scope filter) — a real "Micromundos, ciencia y arte en tus manos" (tagged "Ciencia") and "Mariposas y Polillas, Colores en Movimiento" (tagged "Zoología") were both correctly excluded before ever reaching Haiku, rather than trusting its own scope judgment to catch obviously-out-of-discipline content downstream.\n\n**Real bug found and fixed building this filter**: the first version\'s lookahead, `(?=[\\s\\S]*?field--name-field-tematica">...)`, scans forward UNBOUNDED — it found a match if "Artes visuales"/"Exposición" appeared ANYWHERE later in the entire remaining document, including inside a completely different, LATER item\'s own block, not just the current one. Against the real page this barely filtered anything (an early Ciencia/Zoología item still passed as long as some later item in the feed happened to be real art). Fixed by bounding the lookahead to stop at the next `<div class="views-row">` — `(?=(?:(?!<div class="views-row">)[\\s\\S])*?field--name-field-tematica">...)` — so it only matches tematica text belonging to the CURRENT item.\n\n**Real, fully deterministic date range** — the cleanest of any source added this session: `<time>DD/MesCompleto/YYYY</time> hasta el <time>DD/MesCompleto/YYYY</time>`, full Spanish month names (first 3 letters resolve via the existing ES_MONTH_ABBR table), always both start and end present, consistent across every sampled item — no inconsistent-phrasing problem here at all, unlike galeriapready.cl/aninatgaleria.org/estacionmapocho.cl/centex.cultura.gob.cl earlier the same session.\n\nNo `fixedLocation` — a genuine multi-institution, multi-comuna aggregator (Valparaíso, Santiago, ...), same posture as arteinformado.com/chilecultura.gob.cl. Each item does carry a real per-item address (`field--name-field-direccion`, e.g. "Condell 1546, Valparaíso, Chile."), captured via `placeRegex` as real, grounded text for Haiku\'s own comuna judgment — not fabricated, just not deterministically parsed into a canonical comuna here.\n\n**Known overlap, not a bug**: Museo Nacional de Bellas Artes items (e.g. "Roberto Matta. Abrir la mirada") appear both here AND via the existing dedicated mnba.gob.cl source — same real sourceUrl on both, so the existing cross-run dedup (title/sourceUrl/location-date matching, run.ts) collapses them into one row, no duplicate risk. The real incremental value of this source is the OTHER institutions it surfaces that don\'t have their own dedicated entry yet (confirmed here: Biblioteca Nacional).\n\nNo descriptionExtractor: the listing itself already gives title + full real date range + real address, a reasonably strong basis for curation on its own; a shared detail-page description container wasn\'t found consistently across the different institutions\' own sites in the time spent looking (unlike mnba.gob.cl\'s own dedicated entry, whose one single site\'s `text-long` container is already confirmed).\n\nOnly the first page (`?page=0`, Drupal\'s standard zero-indexed pager) is fetched — 10 items on the sampled page, no additionalPages configured, matching this project\'s posture against unbounded pagination when the first page already surfaces genuinely current content.',
    lastReviewedAt: "2026-08-10",
    extractor: {
      kind: "articleList",
      blockRegex:
        /<div class="views-row">(?=(?:(?!<div class="views-row">)[\s\S])*?field--name-field-tematica">(?:Artes visuales|Exposición)<)([\s\S]*?)(?=<div class="views-row">|$)/g,
      titleLinkRegex: /<h2 class="destacado__title"><a href="([^"]+)">([^<]*)<\/a><\/h2>/,
      placeRegex: /field--name-field-direccion">\s*([^<]*?)\s*<\/div>/,
      dateRangeExtractor: {
        pattern:
          /<time>(?<startDay>\d{1,2})\/(?<startMonth>[a-zé]{3})[a-zé]*\/(?<startYear>\d{4})<\/time>\s*hasta el\s*<time>(?<endDay>\d{1,2})\/(?<endMonth>[a-zé]{3})[a-zé]*\/(?<endYear>\d{4})<\/time>/i,
      },
    },
  },
];

export function knownSourceDomain(url: string): string {
  return new URL(url).hostname;
}

// Used by lib/page-fetch.ts's enrichCandidates to decide, per candidate,
// whether its sourceUrl's domain is opted in to opening-time enrichment.
export function findOpeningTimeConfig(sourceUrl: string): OpeningTimeConfig | null {
  let domain: string;
  try {
    domain = knownSourceDomain(sourceUrl);
  } catch {
    return null; // unparseable URL — not our problem here
  }
  return KNOWN_SOURCES.find((s) => s.openingTimeExtractor && knownSourceDomain(s.url) === domain)?.openingTimeExtractor ?? null;
}

// Used by lib/page-fetch.ts's enrichCandidates to decide, per candidate,
// whether its sourceUrl's domain is opted in to description recovery.
export function findDescriptionConfig(sourceUrl: string): DescriptionConfig | null {
  let domain: string;
  try {
    domain = knownSourceDomain(sourceUrl);
  } catch {
    return null;
  }
  return KNOWN_SOURCES.find((s) => s.descriptionExtractor && knownSourceDomain(s.url) === domain)?.descriptionExtractor ?? null;
}

// Used by lib/page-fetch.ts's enrichCandidates to decide, per candidate,
// whether its sourceUrl's domain is opted in to deterministic comuna
// recovery (real aggregator sources only — see locationExtractor's own
// doc comment on KnownSource).
export function findLocationConfig(sourceUrl: string): DescriptionConfig | null {
  let domain: string;
  try {
    domain = knownSourceDomain(sourceUrl);
  } catch {
    return null;
  }
  return KNOWN_SOURCES.find((s) => s.locationExtractor && knownSourceDomain(s.url) === domain)?.locationExtractor ?? null;
}

// Used by lib/page-fetch.ts's enrichBrightSourceItemDetails to decide,
// per item, whether its sourceUrl's domain is opted in to pre-curation
// runStartDate/runEndDate recovery from the detail page.
export function findDetailDateRangeConfig(sourceUrl: string): DateRangeConfig | null {
  let domain: string;
  try {
    domain = knownSourceDomain(sourceUrl);
  } catch {
    return null;
  }
  return KNOWN_SOURCES.find((s) => s.detailDateRangeExtractor && knownSourceDomain(s.url) === domain)?.detailDateRangeExtractor ?? null;
}

// Used by run.ts's duplicate-replacement logic (2026-07-28): when a new
// candidate and an already-stored event turn out to be the same real
// exhibition (per the location+date/title dedup fingerprint) and neither
// has a confirmed opening date+time to break the tie, the venue's own
// site should win over an aggregator that merely re-lists it — a real
// case (MSSA vs. chilecultura.gob.cl) showed the national aggregator can
// carry a stale run_end_date the museum's own page has already corrected.
// Reuses `fixedLocation`'s absence as the aggregator signal rather than a
// new dedicated field — every KNOWN_SOURCES entry without one today
// (artes.uchile.cl, uchile.cl root, arteinformado.com, mallecoescultura.cl,
// chilecultura.gob.cl) is already documented as a genuine multi-venue
// aggregator, and every one WITH `fixedLocation` is a single venue's own
// site — a real multi-venue "original" source (e.g. a gallery network
// posting its own events across several sedes, no fixedLocation but still
// the primary source) doesn't exist in KNOWN_SOURCES yet; revisit this
// function if one ever gets added. A sourceUrl that doesn't match any
// known source at all (e.g. a Tavily-discovered social media post) is
// treated as NOT an aggregator — it's a primary post, not a re-listing.
export function isAggregatorSource(sourceUrl: string): boolean {
  let domain: string;
  try {
    domain = knownSourceDomain(sourceUrl);
  } catch {
    return false;
  }
  const match = KNOWN_SOURCES.find((s) => knownSourceDomain(s.url) === domain);
  return match !== undefined && !match.fixedLocation;
}
