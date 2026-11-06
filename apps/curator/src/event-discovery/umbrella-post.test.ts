import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventCandidate } from "./discover.js";
import { isUmbrellaOfSiblings } from "./run.js";

// isUmbrellaOfSiblings (run.ts), replayed over the real posts: the two
// Galpón Independencia umbrellas it exists for, and the shapes it must leave
// alone because a false positive here loses a real show.

const POST = "https://www.instagram.com/p/DfQXhD7psZh/";
const CAPTION =
  "¡Seguimos con las puertas abiertas en Galpón Independencia!\n\nDos exposiciones, cinco artistas.\n\nENTRE TIERRA Y ASFALTO\n\nCIMIENTOS";

function candidate(overrides: Partial<EventCandidate>): EventCandidate {
  return {
    title: "Entre tierra y asfalto",
    description: CAPTION,
    artist: null,
    eventType: "exposicion",
    runStartDate: "2026-11-02",
    runEndDate: "2026-11-19",
    openingDatetime: null,
    openingTimeConfirmed: false,
    mediumType: "tradicional",
    sensitivityTags: [],
    curationReasoning: "Exposición en Galpón Independencia.",
    imageUrl: null,
    status: "approved",
    location: "Santiago",
    placeName: "Galpón Independencia",
    sourceUrl: POST,
    ...overrides,
  } as EventCandidate;
}

const umbrella = candidate({ title: "¡Seguimos con las puertas abiertas en Galpón Independencia!" });

test("the post's opening line is an umbrella next to the shows it announces, in any order", () => {
  const shows = [candidate({}), candidate({ title: "Cimientos" })];
  assert.equal(isUmbrellaOfSiblings(umbrella, [umbrella, ...shows]), true);
  assert.equal(isUmbrellaOfSiblings(umbrella, [...shows, umbrella]), true);
});

test("the 2026-10-26 umbrella, with no run dates at all", () => {
  const description = "Este sábado 31 de octubre inauguramos dos nuevas muestras !\nENTRE TIERRA Y ASFALTO y CIMIENTOS";
  const dates = { runStartDate: null, runEndDate: null, description };
  const first = candidate({ ...dates, title: "Este sábado 31 de octubre inauguramos dos nuevas muestras !" });
  assert.equal(isUmbrellaOfSiblings(first, [first, candidate({ ...dates, title: "CIMIENTOS" })]), true);
});

test("the named shows of the post are never umbrellas", () => {
  const show = candidate({});
  assert.equal(isUmbrellaOfSiblings(show, [umbrella, show, candidate({ title: "Cimientos" })]), false);
});

test("alone in its post it stays: it is the only listing that post has", () => {
  assert.equal(isUmbrellaOfSiblings(umbrella, [umbrella]), false);
});

test("repeated copies of the same title are not named siblings ('¡Este octubre La Menuda se multiplica!')", () => {
  const description = "¡Este octubre La Menuda se multiplica! ✨\nEstaremos en tres galerías";
  const first = candidate({ title: "¡Este octubre La Menuda se multiplica! ✨", description });
  assert.equal(isUmbrellaOfSiblings(first, [first, candidate({ title: first.title, description })]), false);
});

test("a sibling at another venue does not cover it", () => {
  assert.equal(isUmbrellaOfSiblings(umbrella, [umbrella, candidate({ placeName: "Galería Metropolitana" })]), false);
});

test("a sibling the curation rejected does not cover it", () => {
  assert.equal(isUmbrellaOfSiblings(umbrella, [umbrella, candidate({ status: "rejected" })]), false);
});

test("a show named by the caption's first line stays when it is not an exclamation", () => {
  const description = "PROCESOS DE MISTIFICACIÓN\n\nUna muestra colectiva.";
  const show = candidate({ title: "PROCESOS DE MISTIFICACIÓN", description });
  assert.equal(isUmbrellaOfSiblings(show, [show, candidate({ title: "Exposición colectiva SAFA", description })]), false);
});

test("an exclamation quoted further down the caption is a real title, not the opening line", () => {
  const description = 'Inauguramos dos muestras: "¡Viva la cumbia!" y "Cimientos".';
  const show = candidate({ title: "¡Viva la cumbia!", description });
  assert.equal(isUmbrellaOfSiblings(show, [show, candidate({ title: "Cimientos", description })]), false);
});
