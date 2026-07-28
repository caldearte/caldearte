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
