import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventCandidate } from "./discover.js";
import { isCaptionSentenceTitle, labelTitle, readableTitle } from "./caption-sentence-title.js";

// The 5 live titles found 2026-11-16 (title, caption opening), and real show
// titles that must stay untouched.

const LEAKS: [string, string][] = [
  [
    "Te invitamos a una visita guiada dialogada junto al destacado periodista y escritor mapuche Pedro Cayuqueo, autor de His",
    "Te invitamos a una visita guiada dialogada junto al destacado periodista y escritor mapuche Pedro Cayuqueo, autor de Historia secreta mapuche, cuya obra ha contribuido",
  ],
  [
    "La obra de la ilustradora inglesa Marianne North es reconocida por su capacidad de registrar la flora y fauna de distint",
    "La obra de la ilustradora inglesa Marianne North es reconocida por su capacidad de registrar la flora y fauna de distintos países, incluido el nuestro",
  ],
  ["Entrada liberada este domingo en el MUG-UPLA 🖋💓", "Entrada liberada este domingo en el MUG-UPLA 🖋💓\n\nEl domingo 8 de noviembre ven a conocer nuestra exposición"],
  [
    "Algunas de las obras que estamos mostrando en @espacioandreabrunson hasta mediados de noviembre 🌖",
    "Algunas de las obras que estamos mostrando en @espacioandreabrunson hasta mediados de noviembre 🌖 \n\nLos esperamos ✨",
  ],
  ["¡Este octubre La Menuda se multiplica! ✨", "¡Este octubre La Menuda se multiplica! ✨\nEstaremos junto a Leo Benito @leobenito.art"],
];

for (const [title, caption] of LEAKS) {
  test(`caption sentence: ${title.slice(0, 40)}`, () => {
    assert.equal(isCaptionSentenceTitle(title, caption), true);
  });
}

const REAL: [string, string][] = [
  ["KYNOPHOBIA", "KYNOPHOBIA\n\nInauguramos este jueves la muestra de…"],
  ["PROCESOS DE MISTIFICACIÓN", "PROCESOS DE MISTIFICACIÓN\nExposición colectiva"],
  [
    "ANIMALIA: Una lectura contemporánea del tejido en fibra vegetal a través del imaginario animal",
    "ANIMALIA: Una lectura contemporánea del tejido en fibra vegetal a través del imaginario animal\n\nInaugura el 18",
  ],
  // A real name with an emoji, but too short to be a sentence.
  ["Lienzos Sonoros 🎶", "Lienzos Sonoros 🎶\nInauguración viernes 19:00"],
  // Haiku's own title, not the caption's opening: never touched.
  ["Historia secreta mapuche", "Te invitamos a una visita guiada dialogada junto al destacado periodista…"],
];

for (const [title, caption] of REAL) {
  test(`real title kept: ${title.slice(0, 40)}`, () => {
    assert.equal(isCaptionSentenceTitle(title, caption), false);
  });
}

test("no description, nothing to compare against", () => {
  assert.equal(isCaptionSentenceTitle("¡Este octubre La Menuda se multiplica! ✨", null), false);
});

test("labels: artist for shows and openings, venue for guided visits", () => {
  assert.equal(labelTitle({ eventType: "exposicion", artist: "Leo Benito", placeName: "Galeria La Caracola" }), "Exposición de Leo Benito");
  assert.equal(labelTitle({ eventType: "inauguracion", artist: null, placeName: "MUG-UPLA" }), "Inauguración en MUG-UPLA");
  assert.equal(
    labelTitle({ eventType: "visita_guiada", artist: "Pedro Cayuqueo", placeName: "Centro Cultural de Los Ángeles" }),
    "Visita guiada en Centro Cultural de Los Ángeles",
  );
  assert.equal(labelTitle({ eventType: "exposicion", artist: null, placeName: null }), null);
});

test("readableTitle keeps the sentence when nothing better is known", () => {
  const c = {
    title: "Entrada liberada este domingo en el MUG-UPLA 🖋💓",
    description: "Entrada liberada este domingo en el MUG-UPLA 🖋💓\n\nVen",
    eventType: "exposicion",
    artist: null,
    placeName: null,
  } as unknown as EventCandidate;
  assert.equal(readableTitle(c), c.title);
  assert.equal(readableTitle({ ...c, placeName: "MUG-UPLA" }), "Exposición en MUG-UPLA");
});
