import { test } from "node:test";
import assert from "node:assert/strict";
import type { AdminVenue } from "./adminAnalytics";
import { DEFAULT_FILTERS, filterVenues, kindCounts, parseKindFilter } from "./espaciosFilter";

function venue(over: Partial<AdminVenue>): AdminVenue {
  return {
    id: over.name ?? "x",
    name: "x",
    comuna: null,
    adminRegionName: "Valparaíso",
    instagramHandle: null,
    kind: null,
    followsCaldearteAt: null,
    newsletterSubscribedAt: null,
    liveEvents: 1,
    lastOpening: null,
    ...over,
  };
}

const VENUES = [
  venue({ name: "Galería Réplica", kind: "institucional", liveEvents: 12, comuna: "Valdivia" }),
  venue({ name: "Casa Líquen", kind: "independiente", liveEvents: 3, adminRegionName: "Región de Magallanes y de la Antártica Chilena" }),
  venue({ name: "Espacio Nuevo", kind: null, liveEvents: 1 }),
  venue({ name: "Sala Vacía", kind: "municipal", liveEvents: 0 }),
];

test("default filters hide venues without live events and sort by events", () => {
  assert.deepEqual(
    filterVenues(VENUES, DEFAULT_FILTERS).map((v) => v.name),
    ["Galería Réplica", "Casa Líquen", "Espacio Nuevo"],
  );
});

test("kind, región and accent-insensitive search combine", () => {
  assert.deepEqual(filterVenues(VENUES, { ...DEFAULT_FILTERS, kind: "sin_clasificar" }).map((v) => v.name), ["Espacio Nuevo"]);
  assert.deepEqual(filterVenues(VENUES, { ...DEFAULT_FILTERS, query: "replica" }).map((v) => v.name), ["Galería Réplica"]);
  assert.deepEqual(filterVenues(VENUES, { ...DEFAULT_FILTERS, query: "valdivia" }).map((v) => v.name), ["Galería Réplica"], "searches comuna too");
  assert.deepEqual(
    filterVenues(VENUES, { ...DEFAULT_FILTERS, adminRegionName: "Región de Magallanes y de la Antártica Chilena" }).map((v) => v.name),
    ["Casa Líquen"],
  );
  assert.deepEqual(filterVenues(VENUES, { ...DEFAULT_FILTERS, onlyLive: false, kind: "municipal" }).map((v) => v.name), ["Sala Vacía"]);
});

test("sticky rows stay listed after their kind stops matching", () => {
  const classified = VENUES.map((v) => (v.name === "Espacio Nuevo" ? { ...v, kind: "municipal" as const } : v));
  const f = { ...DEFAULT_FILTERS, kind: "sin_clasificar" as const };
  assert.deepEqual(filterVenues(classified, f).map((v) => v.name), []);
  assert.deepEqual(filterVenues(classified, f, new Set(["Espacio Nuevo"])).map((v) => v.name), ["Espacio Nuevo"]);
});

test("kindCounts ignores the kind filter itself but respects the others", () => {
  const counts = kindCounts(VENUES, { ...DEFAULT_FILTERS, kind: "independiente" });
  assert.deepEqual(counts, { todos: 3, institucional: 1, municipal: 0, independiente: 1, sin_clasificar: 1 });
});

test("parseKindFilter falls back to todos for anything unknown", () => {
  assert.equal(parseKindFilter("sin_clasificar"), "sin_clasificar");
  assert.equal(parseKindFilter("municipal"), "municipal");
  assert.equal(parseKindFilter("otro"), "todos");
  assert.equal(parseKindFilter(undefined), "todos");
});
