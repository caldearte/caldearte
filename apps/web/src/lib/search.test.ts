import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventRecord } from "./events";
import { buildSearchPlaces, eventTense, matchRange, rankEvent, rankText, searchAll, type SearchIndex } from "./search";

function ev(over: Partial<EventRecord>): EventRecord {
  return {
    id: over.id ?? "e",
    title: "Muestra",
    artist: null,
    description: null,
    freeformLocation: "Galería X, Santiago",
    placeName: "Galería X",
    address: null,
    regionName: "Santiago",
    imageUrl: null,
    sensitivityTags: [],
    sourceUrl: null,
    openingTimeConfirmed: true,
    eventType: "exposicion",
    openingDatetime: null,
    runStartDate: null,
    runEndDate: null,
    ...over,
  };
}

const TODAY = "2026-10-13";

test("rankText: exact, starts, word start, anywhere, accent-insensitive", () => {
  assert.equal(rankText("Santiago", "santiago"), 0);
  assert.equal(rankText("Santiago Centro", "santia"), 1);
  assert.equal(rankText("Villa Alemana", "alem"), 2);
  assert.equal(rankText("Artespacio", "espacio"), 3);
  assert.equal(rankText("Valparaíso", "valparaiso"), 0);
  assert.equal(rankText("Ñuñoa", "nunoa"), 0);
  assert.equal(rankText("Galería", "xyz"), null);
  assert.equal(rankText(null, "x"), null);
});

test("rankText: several words match apart and in any order, each at a word start", () => {
  const title = "MATERIA: Encuentro Juvenil de Artes Visuales";
  assert.equal(rankText(title, "materia juvenil"), 3);
  assert.equal(rankText(title, "juvenil materia"), 3);
  assert.equal(rankText(title, "mat juv"), 3);
  // Every word has to be there, at the start of a word.
  assert.equal(rankText(title, "materia pintura"), null);
  assert.equal(rankText(title, "materia uvenil"), null);
});

test("rankEvent: a title match beats the same match on the venue", () => {
  const byTitle = ev({ title: "Paisajes del sur" });
  const byVenue = ev({ title: "Otra cosa", placeName: "Paisajes Galería" });
  assert.equal(rankEvent(byTitle, "paisajes"), 1);
  assert.equal(rankEvent(byVenue, "paisajes"), 2);
});

test("eventTense: ahead, running, past", () => {
  assert.equal(eventTense(ev({ openingDatetime: "2026-10-15T22:00:00Z" }), TODAY), 0);
  assert.equal(eventTense(ev({ openingDatetime: "2026-09-01T22:00:00Z", runEndDate: "2026-10-30" }), TODAY), 1);
  assert.equal(eventTense(ev({ runStartDate: "2026-08-01", runEndDate: "2026-09-01" }), TODAY), 2);
  assert.equal(eventTense(ev({ runStartDate: "2026-11-01", runEndDate: "2026-11-30" }), TODAY), 0);
});

const index: SearchIndex = {
  events: [
    ev({ id: "past", title: "Zabala retrospectiva", runStartDate: "2026-01-01", runEndDate: "2026-02-01" }),
    ev({ id: "running", title: "Zabala hoy", runStartDate: "2026-09-01", runEndDate: "2026-10-30" }),
    ev({ id: "ahead", title: "Zabala pronto", openingDatetime: "2026-10-20T22:00:00Z" }),
  ],
  venues: [{ name: "Galería Artespacio", href: "/espacios/a", meta: "Vitacura", count: 6 }],
  artists: [{ name: "Maite Zabala", href: "/artistas/m", meta: null, count: 2 }],
  places: buildSearchPlaces([
    { name: "Santiago", adminRegionName: "Región Metropolitana de Santiago" },
    { name: "Villa Alemana", adminRegionName: "Valparaíso" },
    { name: "Valparaíso", adminRegionName: "Valparaíso" },
  ]),
};

test("searchAll: the group with the best match comes first", () => {
  assert.equal(searchAll(index, "artesp", TODAY)[0].kind, "venues");
  assert.equal(searchAll(index, "villa", TODAY)[0].kind, "places");
  // "zabala": events named "Zabala…" (start, 1) beat the artist "Maite Zabala" (word start, 2).
  const zabala = searchAll(index, "zabala", TODAY);
  assert.deepEqual(zabala.map((g) => g.kind), ["events", "artists"]);
});

test("searchAll: events read ahead, then running, then past", () => {
  const events = searchAll(index, "zabala", TODAY).find((g) => g.kind === "events");
  assert.deepEqual(events?.items.map((e) => (e as EventRecord).id), ["ahead", "running", "past"]);
});

test("searchAll: under 3 letters only names that start so, no events", () => {
  const groups = searchAll(index, "va", TODAY);
  assert.ok(groups.every((g) => g.kind !== "events"));
  assert.deepEqual(groups.map((g) => g.kind), ["places"]);
});

test("buildSearchPlaces: one row per región, comunas point at it, no repeat of a same-named comuna", () => {
  const places = buildSearchPlaces([
    { name: "Valparaíso", adminRegionName: "Valparaíso" },
    { name: "Villa Alemana", adminRegionName: "Valparaíso" },
  ]);
  assert.equal(places.filter((p) => p.comuna === null).length, 1);
  assert.deepEqual(places.filter((p) => p.comuna !== null).map((p) => p.comuna), ["Villa Alemana"]);
});

test("matchRange: finds the match in the original text, accents included", () => {
  assert.deepEqual(matchRange("Galería Artespacio", "galeria"), [0, 7]);
  assert.deepEqual(matchRange("Maite Zabala", "zab"), [6, 9]);
  assert.equal(matchRange("Maite", "x"), null);
});

test("searchAll: a región is found by its full name too", () => {
  const groups = searchAll(index, "metropolitana", TODAY);
  const places = groups.find((g) => g.kind === "places");
  assert.equal(places?.items.length, 1);
});

test("searchAll: among good matches the date decides, not where the word sits", () => {
  const idx: SearchIndex = {
    ...index,
    events: [
      ev({ id: "past-start", title: "Paisajes en tránsito", runStartDate: "2026-09-01", runEndDate: "2026-09-20" }),
      ev({ id: "ahead-word", title: "Componiendo Paisajes", openingDatetime: "2026-10-15T22:00:00Z" }),
    ],
  };
  const events = searchAll(idx, "paisaje", TODAY).find((g) => g.kind === "events");
  assert.deepEqual(events?.items.map((e) => (e as EventRecord).id), ["ahead-word", "past-start"]);
});
