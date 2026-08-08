import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractArticleList,
  extractDateRange,
  extractImgTags,
  extractWordpressItems,
  filterKnownSourceImages,
  type ArticleListConfig,
  type DateRangeConfig,
  type WordpressRestConfig,
} from "./extractors.js";

test("extractImgTags pulls src/alt pairs and treats empty alt as null", () => {
  const html = `<div><img src="/a.jpg" alt="obra"> <img src="/b.jpg" alt=""> <img alt="no src"></div>`;
  const images = extractImgTags(html);
  assert.deepEqual(images, [
    { url: "/a.jpg", description: "obra" },
    { url: "/b.jpg", description: null },
  ]);
});

test("extractImgTags decodes HTML entities in src (e.g. Drupal's correctly-escaped '&amp;' in image-style query strings)", () => {
  const html = `<img src="/img.jpg?h=abc123&amp;itok=xyz789" alt="foto">`;
  assert.deepEqual(extractImgTags(html), [{ url: "/img.jpg?h=abc123&itok=xyz789", description: "foto" }]);
});

// Real bug, found 2026-07-27 adding mallecoescultura.cl: `src` holds a tiny
// base64 placeholder for lazy-loaded images ("lazyload" class), the real
// URL only lives in `data-src`. Preferring `src` unconditionally would
// have stored the base64 placeholder itself as imageUrl.
test("extractImgTags prefers data-src over src when both are present (lazy-load pattern)", () => {
  const html = `<img src="data:image/png;base64,tinyplaceholder==" data-src="/site/real-photo.jpg" alt="Exposición">`;
  assert.deepEqual(extractImgTags(html), [{ url: "/site/real-photo.jpg", description: "Exposición" }]);
});

test("extractImgTags falls back to src when there's no data-src (every other source, unaffected)", () => {
  const html = `<img src="/real.jpg" alt="obra">`;
  assert.deepEqual(extractImgTags(html), [{ url: "/real.jpg", description: "obra" }]);
});

// Real gap, found 2026-08-08 adding cclm.cl: its thumbnail is a CSS
// background-image on a <figure>, not an <img> tag at all.
test("extractImgTags also detects a CSS background-image:url() when there's no <img> tag at all (cclm.cl-style)", () => {
  const html = `<figure class="module--asymmetric__figure" style="background-image:url(https://cdn.cclm.cl/photo.jpg);"></figure>`;
  assert.deepEqual(extractImgTags(html), [{ url: "https://cdn.cclm.cl/photo.jpg", description: null }]);
});

test("extractImgTags: real <img> tags always come before background-image fallbacks, regardless of their actual position in the markup", () => {
  const html = `<div style="background-image:url(/bg.jpg);"></div><img src="/real.jpg" alt="obra">`;
  assert.deepEqual(extractImgTags(html), [
    { url: "/real.jpg", description: "obra" },
    { url: "/bg.jpg", description: null },
  ]);
});

test("extractImgTags handles a single-quoted background-image url() form, not just the unquoted one cclm.cl uses", () => {
  const html = `<div style="background-image:url('/single.jpg');"></div>`;
  assert.deepEqual(extractImgTags(html), [{ url: "/single.jpg", description: null }]);
});

test("filterKnownSourceImages resolves relative URLs, drops chrome, nulls 'vacio' alts", () => {
  const images = [
    { url: " /dam/expo-prev.jpg", description: "vacio" },
    { url: "/logos/site-logo.png", description: "Universidad" },
    { url: "https://cdn.cl/real.jpg", description: "afiche" },
    { url: "https://cdn.cl/real.jpg", description: "duplicada" },
  ];
  const out = filterKnownSourceImages(images, "https://artes.uchile.cl/agenda/30dias/6");
  assert.deepEqual(out, [
    { url: "https://artes.uchile.cl/dam/expo-prev.jpg", description: null },
    { url: "https://cdn.cl/real.jpg", description: "afiche" },
  ]);
});

// Matches artes.uchile.cl's real markup — the same config known-sources.ts
// gives uchile in production.
const UCHILE_CONFIG: ArticleListConfig = {
  kind: "articleList",
  blockRegex: /<article class="mod-cal-result__item">([\s\S]*?)<\/article>/g,
  titleLinkRegex: /<h4 class="mod__item-title"><a href="([^"]+)">([^<]*)<\/a><\/h4>/,
  daysRegex: /class="mod-cal-result__item-days"[^>]*>([\s\S]*?)<\/p>/,
  placeRegex: /class="mod-cal-result__item-place[a-z]*"[^>]*>([\s\S]*?)<\/p>/,
};

test("extractArticleList pairs each event with its own structured title/link/image/date/place, handling the item-place/item-placer typo", () => {
  const html = `
    <article class="mod-cal-result__item">
      <figure><img src="/dam/uno.jpg" alt="Imagen 1"></figure>
      <h4 class="mod__item-title"><a href="/agenda/evento-uno">Muestra Uno</a></h4>
      <p class="mod-cal-result__item-days">Del 1 al 20 de julio</p>
      <p class="mod-cal-result__item-place">Sala Juan Egenau</p>
    </article>
    <article class="mod-cal-result__item">
      <figure><img src="/dam/dos.jpg" alt="Imagen 2"></figure>
      <h4 class="mod__item-title"><a href="/agenda/evento-dos">Muestra Dos</a></h4>
      <p class="mod-cal-result__item-days">Del 5 al 30 de julio</p>
      <p class="mod-cal-result__item-placer">Galería Central</p>
    </article>
  `;

  const items = extractArticleList(html, "https://artes.uchile.cl/agenda/30dias/6", UCHILE_CONFIG);
  assert.ok(items);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    title: "Muestra Uno",
    sourceUrl: "https://artes.uchile.cl/agenda/evento-uno",
    imageUrl: "https://artes.uchile.cl/dam/uno.jpg",
    description: null,
    locationHint: "Sala Juan Egenau",
    rawDateText: "Del 1 al 20 de julio",
    structuredStartDate: null,
    structuredEndDate: null,
    location: null,
    placeName: null,
  });
  assert.deepEqual(items[1], {
    title: "Muestra Dos",
    sourceUrl: "https://artes.uchile.cl/agenda/evento-dos",
    imageUrl: "https://artes.uchile.cl/dam/dos.jpg",
    description: null,
    locationHint: "Galería Central",
    rawDateText: "Del 5 al 30 de julio",
    structuredStartDate: null,
    structuredEndDate: null,
    location: null,
    placeName: null,
  });
});

// Real bug, found 2026-07-27 adding museoregionalaysen.gob.cl: its listing
// wraps quoted event names in literal &quot; entities (e.g. `Exposición
// temporal &quot;Visiones de Aysén&quot;`) — extractImgTags already decoded
// entities in image URLs (mnba.gob.cl's own &amp; bug, found earlier), but
// the title never went through the same decode, so it would have shipped
// literal &quot; on the calendar for any source whose markup does this.
test("extractArticleList decodes HTML entities in the title, same as it already does for image URLs", () => {
  const html = `
    <article class="mod-cal-result__item">
      <h4 class="mod__item-title"><a href="/agenda/evento-uno">Exposición temporal &quot;Visiones de Aysén&quot;</a></h4>
    </article>
  `;
  const items = extractArticleList(html, "https://artes.uchile.cl/agenda/30dias/6", UCHILE_CONFIG);
  assert.ok(items);
  assert.equal(items[0].title, 'Exposición temporal "Visiones de Aysén"');
});

// Real gap, found 2026-08-08 adding dieecke.art: this function's decoder
// only ever covered a handful of NAMED entities — a numeric reference
// (dieecke.art's titles use "&#8211;" for an en dash) passed through
// undecoded. lib/description-extract.ts already had this exact fix
// (2026-07-28, centronacionaldearte.cultura.gob.cl) but it was never
// backported to this sibling copy.
test("extractArticleList decodes numeric HTML entity references in the title, both decimal and hex forms", () => {
  const html = `
    <article class="mod-cal-result__item">
      <h4 class="mod__item-title"><a href="/agenda/evento-dos">COPELLO &#8211; 1993 &#x2014; retrospectiva</a></h4>
    </article>
  `;
  const items = extractArticleList(html, "https://artes.uchile.cl/agenda/30dias/6", UCHILE_CONFIG);
  assert.ok(items);
  assert.equal(items[0].title, "COPELLO – 1993 — retrospectiva");
});

test("extractArticleList falls back to placeholder date text when days/place are missing, but skips a block with no title link", () => {
  const html = `
    <article class="mod-cal-result__item">
      <h4 class="mod__item-title"><a href="/agenda/evento-tres">Muestra Tres</a></h4>
    </article>
    <article class="mod-cal-result__item">
      <p class="mod-cal-result__item-days">Todo julio</p>
    </article>
  `;

  const items = extractArticleList(html, "https://artes.uchile.cl/agenda/30dias/6", UCHILE_CONFIG);
  assert.ok(items);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Muestra Tres");
  assert.equal(items[0].sourceUrl, "https://artes.uchile.cl/agenda/evento-tres");
  assert.equal(items[0].rawDateText, "fecha no indicada");
  assert.equal(items[0].locationHint, null);
});

// 2026-07-24: unlike every other articleList source, molinomachmar.cl's
// LISTING page already carries real description prose per event —
// captured via the optional descriptionRegex, no separate detail-page
// fetch needed (unlike the other 4 sources, which use
// known-sources.ts's descriptionExtractor + page-fetch.ts instead).
test("extractArticleList captures description directly from the listing page when descriptionRegex is configured (molinomachmar.cl-style)", () => {
  const configWithDescription: ArticleListConfig = {
    ...UCHILE_CONFIG,
    descriptionRegex: /<p class="desc">([\s\S]*?)<\/p>/,
  };
  const html = `
    <article class="mod-cal-result__item">
      <h4 class="mod__item-title"><a href="/agenda/evento-uno">Muestra Uno</a></h4>
      <p class="desc">Una muestra real con <strong>texto</strong> descriptivo.</p>
    </article>
  `;

  const items = extractArticleList(html, "https://artes.uchile.cl/agenda/30dias/6", configWithDescription);
  assert.ok(items);
  assert.equal(items[0].description, "Una muestra real con texto descriptivo.");
});

test("extractArticleList leaves description null when descriptionRegex is not configured (the common case)", () => {
  const html = `
    <article class="mod-cal-result__item">
      <h4 class="mod__item-title"><a href="/agenda/evento-uno">Muestra Uno</a></h4>
    </article>
  `;
  const items = extractArticleList(html, "https://artes.uchile.cl/agenda/30dias/6", UCHILE_CONFIG);
  assert.ok(items);
  assert.equal(items[0].description, null);
});

test("extractArticleList returns null when the page has no matching blocks (fallback signal)", () => {
  assert.equal(extractArticleList("<div>algo distinto</div>", "https://otra.cl", UCHILE_CONFIG), null);
});

test("extractArticleList is genuinely config-driven: a different site's markup works with only a different config, no code change", () => {
  // A hypothetical second html bright source with completely different
  // class names/tag structure — proves this isn't uchile-specific code
  // with the site name changed.
  const otherSiteConfig: ArticleListConfig = {
    kind: "articleList",
    blockRegex: /<li class="event-card">([\s\S]*?)<\/li>/g,
    titleLinkRegex: /<a class="event-card__link" href="([^"]+)">([^<]*)<\/a>/,
    placeRegex: /<span class="venue">([\s\S]*?)<\/span>/,
    // no daysRegex configured for this site — must still work (optional field).
  };
  const html = `<ul><li class="event-card"><a class="event-card__link" href="/e/1">Otra Muestra</a><span class="venue">MAVI</span></li></ul>`;
  const items = extractArticleList(html, "https://otro-sitio.cl/agenda", otherSiteConfig);
  assert.ok(items);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Otra Muestra");
  assert.equal(items[0].sourceUrl, "https://otro-sitio.cl/e/1");
  assert.equal(items[0].locationHint, "MAVI");
  assert.equal(items[0].rawDateText, "fecha no indicada");
});

// Matches cclm.cl's real markup — the same config known-sources.ts gives
// it in production (added 2026-08-08). Two real structural quirks in one
// fixture: the title <h3>/<a> markup has two variants (adjacent vs. split
// across lines — real alternating left/right layout), and the thumbnail is
// a CSS background-image on a sibling <figure>, not an <img> tag.
const CCLM_CONFIG: ArticleListConfig = {
  kind: "articleList",
  blockRegex:
    /<div class="module--asymmetric(?: right)?"[^>]*>([\s\S]*?)(?=<div class="module--asymmetric(?: right)?"[^>]*>|<article class="box )/g,
  titleLinkRegex: /<h3 class="module--asymmetric__title">\s*<a href="([^"]+)"[^>]*>\s*([^<]*?)\s*<\/a>\s*<\/h3>/,
  daysRegex: /class="calendar">([^<]+)<\/span>/,
  dateRangeExtractor: {
    pattern:
      /(?<startMonth>[a-zé]{3})[a-zé]*\s+(?<startDay>\d{1,2})\s+(?:\/|-|a)\s+(?<endMonth>[a-zé]{3})[a-zé]*\s+(?<endDay>\d{1,2}),?\s*(?<year>\d{4})/i,
  },
};

// Real bug found 2026-08-08 building this against the live site: the
// FIRST version of this terminator guessed "<section class=\"section--
// partners\">", which never actually appears on the real page — with no
// real terminator, the last module--asymmetric block's non-greedy match
// silently swallowed the entire rest of the page (including cclm.cl's
// trailing undated "Cine en Chile"/"Viajes en papel" thematic grid,
// `<article class="box ...">` cards) into ITS OWN block content, so that
// last real exhibition still extracted correctly (titleLinkRegex only
// takes the first match per block) but any exhibition-shaped block after
// it — impossible on this specific page, but a real risk on principle —
// would've been silently dropped. Fixed with the real terminator
// (`<article class="box `, confirmed against the live page: the point
// where the asymmetric list ends and the thematic grid begins). This
// fixture's 3rd block reproduces that exact shape to guard against
// regressing back to the guessed terminator.
test("extractArticleList handles cclm.cl's real markup: both title-link variants, the background-image thumbnail, the date range, and correctly bounds the LAST dated block against the trailing undated thematic grid", () => {
  const html = `
    <div class="module--asymmetric right" data-equalize="target">
      <figure class="module--asymmetric__figure" style="background-image:url(https://cdn.cclm.cl/tus-fantasmas.jpg);"></figure>
      <article class="module--asymmetric__content">
        <h3 class="module--asymmetric__title"><a href="https://www.cclm.cl/exposicion/tus-fantasmas-son-mios/" title="Ir a">Tus fantasmas son míos</a></h3>
        <span class="module--asymmetric__date"><span class="calendar">Agosto 05 / Octubre 11, 2026</span></span>
      </article>
    </div>
    <div class="module--asymmetric" data-equalize="target">
      <figure class="module--asymmetric__figure" style="background-image:url(https://cdn.cclm.cl/vivir-archivo.jpg);"></figure>
      <article class="module--asymmetric__content">
        <h3 class="module--asymmetric__title">
          <a href="https://www.cclm.cl/exposicion/vivir-el-archivo/" title="Ir a">
            VIVIR EL ARCHIVO
          </a>
        </h3>
        <span class="module--asymmetric__date"><span class="calendar">Junio 19 - Nov 01, 2026</span></span>
      </article>
    </div>
    <article class="box box--cineteca">
      <h3 class="box__title"><a href="https://www.cclm.cl/exposicion/cine-en-chile/" title="Ir a">Cine en Chile</a></h3>
    </article>
  `;
  const items = extractArticleList(html, "https://www.cclm.cl/exposiciones/", CCLM_CONFIG);
  assert.ok(items);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Tus fantasmas son míos");
  assert.equal(items[0].imageUrl, "https://cdn.cclm.cl/tus-fantasmas.jpg");
  assert.deepEqual({ start: items[0].structuredStartDate, end: items[0].structuredEndDate }, { start: "2026-08-05", end: "2026-10-11" });
  assert.equal(items[1].title, "VIVIR EL ARCHIVO");
  assert.equal(items[1].imageUrl, "https://cdn.cclm.cl/vivir-archivo.jpg");
  assert.deepEqual({ start: items[1].structuredStartDate, end: items[1].structuredEndDate }, { start: "2026-06-19", end: "2026-11-01" });
});

// Matches dieecke.art's real markup — the same config known-sources.ts
// gives it in production (added 2026-08-08).
const DIEECKE_CONFIG: ArticleListConfig = {
  kind: "articleList",
  blockRegex: /<div class="col-sm-6">(?=[\s\S]*?Sede Santiago)([\s\S]*?)(?=<div class="col-sm-6">|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>)/g,
  titleLinkRegex: /<a href="([^"]+)"[^>]*>[\s\S]*?<h2>([^<]*)<\/h2>/,
  daysRegex: /<p>[^<]*<br>([^<]+)<br>/,
  dateRangeExtractor: {
    pattern: /(?<startDay>\d{1,2})\s+de\s+(?<startMonth>[a-zé]{3})[a-zé]*\s+al\s+(?<endDay>\d{1,2})\s+de\s+(?<endMonth>[a-zé]{3})[a-zé]*\s+de\s+(?<year>\d{4})/i,
  },
};

// Real finding, 2026-08-08: Die Ecke has TWO physical locations, Santiago
// AND Barcelona — a Barcelona item must never be captured as an item at
// all (out of country scope), not left to Haiku's own judgment to catch.
// blockRegex's "Sede Santiago" lookahead is what enforces this — this
// fixture reproduces the real page's exact shape (one Santiago item, one
// Barcelona item back to back) to guard against a regression that lets a
// Barcelona exhibition slip through.
test("extractArticleList excludes a Barcelona 'Sede' item entirely and only extracts the Santiago one (dieecke.art-style, real country-scope filter)", () => {
  const html = `
    <div id="listado_exhibiciones">
      <div class="col-sm-6">
        <a href="https://dieecke.art/exhibiciones/copello-video-performances-1980-1993" title="Ir a"><div class="exhibicion" style="background-image:url(https://dieecke.art/toma.jpg)"></div><h2>COPELLO VIDEO PERFORMANCES  1980 &#8211; 1993</h2></a>
        <p>Francisco Copello<br>23 de junio al 31 de agosto de 2026<br>Sede Santiago</p>
      </div>
      <div class="col-sm-6">
        <a href="https://dieecke.art/exhibiciones/alerce" title="Ir a"><div class="exhibicion" style="background-image:url(https://dieecke.art/alerce.jpg)"></div><h2>Alerce</h2></a>
        <p>Enrique Ramírez<br>7 de noviembre al 5 de diciembre de 2023<br>Sede Barcelona</p>
      </div>
    </div>
  `;
  const items = extractArticleList(html, "https://dieecke.art/exhibiciones/", DIEECKE_CONFIG);
  assert.ok(items);
  assert.equal(items.length, 1);
  // Also confirms the real numeric-entity decoding bug fix (&#8211; -> –),
  // found building this source — extractors.ts's own decodeHtmlEntities
  // only covered a handful of named entities before this.
  assert.equal(items[0].title, "COPELLO VIDEO PERFORMANCES 1980 – 1993");
  assert.equal(items[0].imageUrl, "https://dieecke.art/toma.jpg");
  assert.deepEqual({ start: items[0].structuredStartDate, end: items[0].structuredEndDate }, { start: "2026-06-23", end: "2026-08-31" });
});

// Matches Parque Cultural Valparaíso's real WordPress meta-field names —
// the same config known-sources.ts gives it in production.
const PARQUE_CULTURAL_CONFIG: WordpressRestConfig = {
  kind: "wordpressRestApi",
  titleField: "title.rendered",
  linkField: "meta.link_al_evento",
  imageField: "meta.imagen_evento",
  descriptionField: "meta.extracto_corto",
  startDateField: "meta.fecha_de_inicio",
  endDateField: "meta.fecha_de_termino",
};

test("extractWordpressItems maps title/image/description/dates/link by configured dotted paths, resolving structured start/end dates directly", () => {
  const items = [
    {
      title: { rendered: "Expo A" },
      meta: {
        link_al_evento: "https://parquecultural.cl/expo-a",
        imagen_evento: "https://parquecultural.cl/img/a.jpg",
        extracto_corto: "Inauguración 20 de julio a las 19h.",
        fecha_de_inicio: "20260701",
        fecha_de_termino: "20260830",
      },
    },
  ];
  const result = extractWordpressItems(items, PARQUE_CULTURAL_CONFIG, "https://parquecultural.cl/agenda");
  assert.deepEqual(result, [
    {
      title: "Expo A",
      sourceUrl: "https://parquecultural.cl/expo-a",
      imageUrl: "https://parquecultural.cl/img/a.jpg",
      description: "Inauguración 20 de julio a las 19h.",
      locationHint: null,
      rawDateText: "Inauguración 20 de julio a las 19h.",
      structuredStartDate: "2026-07-01",
      structuredEndDate: "2026-08-30",
      location: null,
      placeName: null,
    },
  ]);
});

test("extractWordpressItems falls back gracefully: missing link uses fallbackUrl, missing dates are null (not a display placeholder), missing description is null", () => {
  const items = [{ title: { rendered: "Expo B" }, meta: {} }];
  const result = extractWordpressItems(items, PARQUE_CULTURAL_CONFIG, "https://parquecultural.cl/agenda");
  assert.deepEqual(result, [
    {
      title: "Expo B",
      sourceUrl: "https://parquecultural.cl/agenda",
      imageUrl: null,
      description: null,
      locationHint: null,
      rawDateText: "",
      structuredStartDate: null,
      structuredEndDate: null,
      location: null,
      placeName: null,
    },
  ]);
});

test("extractWordpressItems is genuinely config-driven: a different WordPress site's field names work with only a different config", () => {
  // A hypothetical second wordpressRestApi source using standard WP fields
  // instead of Parque Cultural's custom meta.* names — proves this isn't
  // hardcoded to one site's schema.
  const otherSiteConfig: WordpressRestConfig = {
    kind: "wordpressRestApi",
    titleField: "title.rendered",
    linkField: "link",
    imageField: "featured_image_url",
  };
  const items = [{ title: { rendered: "Otra Expo" }, link: "https://otro.cl/p/1", featured_image_url: "https://otro.cl/img.jpg" }];
  const result = extractWordpressItems(items, otherSiteConfig, "https://otro.cl/agenda");
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "Otra Expo");
  assert.equal(result[0].sourceUrl, "https://otro.cl/p/1");
  assert.equal(result[0].imageUrl, "https://otro.cl/img.jpg");
  assert.equal(result[0].structuredStartDate, null);
});

// chilecultura.gob.cl's real API shape (2026-07-28): YYYY-MM-DD dates
// (not WordPress's YYYYMMDD), per-item commune/venue_name already given
// by the API itself (locationField/placeNameField), and rich-HTML
// descriptions with named Spanish entities (á, ñ, °, – etc.) that need
// decoding to plain text before Haiku ever sees them.
const CHILECULTURA_CONFIG: WordpressRestConfig = {
  kind: "wordpressRestApi",
  titleField: "name",
  linkField: "url",
  imageField: "image",
  descriptionField: "description",
  startDateField: "start_date",
  endDateField: "end_date",
  locationField: "commune",
  placeNameField: "venue_name",
};

test("extractWordpressItems reads YYYY-MM-DD dates directly, maps location/placeName from configured fields, and decodes HTML entities in the description", () => {
  const items = [
    {
      name: "Exposición Andina",
      url: "https://chilecultura.gob.cl/evento/1",
      image: "https://chilecultura.gob.cl/img/1.jpg",
      description: "<p>Segundo piso &mdash; obras de artistas de la Regi&oacute;n, 20&deg; muestra &ndash; entrada liberada.</p>",
      start_date: "2026-08-01",
      end_date: "2026-08-30",
      commune: "Valparaíso",
      venue_name: "Parque Cultural de Valparaíso",
    },
  ];
  const result = extractWordpressItems(items, CHILECULTURA_CONFIG, "https://chilecultura.gob.cl/");
  assert.deepEqual(result, [
    {
      title: "Exposición Andina",
      sourceUrl: "https://chilecultura.gob.cl/evento/1",
      imageUrl: "https://chilecultura.gob.cl/img/1.jpg",
      description: "Segundo piso — obras de artistas de la Región, 20° muestra – entrada liberada.",
      locationHint: null,
      rawDateText: "Segundo piso — obras de artistas de la Región, 20° muestra – entrada liberada.",
      structuredStartDate: "2026-08-01",
      structuredEndDate: "2026-08-30",
      location: "Valparaíso",
      placeName: "Parque Cultural de Valparaíso",
    },
  ]);
});

test("extractWordpressItems leaves location/placeName null when locationField/placeNameField aren't configured (every existing source, unaffected)", () => {
  const items = [{ title: { rendered: "Expo C" }, meta: { link_al_evento: "https://parquecultural.cl/expo-c" } }];
  const result = extractWordpressItems(items, PARQUE_CULTURAL_CONFIG, "https://parquecultural.cl/agenda");
  assert.equal(result[0].location, null);
  assert.equal(result[0].placeName, null);
});

// --- extractDateRange: deterministic parsing of a source's own date text ---
// (2026-07-24) — real production regression: asking Haiku to interpret a
// batch of ~28 unambiguous date ranges (arteinformado.com) came back with
// runStartDate/runEndDate null for nearly every item. Each real format
// below is verified against actual live markup, not invented — see
// docs/region-discovery.md.

test("extractDateRange parses DD/MM/YYYY numeric-month ranges (uchile.cl-style)", () => {
  const config: DateRangeConfig = {
    pattern: /del\s+(?<startDay>\d{1,2})\/(?<startMonth>\d{1,2})\/(?<startYear>\d{4})\s+al\s+(?<endDay>\d{1,2})\/(?<endMonth>\d{1,2})\/(?<endYear>\d{4})/i,
  };
  const result = extractDateRange("Todos los días (excepto el lunes) del 11/07/2026 al 11/10/2026", config);
  assert.deepEqual(result, { runStartDate: "2026-07-11", runEndDate: "2026-10-11" });
});

test("extractDateRange reads an already-embedded machine-readable ISO date directly, no month parsing at all (mnba.gob.cl-style)", () => {
  const config: DateRangeConfig = {
    pattern: /<time datetime="(?<startIso>\d{4}-\d{2}-\d{2})[^"]*"[^>]*>[\s\S]*?<time datetime="(?<endIso>\d{4}-\d{2}-\d{2})[^"]*"[^>]*>/,
  };
  const html = '<time datetime="2025-07-10T12:00:00Z">10/Julio/2025</time>\n hasta el <time datetime="2027-07-31T12:00:00Z">31/Julio/2027</time>';
  const result = extractDateRange(html, config);
  assert.deepEqual(result, { runStartDate: "2025-07-10", runEndDate: "2027-07-31" });
});

// Real markup, added 2026-07-27 for mallecoescultura.cl: The Events
// Calendar plugin gives exactly ONE date per event (an inauguración/
// presentation, never a multi-week run) — the `dayIso` shorthand treats
// that single day as both runStartDate and runEndDate.
test("extractDateRange treats a single dayIso match as both start and end (mallecoescultura.cl-style, one-date events)", () => {
  const config: DateRangeConfig = {
    pattern: /tribe-events-calendar-list__event-datetime"\s*datetime="(?<dayIso>\d{4}-\d{2}-\d{2})"/,
  };
  const html = '<time class="tribe-events-calendar-list__event-datetime" datetime="2023-12-18">18 diciembre @ 19:30</time>';
  const result = extractDateRange(html, config);
  assert.deepEqual(result, { runStartDate: "2023-12-18", runEndDate: "2023-12-18" });
});

test("extractDateRange parses day + 3-letter-month pairs with a shared year element (molinomachmar.cl-style)", () => {
  const config: DateRangeConfig = {
    pattern:
      /class="evento-fecha[^"]*"[^>]*>[\s\S]*?<span>\s*(?<startDay>\d{1,2})\s+(?<startMonth>[A-ZÁÉÍÓÚ]{3})[\s\S]*?<\/span>\s*<span>\s*(?<endDay>\d{1,2})\s+(?<endMonth>[A-ZÁÉÍÓÚ]{3})[\s\S]*?<\/span>[\s\S]*?evento-ano[^"]*"[^>]*>\s*(?<year>\d{4})/,
  };
  const html = 'class="evento-fecha ff-secondary"><span>20 JUN</span><span>16 AGO</span></div><p class="evento-ano ff-secondary">2026</p>';
  const result = extractDateRange(html, config);
  assert.deepEqual(result, { runStartDate: "2026-06-20", runEndDate: "2026-08-16" });
});

test("extractDateRange parses day + 3-letter Spanish-abbreviation + year ranges (arteinformado.com-style)", () => {
  const config: DateRangeConfig = {
    pattern:
      /(?<startDay>\d{1,2})\s+(?<startMonth>[a-zé]{3})\.?\s+de\s+(?<startYear>\d{4})\s*-\s*(?<endDay>\d{1,2})\s+(?<endMonth>[a-zé]{3})\.?\s+de\s+(?<endYear>\d{4})/i,
  };
  const result = extractDateRange("11 jul de 2026 - 11 oct de 2026", config);
  assert.deepEqual(result, { runStartDate: "2026-07-11", runEndDate: "2026-10-11" });
});

// Real markup, added 2026-08-08 for cclm.cl: full Spanish month names (not
// 3-letter abbreviations like every other source above) across THREE
// different real separators ("/", "-", "a") — the month groups only
// capture the first 3 letters, matching resolveMonthGroup's existing
// abbreviation table.
test("extractDateRange parses full-month-name ranges across three different real separators (cclm.cl-style)", () => {
  const config: DateRangeConfig = {
    pattern:
      /(?<startMonth>[a-zé]{3})[a-zé]*\s+(?<startDay>\d{1,2})\s+(?:\/|-|a)\s+(?<endMonth>[a-zé]{3})[a-zé]*\s+(?<endDay>\d{1,2}),?\s*(?<year>\d{4})/i,
  };
  assert.deepEqual(extractDateRange("Agosto 05 / Octubre 11, 2026", config), { runStartDate: "2026-08-05", runEndDate: "2026-10-11" });
  assert.deepEqual(extractDateRange("Junio 19 - Nov 01, 2026", config), { runStartDate: "2026-06-19", runEndDate: "2026-11-01" });
  assert.deepEqual(extractDateRange("Mayo 07 a Septiembre 27, 2026", config), { runStartDate: "2026-05-07", runEndDate: "2026-09-27" });
});

// Real markup, same source: one sampled item has no end day at all — too
// irregular to regex reliably, correctly falls through to null rather than
// guessing (Haiku's own interpretation of the raw daysRegex text is the
// fallback, same posture as every other unmatched case in this file).
test("extractDateRange returns null for cclm.cl's one genuinely irregular case (no end day stated)", () => {
  const config: DateRangeConfig = {
    pattern:
      /(?<startMonth>[a-zé]{3})[a-zé]*\s+(?<startDay>\d{1,2})\s+(?:\/|-|a)\s+(?<endMonth>[a-zé]{3})[a-zé]*\s+(?<endDay>\d{1,2}),?\s*(?<year>\d{4})/i,
  };
  assert.equal(extractDateRange("Junio 11, 2026 / mayo, 2027", config), null);
});

test("extractDateRange returns null instead of a wrong date when the second slot isn't a real month (molinomachmar.cl single-day events show an hour there instead, e.g. '18 HRS')", () => {
  const config: DateRangeConfig = {
    pattern:
      /class="evento-fecha[^"]*"[^>]*>[\s\S]*?<span>\s*(?<startDay>\d{1,2})\s+(?<startMonth>[A-ZÁÉÍÓÚ]{3})[\s\S]*?<\/span>\s*<span>\s*(?<endDay>\d{1,2})\s+(?<endMonth>[A-ZÁÉÍÓÚ]{3})[\s\S]*?<\/span>[\s\S]*?evento-ano[^"]*"[^>]*>\s*(?<year>\d{4})/,
  };
  const html = 'class="evento-fecha ff-secondary"><span>23 JUL</span><span>18 HRS</span></div><p class="evento-ano ff-secondary">2026</p>';
  assert.equal(extractDateRange(html, config), null);
});

test("extractDateRange returns null when the pattern doesn't match at all", () => {
  const config: DateRangeConfig = { pattern: /nunca va a matchear/ };
  assert.equal(extractDateRange("Vigente", config), null);
});

test("extractArticleList populates structuredStartDate/EndDate when dateRangeExtractor is configured and matches, leaving rawDateText as the display fallback either way", () => {
  const configWithDateRange: ArticleListConfig = {
    ...UCHILE_CONFIG,
    dateRangeExtractor: {
      pattern: /del\s+(?<startDay>\d{1,2})\/(?<startMonth>\d{1,2})\/(?<startYear>\d{4})\s+al\s+(?<endDay>\d{1,2})\/(?<endMonth>\d{1,2})\/(?<endYear>\d{4})/i,
    },
  };
  const html = `
    <article class="mod-cal-result__item">
      <h4 class="mod__item-title"><a href="/agenda/evento-uno">Muestra Uno</a></h4>
      <p class="mod-cal-result__item-days">del 11/07/2026 al 11/10/2026</p>
    </article>
  `;
  const items = extractArticleList(html, "https://artes.uchile.cl/agenda/30dias/6", configWithDateRange);
  assert.ok(items);
  assert.equal(items[0].structuredStartDate, "2026-07-11");
  assert.equal(items[0].structuredEndDate, "2026-10-11");
  assert.equal(items[0].rawDateText, "del 11/07/2026 al 11/10/2026", "raw text stays available even once parsed");
});

test("extractArticleList leaves structuredStartDate/EndDate null when dateRangeExtractor is configured but doesn't match this block", () => {
  const configWithDateRange: ArticleListConfig = {
    ...UCHILE_CONFIG,
    dateRangeExtractor: {
      pattern: /del\s+(?<startDay>\d{1,2})\/(?<startMonth>\d{1,2})\/(?<startYear>\d{4})\s+al\s+(?<endDay>\d{1,2})\/(?<endMonth>\d{1,2})\/(?<endYear>\d{4})/i,
    },
  };
  const html = `
    <article class="mod-cal-result__item">
      <h4 class="mod__item-title"><a href="/agenda/evento-uno">Muestra Uno</a></h4>
      <p class="mod-cal-result__item-days">Vigente</p>
    </article>
  `;
  const items = extractArticleList(html, "https://artes.uchile.cl/agenda/30dias/6", configWithDateRange);
  assert.ok(items);
  assert.equal(items[0].structuredStartDate, null);
  assert.equal(items[0].structuredEndDate, null);
});
