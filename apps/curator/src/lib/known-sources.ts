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
