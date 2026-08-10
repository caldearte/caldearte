import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDescription, type DescriptionConfig } from "./description-extract.js";

const UCHILE_CONFIG: DescriptionConfig = {
  pattern: /<div class="content__description"[^>]*>([\s\S]*?)<\/div>\s*<!--\/ description -->/,
};

const MNBA_CONFIG: DescriptionConfig = {
  pattern: /<div class="text-long">([\s\S]*?)<\/div>/,
};

const ARTEINFORMADO_CONFIG: DescriptionConfig = {
  pattern: /<span class="event-text">([\s\S]*?)<\/span>/,
};

test("extractDescription strips nested tags, decodes Spanish HTML entities, and collapses whitespace (real artes.uchile.cl detail-page markup)", () => {
  // Real markup shape, confirmed 2026-07-24 against a live artes.uchile.cl
  // detail page — leads with an <img> inside its own empty-ish <p>, then
  // real prose paragraphs with accented-character entities.
  const html =
    '<div class="content__description" itemprop="description">\n' +
    '<p><img alt="Muestra" src="/dam/foto.jpg" /></p>\n\n' +
    "<p>Constanza Alarc&oacute;n Tennen</p>\n\n" +
    "<p>Subducci&oacute;n es el tipo de interacci&oacute;n entre las placas.</p>\n" +
    "                </div>\n" +
    "                <!--/ description -->\n" +
    "                <!--/ credit -->";

  const result = extractDescription(html, UCHILE_CONFIG);
  assert.equal(result, "Constanza Alarcón Tennen Subducción es el tipo de interacción entre las placas.");
});

test("extractDescription reads mnba.gob.cl's real markup shape, stopping at the first closing </div> (no nested divs inside)", () => {
  const html =
    '<div class="text-long"><p><span>En el marco de sus 145 años, el Museo dedica la Sala Chile.</span></p></div>\n' +
    '      \n  </div>\n<div  class="grid__item--footer">';

  const result = extractDescription(html, MNBA_CONFIG);
  assert.equal(result, "En el marco de sus 145 años, el Museo dedica la Sala Chile.");
});

test("extractDescription reads arteinformado.com's real markup shape — plain text with no nested tags inside the span", () => {
  const html =
    '<span class="text-uppercase">Descripción de la Exposición</span><br /><br />\n' +
    '    <span class="event-text">MAC celebra 50 años de su fototeca.\n\n80 artistas son parte de la muestra.</span>\n' +
    "</p>";

  const result = extractDescription(html, ARTEINFORMADO_CONFIG);
  assert.equal(result, "MAC celebra 50 años de su fototeca. 80 artistas son parte de la muestra.");
});

// Matches galeriapready.cl's real detail-page markup — the same config
// known-sources.ts gives it in production (added 2026-08-10).
const PREADY_CONFIG: DescriptionConfig = {
  pattern: /class="[^"]*\bw-richtext\b[^"]*">([\s\S]*?)Contacto prensa/,
};

test("extractDescription reads galeriapready.cl's real markup, stopping before 'Contacto prensa' even when it's wrapped in <strong> — real bug found 2026-08-10: anchoring the terminator to '<p>' immediately before the text broke silently on a page where an intervening <strong> tag (present on some write-ups, absent on others) blocked the match entirely", () => {
  // Reproduces the exact shape found on "Martín Daiber - Primavera"'s real
  // page — <strong>-wrapped labels, a zero-width joiner (‍) before
  // some paragraphs — that a naive '<p>[^<]*Contacto prensa' anchor missed.
  const html =
    '<div class="w-richtext"><p><strong>Martín Daiber </strong>‍</p>' +
    '<p>‍<strong>Inauguración:</strong> miércoles 10 de junio 18:00 hrs</p>' +
    '<p>‍<strong>Exposición abierta hasta:</strong> 13 de julio</p>' +
    "<p>Galería Patricia Ready presenta la nueva exposición individual del artista.</p>" +
    '<p>‍<strong>Contacto prensa:</strong> galeria@galeriapatriciaready.cl</p></div>' +
    '<div class="spacer medium"></div><div class="exhib-artist-title">Sobre el artista</div>';

  const result = extractDescription(html, PREADY_CONFIG);
  assert.match(result ?? "", /Inauguración: miércoles 10 de junio 18:00 hrs/);
  assert.match(result ?? "", /Exposición abierta hasta: 13 de julio/);
  assert.doesNotMatch(result ?? "", /Contacto prensa/, "cut off before the press-contact line, not after");
});

// Matches aninatgaleria.org's real detail-page markup — the same config
// known-sources.ts gives it in production (added 2026-08-10).
const ANINAT_CONFIG: DescriptionConfig = {
  pattern: /data-sqsp-text-block-content>([\s\S]*?)BlogItem-share/,
};

test("extractDescription reads aninatgaleria.org's real markup, sweeping across multiple interleaved Squarespace text/image blocks to reach the real 'inauguración' sentence in a LATER block, not just the first (short title-header) one", () => {
  // Reproduces the real shape found on "Magdalena Correa - KOS"'s page: a
  // short title-header text block, THEN an unrelated image block, THEN the
  // block with the real body text — no single div wraps just "the
  // description", so the pattern must span from the first text block all
  // the way to the stable end-of-article marker (BlogItem-share).
  const html =
    'data-sqsp-text-block-content><p><strong>ANINAT GALERÍA PRESENTA "KOS"</strong></p></div>' +
    '<div class="sqs-block image-block"><img src="https://cdn.example.com/foto.jpg" alt="" /></div>' +
    '<div class="sqs-block-content"><div class="sqs-html-content" data-sqsp-text-block-content>' +
    "<p>Magdalena Correa expondr&aacute; en Aninat Galer&iacute;a.</p>" +
    "<p><strong>La inauguraci&oacute;n se realizar&aacute; el jueves 13 de agosto a las 18:30 horas en Aninat Galer&iacute;a.</strong></p></div>" +
    '<div class="Blog-meta"><time datetime="2026-08-05">5 de agosto de 2026</time></div>' +
    '<div class="BlogItem-share"><a>Compartir</a></div>';

  const result = extractDescription(html, ANINAT_CONFIG);
  assert.match(result ?? "", /Magdalena Correa expondrá en Aninat Galería/);
  assert.match(result ?? "", /La inauguración se realizará el jueves 13 de agosto a las 18:30 horas/);
  assert.doesNotMatch(result ?? "", /Compartir/, "cut off at BlogItem-share, share widget text excluded");
});

test("extractDescription returns null for galeriapready.cl's own empty-richtext shape (an announced-but-not-yet-written-up exhibition — 'Próximamente', no Inauguración text at all)", () => {
  const html = '<div class="w-richtext"></div><div class="spacer medium"></div>';
  assert.equal(extractDescription(html, PREADY_CONFIG), null);
});

test("extractDescription returns null when the pattern doesn't match at all", () => {
  assert.equal(extractDescription("<div>algo distinto</div>", UCHILE_CONFIG), null);
});

test("extractDescription returns null when the captured group strips down to empty text (e.g. only an image, no prose)", () => {
  const html = '<div class="text-long"><img src="/solo-imagen.jpg" /></div>';
  assert.equal(extractDescription(html, MNBA_CONFIG), null);
});

// Real bug, found 2026-07-28 building centronacionaldearte.cultura.gob.cl:
// its WordPress install encodes every accented character and curly quote
// as a HEX NUMERIC entity (&#xE1; for á, &#x2014; for an em dash), not a
// named one — the old decoder only had a named-entity lookup table and
// silently left these undecoded (a literal "&#xE1;" leaking into what
// Haiku reads). Fixed generically: numeric hex/decimal references resolve
// by codepoint before the named-entity table gets a turn.
const CNAC_CONFIG: DescriptionConfig = {
  pattern: /class="info-box2">([\s\S]*?)<!-- \/Section: contenido-->/,
};

test("extractDescription decodes hex numeric HTML entities (&#xE1; etc.), not just named ones (real centronacionaldearte.cultura.gob.cl markup)", () => {
  const html =
    'class="info-box2">' +
    "<p>El pr&#xF3;ximo 30 de mayo a las 12hrs, el Centro Nacional de Arte Contempor&#xE1;neo &#x2014;instituci&#xF3;n p&#xFA;blica&#x2014; inaugura &#x201C;Estrella distante&#x201D;.</p>" +
    "<!-- /Section: contenido-->";

  const result = extractDescription(html, CNAC_CONFIG);
  assert.equal(
    result,
    "El próximo 30 de mayo a las 12hrs, el Centro Nacional de Arte Contemporáneo —institución pública— inaugura “Estrella distante”.",
  );
});

test("extractDescription decodes decimal numeric HTML entities (&#241; etc.) the same way as hex ones", () => {
  const html = 'class="info-box2">' + "<p>Dise&#241;o y curadur&#237;a.</p>" + "<!-- /Section: contenido-->";
  assert.equal(extractDescription(html, CNAC_CONFIG), "Diseño y curaduría.");
});

// Matches estacionmapocho.cl's real detail-page markup — the same config
// known-sources.ts gives it in production (added 2026-08-10).
const MAPOCHO_CONFIG: DescriptionConfig = {
  pattern: /(bi-calendar4-week[\s\S]*?<div class="w40">[\s\S]*?<\/div>)/,
};

test("extractDescription reads estacionmapocho.cl's real markup, folding the real day-level date text (next to the calendar icon) in alongside the curatorial write-up (w40) — deliberate: this source's date phrasing is too inconsistent across items for a dedicated dateRangeExtractor, so the real quotable text is left for Haiku instead", () => {
  const html =
    '<div class="row"><div class="w10"><p><i class="bi bi-calendar4-week"></i></p></div>' +
    '<div class="w90"><p>Del 12 de marzo al 24 de mayo</p></div></div>' +
    '<div class="row"><div class="w10"><p><i class="bi bi-clock"></i></p></div>' +
    '<div class="w90"><p>De 11:00 a 14:00 hrs.</p></div></div>' +
    '<div class="w40"><p class="wp-block-paragraph">En marzo, el Centro Cultural Estación Mapocho recibe “Sueños”.</p></div>' +
    '<section><div class="w50">otro contenido no relacionado</div></section>';

  const result = extractDescription(html, MAPOCHO_CONFIG);
  assert.match(result ?? "", /Del 12 de marzo al 24 de mayo/);
  assert.match(result ?? "", /Centro Cultural Estación Mapocho recibe “Sueños”/);
  assert.doesNotMatch(result ?? "", /otro contenido no relacionado/, "stops at w40's own closing div, doesn't sweep in unrelated later sections");
});

// Matches factoriasantarosa.cl's real detail-page markup — the same config
// known-sources.ts gives it in production (added 2026-08-10).
const FACTORIA_CONFIG: DescriptionConfig = {
  pattern: /Descripción<\/h5>[\s\S]*?jet-listing-dynamic-field__content"\s*>([\s\S]*?)<\/div><\/div><\/div>/,
};

test("extractDescription reads factoriasantarosa.cl's real markup, disambiguating the description's jet-listing-dynamic-field__content div from the date fields (same CSS class) by anchoring on the preceding 'Descripción' heading", () => {
  const html =
    '<div class="jet-listing-dynamic-field__content" >28-06-2025</div>' + // a date field, same class — must NOT be picked up as the description
    '<h5 class="elementor-heading-title elementor-size-default">Descripción</h5>' +
    '<div class="jet-listing-dynamic-field__content" ><p>Exposición individual de Alejandro “Mono” González</p>' +
    "<p>Factoría Santa Rosa presenta una muestra que reúne el trabajo más reciente del artista.</p></div></div></div>" +
    '<div class="elementor-element-next">contenido no relacionado</div>';

  const result = extractDescription(html, FACTORIA_CONFIG);
  assert.match(result ?? "", /Exposición individual de Alejandro "Mono" González|Exposición individual de Alejandro “Mono” González/);
  assert.match(result ?? "", /Factoría Santa Rosa presenta una muestra/);
  assert.doesNotMatch(result ?? "", /28-06-2025/, "the date field (same CSS class, appears earlier) must not leak into the description");
  assert.doesNotMatch(result ?? "", /contenido no relacionado/, "stops at its own closing divs, doesn't sweep in later unrelated content");
});

// Matches centex.cultura.gob.cl's real detail-page markup — the same
// config known-sources.ts gives it in production (added 2026-08-10).
const CENTEX_CONFIG: DescriptionConfig = {
  pattern: /single-content fitvids">([\s\S]*?)<\/main>/,
};

test("extractDescription reads centex.cultura.gob.cl's real markup, bounded on the reliable </main> tag rather than 'first closing </div>' — real finding: the article body has genuinely NESTED <div> blocks inside the prose itself (embedded image-with-caption blocks), so a naive first-</div> bound would cut real content off early", () => {
  const html =
    '<div class="container single-content fitvids">' +
    "<p>El próximo sábado 11 de julio, a las 12:00 horas, se inaugura la exposición.</p>" +
    '<div class="wp-block-media-text"><figure><img src="https://example.cl/foto.jpg" /></figure><div class="wp-block-media-text__content">' +
    "<p>Texto embebido dentro de un bloque de imagen anidado.</p>" +
    "</div></div>" +
    "<p>*Inauguración: sábado 11 de julio, 12:00 horas *Lugar: Galerías Regional y Nacional, Zócalo. *Centex, Sotomayor 233, Valparaíso</p>" +
    "</div></main>" +
    '<div id="side">Dirección Valparaíso: Plaza Sotomayor 233. Política de Privacidad</div>';

  const result = extractDescription(html, CENTEX_CONFIG);
  assert.match(result ?? "", /se inaugura la exposición/);
  assert.match(result ?? "", /Texto embebido dentro de un bloque de imagen anidado/, "real content nested inside a sub-div must still be captured, not cut off at the first closing </div>");
  assert.match(result ?? "", /Inauguración: sábado 11 de julio, 12:00 horas/);
  assert.doesNotMatch(result ?? "", /Política de Privacidad/, "stops at </main>, doesn't sweep in the site-wide footer/address block");
});
