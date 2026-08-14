import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLocation,
  isLikelySameTitle,
  isLikelySameTitleIgnoringPlaceName,
  isLikelySameTitleSharingAnyWord,
  placeNamesLikelySame,
  isWithinAnchorWindow,
} from "./event-filters.js";

test("normalizeLocation collapses a trailing ', Chile'/region suffix — real bug, found 2026-07-20: the same festival got inserted 3x in one run because 'Valparaíso, Chile' vs 'Valparaíso' produced different dedup fingerprints", () => {
  assert.equal(normalizeLocation("Valparaíso, Chile"), normalizeLocation("Valparaíso"));
  assert.equal(normalizeLocation("Valparaíso, Chile"), "valparaiso");
});

test("normalizeLocation only keeps the comuna/ciudad — a venue name in front of the comma doesn't leak in", () => {
  assert.equal(normalizeLocation("Mercado Puerto, Valparaíso"), "mercado puerto");
});

test("normalizeLocation is accent/case-insensitive, same as normalizeTitle", () => {
  assert.equal(normalizeLocation("COLBÚN"), normalizeLocation("colbun"));
});

// Real production bug, found 2026-07-22: insertCandidates computes this
// for every candidate, not just approved ones — a rejected candidate can
// legitimately have a null location, and this crashed the whole unit.
test("normalizeLocation returns an empty string for null/undefined rather than crashing", () => {
  assert.equal(normalizeLocation(null), "");
  assert.equal(normalizeLocation(undefined), "");
});

test("isLikelySameTitle flags real near-duplicate wording — two sources naming the same exhibition differently", () => {
  assert.equal(isLikelySameTitle("Inauguración de la muestra 'Raíces del Sur'", "Raíces del Sur: exposición fotográfica"), true);
});

test("isLikelySameTitle does NOT flag two different exhibitions that just share generic art-event vocabulary and a comuna name — a single shared word isn't enough", () => {
  assert.equal(isLikelySameTitle("Exposición de pintura en Copiapó", "Exposición de escultura en Copiapó"), false);
});

test("isLikelySameTitle requires real word overlap, not just a shared short/common word", () => {
  assert.equal(isLikelySameTitle("El color y la forma", "El agua y la tierra"), false);
});

test("isLikelySameTitle: the exact real trio from the ARTEPUERTO audit finding is NOT flagged by title alone — confirms that bug was actually a location-string-normalization gap (fixed separately), not something title similarity could or should paper over", () => {
  assert.equal(isLikelySameTitle("ARTEPUERTO 2026", "ARTEPUERTO+CASAPLAN"), false);
  assert.equal(isLikelySameTitle("ARTEPUERTO 2026", "Muestra gráfica en casa Bachmann - ARTEPUERTO 2026"), false);
});

test("isLikelySameTitle: identical titles are trivially similar", () => {
  assert.equal(isLikelySameTitle("Dejar Atrás", "Dejar Atrás"), true);
});

// Real production bug, found 2026-08-12: run.ts's strict location+date
// dedup tier used plain isLikelySameTitle, which passed for 2 genuinely
// different MAC - Parque Forestal exhibitions purely because uchile.cl/
// artes.uchile.cl bakes the venue name into every title.
test("isLikelySameTitleIgnoringPlaceName: plain isLikelySameTitle wrongly flags 2 different exhibitions sharing a venue baked into both titles, but ignoring placeName's own words correctly tells them apart", () => {
  const a = 'Muestra "Nazca/Sudamericana" en el MAC Parque Forestal';
  const b = 'Exposición "Obras extraordinarias" en el MAC Parque Forestal';
  assert.equal(isLikelySameTitle(a, b), true, "sanity check: this is the actual bug — plain isLikelySameTitle is fooled");
  assert.equal(isLikelySameTitleIgnoringPlaceName(a, b, "MAC - Parque Forestal"), false);
});

test("isLikelySameTitleIgnoringPlaceName still flags a real repost once the venue's own words are set aside", () => {
  assert.equal(
    isLikelySameTitleIgnoringPlaceName(
      "Inauguración de la muestra 'Raíces del Sur' en el MAC Parque Forestal",
      "Raíces del Sur: exposición fotográfica en el MAC Parque Forestal",
      "MAC - Parque Forestal",
    ),
    true,
  );
});

test("isLikelySameTitleIgnoringPlaceName with a null placeName behaves exactly like isLikelySameTitle", () => {
  assert.equal(isLikelySameTitleIgnoringPlaceName("Dejar Atrás", "Dejar Atrás", null), true);
  assert.equal(isLikelySameTitleIgnoringPlaceName("El color y la forma", "El agua y la tierra", null), false);
});

// Real case, found 2026-07-28 evaluating balmacedartejoven.cl as a
// candidate bright source: the same real exhibition is titled completely
// differently on chilecultura.gob.cl (a full descriptive title) vs. the
// venue's own site (a terse internal lab code name) — low Jaccard (2 of 7
// total distinct words) but high overlap (2 of the shorter title's only 3
// words), which the overlap-coefficient branch added alongside Jaccard
// now catches.
test("isLikelySameTitle flags a terse internal-code title that's mostly a SUBSET of a longer descriptive one, even when Jaccard alone would miss it (real case: chilecultura.gob.cl vs. balmacedartejoven.cl)", () => {
  assert.equal(
    isLikelySameTitle(
      "Estado de Posibilidad: Exposición del Laboratorio I de Artes Visuales",
      "LAB#1: «Estado de Posibilidad»",
    ),
    true,
  );
});

// The overlap-coefficient branch must stay gated on shared >= 2, same as
// Jaccard — otherwise a title that's ENTIRELY a subset of another (overlap
// = 1.0) would qualify off a single shared proper noun, re-opening exactly
// the ARTEPUERTO false-positive class the shared >= 2 floor exists to
// prevent.
test("isLikelySameTitle's overlap-coefficient branch still requires 2+ shared words — a single-word title fully contained in another doesn't qualify alone", () => {
  assert.equal(isLikelySameTitle("ARTEPUERTO", "Feria ARTEPUERTO de Verano en Valparaíso"), false);
});

// Real case, found 2026-07-29 auditing production data: 8 exhibitions at
// the same physical MAC - Quinta Normal venue got inserted twice, once
// from arteinformado.com ("MAC - Museo de Arte Contemporáneo") and once
// from uchile.cl ("MAC - Quinta Normal") — same venue, worded differently.
test("placeNamesLikelySame flags the same venue named differently by two sources, once generic venue-type words are stripped", () => {
  assert.equal(placeNamesLikelySame("MAC - Museo de Arte Contemporáneo", "MAC - Quinta Normal"), true);
});

test("placeNamesLikelySame requires a real single-word match — not two names that just both mention a generic venue-type word", () => {
  assert.equal(placeNamesLikelySame("Museo Regional de Ancud", "Museo Nacional de Bellas Artes"), false);
});

test("placeNamesLikelySame does NOT flag two genuinely different venues that happen to share a comuna — the exact case run.ts's own dedup test guards against", () => {
  assert.equal(placeNamesLikelySame("Balmaceda Arte Joven", "Centro Cultural Otro Lugar"), false);
});

test("placeNamesLikelySame treats a null/empty placeName on either side as 'no signal' rather than a veto", () => {
  assert.equal(placeNamesLikelySame(null, "MAC - Quinta Normal"), true);
  assert.equal(placeNamesLikelySame("MAC - Quinta Normal", null), true);
  assert.equal(placeNamesLikelySame(null, null), true);
});

test("placeNamesLikelySame: identical placeName strings trivially match", () => {
  assert.equal(placeNamesLikelySame("Balmaceda Arte Joven", "Balmaceda Arte Joven"), true);
});

// Real gap found 2026-08-14 (factor__f, "BOTÁNICA"): two Instagram posts
// about the same real opening, worded almost entirely differently beyond
// the exhibition name itself.
const BOTANICA_POST_1 = 'Mañana es el día. Te invitamos a la inauguración de BOTÁNICA, jueves 13 de agosto a las 19:00 hrs en Factor F.';
const BOTANICA_POST_2 = 'Anota la fecha: el jueves 13 de agosto inauguramos BOTÁNICA, nuestra nueva muestra colectiva.';

test("isLikelySameTitleSharingAnyWord: real case — two differently-worded captions about the same opening share only 1+ significant word, which is enough here (unlike isLikelySameTitle's stricter ratio, which misses this case)", () => {
  assert.equal(isLikelySameTitleSharingAnyWord(BOTANICA_POST_1, BOTANICA_POST_2, "Factor F"), true);
  assert.equal(isLikelySameTitle(BOTANICA_POST_1, BOTANICA_POST_2), false, "confirms this really is the gap being fixed — the stricter check still misses it");
});

test("isLikelySameTitleSharingAnyWord ignores the venue's own words, same as isLikelySameTitleIgnoringPlaceName — a shared venue name alone isn't enough", () => {
  assert.equal(isLikelySameTitleSharingAnyWord("Inauguración BOTÁNICA en Factor F", "Cierre RETRATOS en Factor F", "Factor F"), false);
});

test("isLikelySameTitleSharingAnyWord requires at least one real shared word — completely unrelated titles at the same venue don't match", () => {
  assert.equal(isLikelySameTitleSharingAnyWord("Taller de cerámica", "Concierto de jazz", "Factor F"), false);
});

test("isWithinAnchorWindow: dates exactly at the window boundary count as within it", () => {
  assert.equal(isWithinAnchorWindow("2026-07-01", "2026-07-31", 30), true);
  assert.equal(isWithinAnchorWindow("2026-07-01", "2026-08-01", 30), false);
});

test("isWithinAnchorWindow is symmetric regardless of argument order", () => {
  assert.equal(isWithinAnchorWindow("2026-07-30", "2026-07-01"), isWithinAnchorWindow("2026-07-01", "2026-07-30"));
});

test("isWithinAnchorWindow: the same date is always within any window", () => {
  assert.equal(isWithinAnchorWindow("2026-07-30", "2026-07-30", 0), true);
});

test("isWithinAnchorWindow defaults to a 30-day window", () => {
  assert.equal(isWithinAnchorWindow("2026-07-01", "2026-07-29"), true);
  assert.equal(isWithinAnchorWindow("2026-07-01", "2026-08-05"), false);
});
