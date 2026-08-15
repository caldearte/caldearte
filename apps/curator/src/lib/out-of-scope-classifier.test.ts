import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOutOfScope } from "./out-of-scope-classifier.js";

test("classifyOutOfScope: recognizes the exact convocatoria code-filter suffix (tier 1, already deterministic)", () => {
  const reasoning =
    'Muestra colectiva de artistas emergentes. [FILTRO DE CÓDIGO: la fuente contiene lenguaje de convocatoria/llamado a postular; forzado a rejected]';
  assert.equal(classifyOutOfScope(reasoning), "convocatoria");
});

test("classifyOutOfScope: recognizes real-shaped taller/charla rejections, Spanish and English", () => {
  assert.equal(classifyOutOfScope("Es un taller de dibujo, no una exposición de artes visuales."), "taller_o_charla");
  assert.equal(classifyOutOfScope("This is a workshop on printmaking techniques, not an exhibition."), "taller_o_charla");
  assert.equal(classifyOutOfScope("Se trata de un conversatorio sobre la obra del artista, no una muestra."), "taller_o_charla");
  assert.equal(classifyOutOfScope("This is a seminar/research forum with presentations, a talk format, not a visual-art exhibition."), "taller_o_charla");
});

test("classifyOutOfScope: recognizes real-shaped 'otro evento' rejections (music, theater, etc.)", () => {
  assert.equal(classifyOutOfScope("Es un concierto de jazz en formato convencional, fuera de alcance."), "otro_evento_no_arte_visual");
  assert.equal(classifyOutOfScope("Corresponde a una obra de teatro, no a una exposición de arte visual."), "otro_evento_no_arte_visual");
});

test("classifyOutOfScope: returns null for ordinary in-scope rejections — never a catch-all", () => {
  assert.equal(classifyOutOfScope("No se pudo confirmar la fecha de apertura ni el rango de exhibición."), null);
  assert.equal(classifyOutOfScope("Duplicado de un evento ya insertado en la misma ubicación y fecha."), null);
  assert.equal(classifyOutOfScope("La exposición ya cerró antes de la fecha de esta corrida."), null);
  assert.equal(classifyOutOfScope("Ubicación no reconocida como chilena, forzado a rejected."), null);
});

test("classifyOutOfScope: a real approved-adjacent reasoning string (mentions the words but isn't actually rejecting for that reason) still returns null when no pattern matches", () => {
  assert.equal(
    classifyOutOfScope("Contemporary visual-art exhibition with curatorial framework. Approved."),
    null,
  );
});
