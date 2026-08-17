import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractArticleList,
  extractDateRange,
  extractImgTags,
  extractWordpressItems,
  filterKnownSourceImages,
  truncateSafely,
  type ArticleListConfig,
  type DateRangeConfig,
  type WordpressRestConfig,
} from "./extractors.js";

// Real production crash, found 2026-08-14 (mugupla's emoji-dense
// Instagram captions): a plain `.slice(0, n)` truncates by UTF-16 code
// unit, splitting a surrogate-pair emoji in half when the cut lands
// between its two units — the Anthropic API's request-body parser
// rejects the resulting lone surrogate outright, crashing the whole
// curation call (not just the one candidate).
test("truncateSafely never splits a surrogate-pair emoji, unlike a plain .slice()", () => {
  const text = "x".repeat(119) + "🖋" + "y".repeat(20); // the emoji straddles code-unit index 120
  const broken = text.slice(0, 120);
  // Confirms this really is the bug being guarded against: plain .slice()
  // leaves a lone high surrogate as the last code unit.
  assert.equal(broken.charCodeAt(119) >= 0xd800 && broken.charCodeAt(119) <= 0xdbff, true, "sanity check: the naive slice really does end mid-surrogate-pair");
  const safe = truncateSafely(text, 120);
  assert.equal(safe, "x".repeat(119) + "🖋"); // keeps the whole emoji rather than half of it
});

test("truncateSafely behaves like a plain slice for ASCII text with no surrogate pairs", () => {
  assert.equal(truncateSafely("hola mundo", 4), "hola");
  assert.equal(truncateSafely("corto", 100), "corto");
});

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

// Real gap found 2026-08-17 (galeriapready.cl): a source whose listing
// unavoidably spans every year at once has a real recurring chunk of
// artist-roster/profile entries with a genuinely empty date field — no
// date anywhere for these, ever. skipIfNoDate drops them before they ever
// become a BrightSourceItem, instead of costing Haiku a judgment call
// every ~90 days forever for something that can never become approvable.
test("extractArticleList with skipIfNoDate drops a block whose daysRegex captures nothing, but keeps one with a real date", () => {
  const html = `
    <article class="mod-cal-result__item">
      <h4 class="mod__item-title"><a href="/agenda/con-fecha">Muestra con fecha</a></h4>
      <p class="mod-cal-result__item-days">Todo julio</p>
    </article>
    <article class="mod-cal-result__item">
      <h4 class="mod__item-title"><a href="/agenda/sin-fecha">Solo el nombre del artista</a></h4>
    </article>
  `;
  const config: ArticleListConfig = { ...UCHILE_CONFIG, skipIfNoDate: true };

  const items = extractArticleList(html, "https://artes.uchile.cl/agenda/30dias/6", config);

  assert.ok(items);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Muestra con fecha");
});

test("extractArticleList without skipIfNoDate (the default) still keeps a block with no date, same as before", () => {
  const html = `
    <article class="mod-cal-result__item">
      <h4 class="mod__item-title"><a href="/agenda/sin-fecha">Solo el nombre del artista</a></h4>
    </article>
  `;

  const items = extractArticleList(html, "https://artes.uchile.cl/agenda/30dias/6", UCHILE_CONFIG);

  assert.ok(items);
  assert.equal(items.length, 1);
  assert.equal(items[0].rawDateText, "fecha no indicada");
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

// Matches espacioo.com's real markup — the same config known-sources.ts
// gives it in production (added 2026-08-08).
const ESPACIOO_CONFIG: ArticleListConfig = {
  kind: "articleList",
  blockRegex: /<li[^>]*data-width="\d+"[^>]*>([\s\S]*?)<\/li>/g,
  titleLinkRegex: /<a href="([^"]+)"[^>]*>[\s\S]*?<h2>([^<]*)<\/h2>/,
  daysRegex: /<span class="date">([^<]+)<\/span>/,
  descriptionRegex: /<span class="description prose">([\s\S]*?)<\/span>/,
  dateRangeExtractor: {
    pattern:
      /(?<startDay>\d{1,2})\s+(?<startMonth>[a-zé]{3})[a-zé]*(?:\s+(?<startYear>\d{4}))?\s+-\s+(?<endDay>\d{1,2})\s+(?<endMonth>[a-zé]{3})[a-zé]*\s+(?<year>\d{4})/i,
  },
};

// Real bug found 2026-08-08 building this: a rigid `<li data-width="N">`
// blockRegex silently dropped the site's LAST listed item, whose <li> also
// carried `class="last"` before data-width — this fixture reproduces that
// exact shape to guard against regressing to a rigid attribute-order
// assumption.
test("extractArticleList handles espacioo.com's real markup: an <li> with an extra class before data-width, the lazy-loaded image, listing-level description, and both cross-year and same-year date shapes", () => {
  const html = `
    <li data-width="1000" data-height="1000">
      <a href="/exhibitions/39-albergue-transitorio/overview/">
        <span class="image"><span><img src="data:image/gif;base64,tiny" data-src="https://static-assets.artlogic.net/albergue.jpg" alt="Albergue" /></span></span>
        <div class="content">
          <h2>Albergue Transitorio</h2>
          <span class="subtitle">Exposición Colectiva</span>
          <span class="date">3 Diciembre 2025 - 31 Marzo 2026</span>
          <span class="description prose">Una muestra sobre la noci&oacute;n de refugio...</span>
        </div>
      </a>
    </li>
    <li  class="last"  data-width="2000" data-height="2000">
      <a href="/exhibitions/36-destiempo/overview/">
        <span class="image"><span><img src="data:image/gif;base64,tiny" data-src="https://static-assets.artlogic.net/destiempo.jpg" alt="Destiempo" /></span></span>
        <div class="content">
          <h2>Destiempo</h2>
          <span class="subtitle">Virginia Guilisasti</span>
          <span class="date">28 Noviembre 2024 - 28 Febrero 2025</span>
          <span class="description prose">Sobre la rutina incontrolada...</span>
        </div>
      </a>
    </li>
  `;
  const items = extractArticleList(html, "https://www.espacioo.com/exhibitions/", ESPACIOO_CONFIG);
  assert.ok(items);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Albergue Transitorio");
  assert.equal(items[0].imageUrl, "https://static-assets.artlogic.net/albergue.jpg");
  // Cross-year: both years stated explicitly.
  assert.deepEqual({ start: items[0].structuredStartDate, end: items[0].structuredEndDate }, { start: "2025-12-03", end: "2026-03-31" });
  // Confirms the real entity-decoding bug fix (collapseWhitespace now
  // decodes, not just title) — "noci&oacute;n" -> "noción".
  assert.match(items[0].description ?? "", /noción de refugio/);
  assert.equal(items[1].title, "Destiempo");
  assert.equal(items[1].imageUrl, "https://static-assets.artlogic.net/destiempo.jpg");
  // Cross-year again, both years stated.
  assert.deepEqual({ start: items[1].structuredStartDate, end: items[1].structuredEndDate }, { start: "2024-11-28", end: "2025-02-28" });
});

// Matches galeriapready.cl's real markup — the same config known-sources.ts
// gives it in production (added 2026-08-10). No dateRangeExtractor: the
// listing states dates in ENGLISH ("August 26, 2026"), which Spanish-only
// ES_MONTH_ABBR can't parse — rawDateText (with its real year) is left for
// Haiku to interpret instead.
const PREADY_CONFIG: ArticleListConfig = {
  kind: "articleList",
  blockRegex: /(<a href="\/exhibition\/[^"]+" class="exhib-tabs-item w-inline-block">[\s\S]*?<\/a>)/g,
  titleLinkRegex: /<a href="([^"]+)"[^>]*>[\s\S]*?exhib-tab-title">([^<]*)</,
  daysRegex: /class="exhib-tab-descr">([^<]*)</,
};

test("extractArticleList handles galeriapready.cl's real markup: title/link/image/date extracted, and an item whose only descr div is the empty w-dyn-bind-empty variant yields no rawDateText", () => {
  const html = `
    <div role="listitem" class="w-dyn-item">
      <a href="/exhibition/elvira-valenzuela---sobre-peso" class="exhib-tabs-item w-inline-block">
        <img src="https://cdn.prod.website-files.com/elvira.jpg" class="exhib-tabs-img"/>
        <div class="exhib-tab-title">Elvira Valenzuela - Sobre / peso</div>
        <div class="exhib-tab-descr">July 22, 2026</div>
        <div class="exhib-tab-descr">En curso</div>
        <div class="exhib-tab-descr">Sala Araucaria</div>
      </a>
    </div>
    <div role="listitem" class="w-dyn-item">
      <a href="/exhibition/caicoi" class="exhib-tabs-item w-inline-block">
        <img src="https://cdn.prod.website-files.com/caicoi.jpg" class="exhib-tabs-img"/>
        <div class="exhib-tab-title">Raquel Aguilar - Caicoi</div>
        <div class="exhib-tab-descr w-dyn-bind-empty"></div>
      </a>
    </div>
  `;
  const items = extractArticleList(html, "https://galeriapready.cl/exhibiciones", PREADY_CONFIG);
  assert.ok(items);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Elvira Valenzuela - Sobre / peso");
  assert.equal(items[0].sourceUrl, "https://galeriapready.cl/exhibition/elvira-valenzuela---sobre-peso");
  assert.equal(items[0].imageUrl, "https://cdn.prod.website-files.com/elvira.jpg");
  assert.equal(items[0].rawDateText, "July 22, 2026");
  assert.equal(items[1].title, "Raquel Aguilar - Caicoi");
  assert.equal(items[1].rawDateText, "fecha no indicada", "empty w-dyn-bind-empty descr div — no real date to extract");
});

// Matches aninatgaleria.org's real markup — the same config known-sources.ts
// gives it in production (added 2026-08-10). No daysRegex/dateRangeExtractor
// at all: the listing's own <time datetime="..."> turned out to be a blog
// publish timestamp, not the exhibition's real date (see known-sources.ts's
// own note) — title/href/image are the only deterministic fields here.
const ANINAT_CONFIG: ArticleListConfig = {
  kind: "articleList",
  blockRegex: /(<a\s+href="(\/exhibiciones[^"]+)"\s+class="\s*summary-thumbnail-container[\s\S]*?<\/a>)/g,
  titleLinkRegex: /href="([^"]+)"[\s\S]*?data-title="([^"]*)"/,
};

test("extractArticleList handles aninatgaleria.org's real markup: title/href/image extracted from a single anchor tag's own data-title + nested img — no date field at all", () => {
  const html = `
    <a
      href="/exhibiciones-2026-aux/magdalena-correa-kos"
      class="
        summary-thumbnail-container
        sqs-gallery-image-container
      "
      data-title="Magdalena Correa | &quot;KOS&quot;"
      data-description=""
      aria-label="Magdalena Correa | &quot;KOS&quot;"
    >
      <div class="summary-thumbnail img-wrapper" data-animation-role="image">
        <img data-src="https://images.squarespace-cdn.com/content/v1/kos.jpg" data-image="https://images.squarespace-cdn.com/content/v1/kos.jpg" alt="Magdalena Correa" data-load="false" class="summary-thumbnail-image" />
      </div>
    </a>
    <!-- Timestamp shown elsewhere in the real page, NOT captured — see known-sources.ts's own note on why -->
    <time class="summary-metadata-item summary-metadata-item--date" datetime="2026-08-05">5 de agosto de 2026</time>
  `;
  const items = extractArticleList(html, "https://www.aninatgaleria.org/2026-1", ANINAT_CONFIG);
  assert.ok(items);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Magdalena Correa | "KOS"');
  assert.equal(items[0].sourceUrl, "https://www.aninatgaleria.org/exhibiciones-2026-aux/magdalena-correa-kos");
  assert.equal(items[0].imageUrl, "https://images.squarespace-cdn.com/content/v1/kos.jpg");
  assert.equal(items[0].rawDateText, "fecha no indicada", "no daysRegex configured — the listing's <time> is a publish date, not the exhibition's, so it's never surfaced to Haiku at all");
});

// Matches estacionmapocho.cl's real markup — the same config known-sources.ts
// gives it in production (added 2026-08-10). daysRegex captures a coarse
// MM/YYYY month field (cross-checked against real detail pages and confirmed
// genuine, unlike aninatgaleria.org's misleading <time>) — no
// dateRangeExtractor, since a month alone can't build a real day without
// fabricating one.
const MAPOCHO_CONFIG: ArticleListConfig = {
  kind: "articleList",
  blockRegex: /(<div class="eventosPosts">[\s\S]*?<\/a>\s*<\/div>)/g,
  titleLinkRegex: /<a href="([^"]+)">[\s\S]*?<h2>([^<]*)<\/h2>/,
  daysRegex: /bi-calendar4-week[\s\S]*?w90"><p>([^<]*)<\/p>/,
};

test("extractArticleList handles estacionmapocho.cl's real markup: title/href/image/month extracted from the 'eventosPosts' card, the calendar-icon row picked out from among the icon rows around it", () => {
  const html = `
    <div class="eventosPosts">
      <a href="https://www.estacionmapocho.cl/?artvis=suenos">
        <div class="eventosPostsImg">
          <img src="https://www.estacionmapocho.cl/wp-content/uploads/2026/03/canon-09-scaled.jpg" class="" alt="">
        </div>
        <div class="eventosPostsB">
          <h2>Sueños</h2>
          <hr>
          <p>Una exposición de fotografía subacuática.</p>
          <hr>
          <div class="row">
            <div class="w10"><p><i class="bi bi-calendar4-week"></i></p></div>
            <div class="w90"><p>03/2026</p></div>
          </div>
        </div>
      </a>
    </div>
  `;
  const items = extractArticleList(html, "https://www.estacionmapocho.cl/?page_id=16", MAPOCHO_CONFIG);
  assert.ok(items);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Sueños");
  assert.equal(items[0].sourceUrl, "https://www.estacionmapocho.cl/?artvis=suenos");
  assert.equal(items[0].imageUrl, "https://www.estacionmapocho.cl/wp-content/uploads/2026/03/canon-09-scaled.jpg");
  assert.equal(items[0].rawDateText, "03/2026");
});

// Matches factoriasantarosa.cl's real markup — the same config
// known-sources.ts gives it in production (added 2026-08-10). No date
// field on the listing at all — dates only exist on the detail page (see
// extractDateRange's own detailDateRangeExtractor-style test below).
const FACTORIA_CONFIG: ArticleListConfig = {
  kind: "articleList",
  blockRegex:
    /(<a href="(https:\/\/factoriasantarosa\.cl\/exposiciones\/[^"]+)" class="jet-listing-dynamic-image__link">[\s\S]*?jet-listing-dynamic-link__label">[^<]*<\/span>\s*<\/a>)/g,
  titleLinkRegex: /<a href="([^"]+)"[\s\S]*?jet-listing-dynamic-link__label">([^<]*)<\/span>/,
};

test("extractArticleList handles factoriasantarosa.cl's real markup: two adjacent JetEngine widgets sharing the same href (image link, then title link) captured as one block", () => {
  const html = `
    <a href="https://factoriasantarosa.cl/exposiciones/la-tercera-edad-del-mono" class="jet-listing-dynamic-image__link">
      <img width="2560" height="1707" src="https://factoriasantarosa.cl/wp-content/uploads/2025/08/DSC_5881-scaled.webp" class="jet-listing-dynamic-image__img" alt="LA TERCERA EDAD DEL MONO" />
    </a>
    <a href="https://factoriasantarosa.cl/exposiciones/la-tercera-edad-del-mono" class="jet-listing-dynamic-link__link">
      <span class="jet-listing-dynamic-link__label">LA TERCERA EDAD DEL MONO</span>
    </a>
  `;
  const items = extractArticleList(html, "https://factoriasantarosa.cl/exposiciones", FACTORIA_CONFIG);
  assert.ok(items);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "LA TERCERA EDAD DEL MONO");
  assert.equal(items[0].sourceUrl, "https://factoriasantarosa.cl/exposiciones/la-tercera-edad-del-mono");
  assert.equal(items[0].imageUrl, "https://factoriasantarosa.cl/wp-content/uploads/2025/08/DSC_5881-scaled.webp");
});

test("extractDateRange (factoriasantarosa.cl-style): reads two consecutive DD-MM-YYYY jet-listing-dynamic-field values as start/end, NOT anchored to the 'Inicio'/'Termino' label text — real bug found 2026-08-10: the site's own nav menu also has a link literally labeled 'Inicio' ('Home'), which a label-anchored regex matched first, on the wrong occurrence", () => {
  const config: DateRangeConfig = {
    pattern:
      /jet-listing-dynamic-field__content"\s*>(?<startDay>\d{1,2})-(?<startMonth>\d{1,2})-(?<startYear>\d{4})<[\s\S]*?jet-listing-dynamic-field__content"\s*>(?<endDay>\d{1,2})-(?<endMonth>\d{1,2})-(?<endYear>\d{4})</,
  };
  const html =
    '<a class="elementor-item menu-link">Inicio</a>' + // real nav-menu link, NOT a date — must not be matched
    '<div class="jet-listing-dynamic-field__content" >28-06-2025</div>' +
    '<div class="jet-listing-dynamic-field__content" >07-09-2025</div>';
  assert.deepEqual(extractDateRange(html, config), { runStartDate: "2025-06-28", runEndDate: "2025-09-07" });
});

test("extractDateRange (factoriasantarosa.cl-style): returns null, not a guess, when the end-date field is genuinely empty (real case: 'diga-queer-con-la-lengua-afuera' has a start date but no Termino set)", () => {
  const config: DateRangeConfig = {
    pattern:
      /jet-listing-dynamic-field__content"\s*>(?<startDay>\d{1,2})-(?<startMonth>\d{1,2})-(?<startYear>\d{4})<[\s\S]*?jet-listing-dynamic-field__content"\s*>(?<endDay>\d{1,2})-(?<endMonth>\d{1,2})-(?<endYear>\d{4})</,
  };
  const html = '<div class="jet-listing-dynamic-field__content" >26-08-2023</div><div class="jet-listing-dynamic-field__content" ></div>';
  assert.equal(extractDateRange(html, config), null);
});

// Matches centex.cultura.gob.cl's real markup — the same config
// known-sources.ts gives it in production (added 2026-08-10). No date
// field at all: b2fecha (on the real page) turned out to be the post's
// publish date, not the exhibition's — same trap as aninatgaleria.org.
const CENTEX_CONFIG: ArticleListConfig = {
  kind: "articleList",
  blockRegex: /(<a class="b2" href="([^"]+)">[\s\S]*?<\/a>)/g,
  titleLinkRegex: /href="([^"]+)"[\s\S]*?<\/span>([^<]*)<\/div>/,
};

test("extractArticleList handles centex.cultura.gob.cl's real markup: title/href/image from an 'a.b2' card, title text picked out from AFTER the date span rather than trusting the date span itself", () => {
  const html = `
    <a class="b2" href="https://centex.cultura.gob.cl/centex-inaugura-exposicion-postuma-de-juan-castillo-el-final-no-es-el-final/">
      <img src="https://centex.cultura.gob.cl/wp-content/uploads/2026/07/Juan-Castillo-4-1024x683.jpg" class="card-img-top wp-post-image" alt="" />
      <div class="info"><span class="b2fecha">5 julio, 2026</span>Centex inaugura exposición póstuma de Juan Castillo: El final no es el final</div>
    </a>
  `;
  const items = extractArticleList(html, "https://centex.cultura.gob.cl/category/muestras-y-exposiciones/", CENTEX_CONFIG);
  assert.ok(items);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Centex inaugura exposición póstuma de Juan Castillo: El final no es el final");
  assert.equal(
    items[0].sourceUrl,
    "https://centex.cultura.gob.cl/centex-inaugura-exposicion-postuma-de-juan-castillo-el-final-no-es-el-final/",
  );
  assert.equal(items[0].imageUrl, "https://centex.cultura.gob.cl/wp-content/uploads/2026/07/Juan-Castillo-4-1024x683.jpg");
  assert.equal(items[0].rawDateText, "fecha no indicada", "no daysRegex configured — b2fecha is a publish date, not the exhibition's, never surfaced to Haiku");
});

// Matches museoschile.gob.cl's (Red Nacional de Museos) real markup — the
// same config known-sources.ts gives it in production (added 2026-08-10).
// blockRegex requires a real field--name-field-tematica of "Artes
// visuales" or "Exposición" via a positive lookahead — a national
// multi-discipline aggregator, so science/zoology/anthropology items must
// never reach Haiku at all, not just get rejected by it downstream.
const MUSEOSCHILE_CONFIG: ArticleListConfig = {
  kind: "articleList",
  blockRegex:
    /<div class="views-row">(?=(?:(?!<div class="views-row">)[\s\S])*?field--name-field-tematica">(?:Artes visuales|Exposición)<)([\s\S]*?)(?=<div class="views-row">|$)/g,
  titleLinkRegex: /<h2 class="destacado__title"><a href="([^"]+)">([^<]*)<\/a><\/h2>/,
  placeRegex: /field--name-field-direccion">\s*([^<]*?)\s*<\/div>/,
  dateRangeExtractor: {
    pattern:
      /<time>(?<startDay>\d{1,2})\/(?<startMonth>[a-zé]{3})[a-zé]*\/(?<startYear>\d{4})<\/time>\s*hasta el\s*<time>(?<endDay>\d{1,2})\/(?<endMonth>[a-zé]{3})[a-zé]*\/(?<endYear>\d{4})<\/time>/i,
  },
};

test("extractArticleList (museoschile.gob.cl-style): keeps 'Artes visuales' and 'Exposición' items, deterministically excludes 'Zoología' — a national multi-discipline aggregator where science content must never reach Haiku at all", () => {
  const html = `
    <div class="views-row"><div class="grid__item--header"><div class="field--name-field-tematica">Zoología</div>
<h2 class="destacado__title"><a href="https://www.mnhn.gob.cl/cartelera/mariposas">Mariposas y Polillas</a></h2></div><div class="grid__item--evento"><div class="date"><span class="day">24</span><span class="month">Abr</span><span class="year">2025</span></div>
<div class="field--name-field-direccion">Parque Quinta Normal, Santiago, Chile. </div></div><div class="grid__item--institucion"><div class="field--name-field-fechas">
<time>24/Abril/2025</time>
hasta el
<time>30/Agosto/2026</time>
</div>
<div class="field--name-institucion">Museo Nacional de Historia Natural</div></div><div class="field--name-field-image"><a href="https://www.mnhn.gob.cl/cartelera/mariposas"><img src="https://www.mnhn.gob.cl/mariposas.jpg"></a></div></div>
    <div class="views-row"><div class="grid__item--header"><div class="field--name-field-tematica">Artes visuales</div>
<h2 class="destacado__title"><a href="https://www.mnba.gob.cl/cartelera/roberto-matta-abrir-la-mirada">Roberto Matta. Abrir la mirada</a></h2></div><div class="grid__item--evento"><div class="date"><span class="day">10</span><span class="month">Jul</span><span class="year">2025</span></div>
<div class="field--name-field-direccion">José Miguel de la Barra 650, Santiago, Chile. </div></div><div class="grid__item--institucion"><div class="field--name-field-fechas">
<time>10/Julio/2025</time>
hasta el
<time>31/Julio/2027</time>
</div>
<div class="field--name-institucion">Museo Nacional de Bellas Artes</div></div><div class="field--name-field-image"><a href="https://www.mnba.gob.cl/cartelera/roberto-matta-abrir-la-mirada"><img src="https://www.mnba.gob.cl/matta.jpg"></a></div></div>
  `;
  const items = extractArticleList(html, "https://www.museoschile.gob.cl/cartelera/red-nacional", MUSEOSCHILE_CONFIG);
  assert.ok(items);
  assert.equal(items.length, 1, "the Zoología item must be excluded before curation, not just left for Haiku to reject");
  assert.equal(items[0].title, "Roberto Matta. Abrir la mirada");
  assert.equal(items[0].sourceUrl, "https://www.mnba.gob.cl/cartelera/roberto-matta-abrir-la-mirada");
  assert.equal(items[0].locationHint, "José Miguel de la Barra 650, Santiago, Chile.");
  assert.deepEqual({ start: items[0].structuredStartDate, end: items[0].structuredEndDate }, { start: "2025-07-10", end: "2027-07-31" });
});

// Matches fundaciongasco.cl's real markup — the same config
// known-sources.ts gives it in production (added 2026-08-10). Only a
// coarse "Mon YYYY" date on the listing (left as rawDateText) — the real
// full date range only exists on the detail page (see
// detailDateRangeExtractor's own test in description-extract.test.ts's
// sibling, extractDateRange, below).
const GASCO_CONFIG: ArticleListConfig = {
  kind: "articleList",
  blockRegex: /<div class="expo-item ">([\s\S]*?)<\/div>\s*<\/div>/g,
  titleLinkRegex: /<h2><a href="([^"]+)"[^>]*>([^<]*)<\/a><\/h2>/,
  daysRegex: /class="date">([^<]*)<\/p>/,
};

test("extractArticleList handles fundaciongasco.cl's real markup: title/href/image/coarse-month extracted from an 'expo-item' card", () => {
  const html = `
    <div class="expo-item ">
      <img width="2550" height="1496" src="https://fundaciongasco.cl/wp-content/uploads/2026/03/DSC_3809.jpg" class="attachment-post-thumbnail size-post-thumbnail wp-post-image" alt="DSC_3809" />
      <div class="expo-info">
        <p class="epigraph"><a href="https://fundaciongasco.cl/artista/hoda-madi">Hoda Madi</a></p>
        <h2><a href="https://fundaciongasco.cl/exposicion/tierra-velada/" title="Tierra Velada">Tierra Velada</a></h2>
        <p class="date">Mar 2026</p>
        <p class="sub-head">Territorio, desarraigo y color se unen en la exposición de Hoda Madi en Sala GASCO Arte Contemporáneo <a class="more" href="https://fundaciongasco.cl/exposicion/tierra-velada/">Ver más</a></p>
      </div>
    </div>
  `;
  const items = extractArticleList(html, "https://fundaciongasco.cl/estado/actual/", GASCO_CONFIG);
  assert.ok(items);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Tierra Velada");
  assert.equal(items[0].sourceUrl, "https://fundaciongasco.cl/exposicion/tierra-velada/");
  assert.equal(items[0].imageUrl, "https://fundaciongasco.cl/wp-content/uploads/2026/03/DSC_3809.jpg");
  assert.equal(items[0].rawDateText, "Mar 2026");
});

// Matches aldeaencuentro.cl's real markup — the same config
// known-sources.ts gives it in production (added 2026-08-10). No date
// field at all: no real exhibition run-date was found anywhere on the
// site (see known-sources.ts's own note) — title/href/image are the only
// deterministic fields here, description carries the real grounding text.
const ALDEA_CONFIG: ArticleListConfig = {
  kind: "articleList",
  blockRegex: /<a[^>]*class="thumbnail item-thumbnail"[^>]*>([\s\S]*?)<div class="clear">/g,
  titleLinkRegex: /<h3 class="item-title"><a href="([^"]+)"[^>]*>([^<]*)<\/a><\/h3>/,
};

test("extractArticleList handles aldeaencuentro.cl's real markup: title/href extracted, image resolved from the theme's own 'data-s' lazy-load attribute (not the more common data-src)", () => {
  const html = `
    <a style="height: 150px" href="https://aldeaencuentro.cl/siluetas-flora-nativa/" class="thumbnail item-thumbnail"><img width="1247" height="674" src="" class="attachment-full size-full" alt="Siluetas: Flora Nativa" data-s="https://aldeaencuentro.cl/wp-content/uploads/2026/07/3.png" data-ss="https://aldeaencuentro.cl/wp-content/uploads/2026/07/3.png 1247w"></a><div class="item-content"><div class="bg item-labels"><a href="https://aldeaencuentro.cl/category/catalogos-gae/">Catálogos GAE</a></div><h3 class="item-title"><a href="https://aldeaencuentro.cl/siluetas-flora-nativa/" title="Siluetas: Flora Nativa">Siluetas: Flora Nativa</a></h3><div class="meta-items"><a class="meta-item meta-item-date" href="https://aldeaencuentro.cl/siluetas-flora-nativa/"><span>Julio 28, 2026</span></a></div></div><div class="clear"></div>
  `;
  const items = extractArticleList(html, "https://aldeaencuentro.cl/category/catalogos-gae/", ALDEA_CONFIG);
  assert.ok(items);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Siluetas: Flora Nativa");
  assert.equal(items[0].sourceUrl, "https://aldeaencuentro.cl/siluetas-flora-nativa/");
  assert.equal(items[0].imageUrl, "https://aldeaencuentro.cl/wp-content/uploads/2026/07/3.png");
  assert.equal(items[0].rawDateText, "fecha no indicada", "no daysRegex configured — no real exhibition date was found anywhere on the site");
});

test("extractDateRange (fundaciongasco.cl-style): reads the detail page's clean 'Fecha: DD/MM/YYYY - DD/MM/YYYY' spec line", () => {
  const config: DateRangeConfig = {
    pattern:
      /Fecha:<\/span>\s*<span class="value">(?<startDay>\d{1,2})\/(?<startMonth>\d{1,2})\/(?<startYear>\d{4})\s*-\s*(?<endDay>\d{1,2})\/(?<endMonth>\d{1,2})\/(?<endYear>\d{4})/,
  };
  const html = '<li><span class="key">Fecha:</span> <span class="value">10/03/2026 - 30/04/2026 </li></span>';
  assert.deepEqual(extractDateRange(html, config), { runStartDate: "2026-03-10", runEndDate: "2026-04-30" });
});

// Matches isabelcroxattogaleria.com's real markup — the same config
// known-sources.ts gives it in production (added 2026-08-10). Real bug
// found building this: a bounded lookahead (checking only the gap
// between an item's own anchor and its own <h2>, the museoschile.gob.cl
// technique) can't see a GLOBAL section boundary that sits BEFORE later
// items' own anchors, not inside their own block — it let all 87 items
// through (CURRENT + PAST + ONLINE) instead of just the 2 real CURRENT
// ones. Fixed with an unbounded negative lookbehind instead, asserting
// no PAST-section marker has appeared anywhere earlier in the document.
const CROXATTO_CONFIG: ArticleListConfig = {
  kind: "articleList",
  blockRegex: /(?<!exhibitions-grid-past[\s\S]*)(<a href="\/exhibitions\/[^"]+"[^>]*>[\s\S]*?<\/a>)/g,
  titleLinkRegex: /<a href="([^"]+)"[^>]*>[\s\S]*?<h2>([^<]*)<\/h2>/,
  placeRegex: /<span class="subtitle">([^<]*)<\/span>/,
  daysRegex: /<span class="date">([^<]*)<\/span>/,
};

test("extractArticleList (isabelcroxattogaleria.com-style): the unbounded lookbehind correctly keeps items before the PAST-section marker and drops everything after it, regardless of how many items follow", () => {
  const html = `
    <div id="exhibitions-grid-current">
      <a href="/exhibitions/104-current-item/overview/"><h2>Current Show</h2><span class="subtitle">MUSEO DE ARTE CONTEMPORANEO</span><span class="date">24 April - 23 August 2026</span></a>
    </div>
    <div id="exhibitions-grid-past">
      <a href="/exhibitions/103-past-item-1/overview/"><h2>Past Show One</h2><span class="date">1 January - 1 February 2025</span></a>
      <a href="/exhibitions/102-past-item-2/overview/"><h2>Past Show Two</h2><span class="subtitle">La Embajada | Madrid</span><span class="date">1 March - 1 April 2024</span></a>
    </div>
  `;
  const items = extractArticleList(html, "https://isabelcroxattogaleria.com/artists-exhibitions/", CROXATTO_CONFIG);
  assert.ok(items);
  assert.equal(items.length, 1, "only the CURRENT-section item should survive — both PAST items, including the international one, must be excluded before curation");
  assert.equal(items[0].title, "Current Show");
  assert.equal(items[0].sourceUrl, "https://isabelcroxattogaleria.com/exhibitions/104-current-item/overview/");
  assert.equal(items[0].locationHint, "MUSEO DE ARTE CONTEMPORANEO");
});

test("extractDateRange (espacioo.com-style): a same-year range states the year once, at the end — falls back correctly for BOTH start and end via the shared 'year' group, not 'endYear'", () => {
  const config: DateRangeConfig = {
    pattern:
      /(?<startDay>\d{1,2})\s+(?<startMonth>[a-zé]{3})[a-zé]*(?:\s+(?<startYear>\d{4}))?\s+-\s+(?<endDay>\d{1,2})\s+(?<endMonth>[a-zé]{3})[a-zé]*\s+(?<year>\d{4})/i,
  };
  assert.deepEqual(extractDateRange("29 Mayo - 31 Agosto 2025", config), { runStartDate: "2025-05-29", runEndDate: "2025-08-31" });
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
      publishedDate: null,
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
      publishedDate: null,
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
      publishedDate: null,
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

// --- includeFilter: deterministic keyword prefilter (noticias.udec.cl, 2026-08-13) ---

test("extractWordpressItems: includeFilter drops items whose configured fields don't match the pattern", () => {
  const config = { ...PARQUE_CULTURAL_CONFIG, includeFilter: { pattern: /\bexposici[oó]n(es)?\b/i, fields: ["title.rendered"] } };
  const items = [
    { title: { rendered: "Inaugura exposición de fotografía" } },
    { title: { rendered: "Concierto de la Orquesta Sinfónica" } },
  ];
  const result = extractWordpressItems(items, config, "https://example.cl/agenda");
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "Inaugura exposición de fotografía");
});

test("extractWordpressItems: includeFilter checks every configured field, not just the first", () => {
  const config = { ...PARQUE_CULTURAL_CONFIG, includeFilter: { pattern: /\barte\b/i, fields: ["title.rendered", "content.rendered"] } };
  const items = [{ title: { rendered: "Un lugar habitual" }, content: { rendered: "<p>a través del arte textil</p>" } }];
  const result = extractWordpressItems(items, config, "https://example.cl/agenda");
  assert.equal(result.length, 1);
});

test("extractWordpressItems: with no includeFilter configured, every item passes through unchanged (every existing source, unaffected)", () => {
  const items = [{ title: { rendered: "Cualquier cosa" } }];
  const result = extractWordpressItems(items, PARQUE_CULTURAL_CONFIG, "https://parquecultural.cl/agenda");
  assert.equal(result.length, 1);
});

// --- publishedDateField: the source post's own publish date (noticias.udec.cl, 2026-08-13) ---

test("extractWordpressItems reads publishedDate from the configured field when set", () => {
  const config = { ...PARQUE_CULTURAL_CONFIG, publishedDateField: "date" };
  const items = [{ title: { rendered: "X" }, date: "2026-07-27T19:01:14" }];
  const result = extractWordpressItems(items, config, "https://example.cl/agenda");
  assert.equal(result[0].publishedDate, "2026-07-27");
});

test("extractWordpressItems leaves publishedDate null when publishedDateField isn't configured (every existing source, unaffected)", () => {
  const items = [{ title: { rendered: "X" } }];
  const result = extractWordpressItems(items, PARQUE_CULTURAL_CONFIG, "https://parquecultural.cl/agenda");
  assert.equal(result[0].publishedDate, null);
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
