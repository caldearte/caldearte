import { test } from "node:test";
import assert from "node:assert/strict";
import { selectInauguraciones, selectNoTeLaPierdas, selectDestacada, type SocialEvent } from "./selection.js";

function makeEvent(overrides: Partial<SocialEvent> & { id: string }): SocialEvent {
  return {
    title: `Evento ${overrides.id}`,
    artist: null,
    placeName: null,
    comunaName: "Santiago",
    imageUrl: "https://example.com/img.jpg",
    description: "Una descripción real y suficientemente larga para pasar el filtro de calidad mínimo.",
    sensitivityTags: [],
    openingDatetime: null,
    openingTimeConfirmed: true,
    runStartDate: null,
    runEndDate: null,
    // Defaults to "inauguracion" — matches the pre-event_type behavior
    // these existing tests were written against (any confirmed
    // openingDatetime treated as an inauguración); tests specifically
    // about the eventType filter override this explicitly.
    eventType: "inauguracion",
    sourceAccount: null,
    ...overrides,
  };
}

const week = { start: "2026-08-17", end: "2026-08-23" };

test("selectInauguraciones: orders by opening date ascending", () => {
  const events = [
    makeEvent({ id: "b", openingDatetime: "2026-08-20T22:00:00+00:00" }),
    makeEvent({ id: "a", openingDatetime: "2026-08-17T22:00:00+00:00" }),
  ];
  const result = selectInauguraciones(events, week);
  assert.deepEqual(
    result.map((e) => e.id),
    ["a", "b"],
  );
});

test("selectInauguraciones: excludes events opening outside the week", () => {
  const events = [
    makeEvent({ id: "in", openingDatetime: "2026-08-20T22:00:00+00:00" }),
    makeEvent({ id: "before", openingDatetime: "2026-08-10T22:00:00+00:00" }),
    makeEvent({ id: "after", openingDatetime: "2026-08-30T22:00:00+00:00" }),
  ];
  const result = selectInauguraciones(events, week);
  assert.deepEqual(
    result.map((e) => e.id),
    ["in"],
  );
});

test("selectInauguraciones: excludes sensitive-tagged events", () => {
  const events = [
    makeEvent({ id: "safe", openingDatetime: "2026-08-20T22:00:00+00:00" }),
    makeEvent({ id: "sensitive", openingDatetime: "2026-08-20T22:00:00+00:00", sensitivityTags: ["desnudo_erotismo"] }),
  ];
  const result = selectInauguraciones(events, week);
  assert.deepEqual(
    result.map((e) => e.id),
    ["safe"],
  );
});

test("selectInauguraciones: excludes events with no real photo — real bug found 2026-08-23 testing against production data, a flyer with no image would render broken", () => {
  const events = [
    makeEvent({ id: "with-photo", openingDatetime: "2026-08-20T22:00:00+00:00" }),
    makeEvent({ id: "no-photo", openingDatetime: "2026-08-20T22:00:00+00:00", imageUrl: null }),
  ];
  const result = selectInauguraciones(events, week);
  assert.deepEqual(
    result.map((e) => e.id),
    ["with-photo"],
  );
});

test("selectInauguraciones: excludes events with a .webp photo — real bug found 2026-08-23, a real destacada post failed outright because Satori/next-og can't determine a .webp image's size", () => {
  const events = [
    makeEvent({ id: "jpeg-photo", openingDatetime: "2026-08-20T22:00:00+00:00" }),
    makeEvent({ id: "webp-photo", openingDatetime: "2026-08-20T22:00:00+00:00", imageUrl: "https://example.com/img.webp" }),
  ];
  const result = selectInauguraciones(events, week);
  assert.deepEqual(
    result.map((e) => e.id),
    ["jpeg-photo"],
  );
});

test("selectInauguraciones: excludes a visita_guiada event even with a valid openingDatetime in the week — real bug found 2026-08-29, both categories share the same date field, only eventType tells them apart", () => {
  const events = [
    makeEvent({ id: "real-opening", openingDatetime: "2026-08-20T22:00:00+00:00", eventType: "inauguracion" }),
    makeEvent({ id: "guided-tour", openingDatetime: "2026-08-21T22:00:00+00:00", eventType: "visita_guiada" }),
  ];
  const result = selectInauguraciones(events, week);
  assert.deepEqual(
    result.map((e) => e.id),
    ["real-opening"],
  );
});

test("selectNoTeLaPierdas: excludes events with no real photo", () => {
  const events = [makeEvent({ id: "with-photo", runEndDate: "2026-08-18" }), makeEvent({ id: "no-photo", runEndDate: "2026-08-18", imageUrl: null })];
  const result = selectNoTeLaPierdas(events, "2026-08-17", week, new Set());
  assert.deepEqual(
    result.map((e) => e.id),
    ["with-photo"],
  );
});

test("selectNoTeLaPierdas: orders by run end date ascending, within the current week only", () => {
  const events = [
    makeEvent({ id: "later", runEndDate: "2026-08-23" }),
    makeEvent({ id: "sooner", runEndDate: "2026-08-18" }),
    makeEvent({ id: "next-week", runEndDate: "2026-08-30" }),
    makeEvent({ id: "already-closed", runEndDate: "2026-08-10" }),
  ];
  const result = selectNoTeLaPierdas(events, "2026-08-17", week, new Set());
  assert.deepEqual(
    result.map((e) => e.id),
    ["sooner", "later"],
  );
});

test("selectNoTeLaPierdas: caps a heavy comuna at 2 instead of filling the whole carousel with it — real complaint 2026-08-23, a nationwide list still read as mostly Santiago", () => {
  const events = [
    makeEvent({ id: "s1", comunaName: "Santiago", runEndDate: "2026-08-18" }),
    makeEvent({ id: "s2", comunaName: "Santiago", runEndDate: "2026-08-19" }),
    makeEvent({ id: "s3", comunaName: "Santiago", runEndDate: "2026-08-20" }),
    makeEvent({ id: "v1", comunaName: "Valparaíso", runEndDate: "2026-08-21" }),
  ];
  const result = selectNoTeLaPierdas(events, "2026-08-17", week, new Set());
  assert.deepEqual(
    result.map((e) => e.id),
    ["s1", "v1", "s2"],
  );
});

test("selectNoTeLaPierdas: excludes events already posted this week (de-dup)", () => {
  const events = [
    makeEvent({ id: "fresh", runEndDate: "2026-08-19" }),
    makeEvent({ id: "already-posted", runEndDate: "2026-08-18" }),
  ];
  const result = selectNoTeLaPierdas(events, "2026-08-17", week, new Set(["already-posted"]));
  assert.deepEqual(
    result.map((e) => e.id),
    ["fresh"],
  );
});

test("selectDestacada: prefers events never featured, then longest-since-featured", () => {
  // Distinct comunas — otherwise MAX_PER_COMUNA's cap of 2 (see
  // selection.ts) would drop one of these 3 same-comuna events before
  // rotation ordering is even exercised.
  const events = [
    makeEvent({ id: "featured-recent", comunaName: "Santiago" }),
    makeEvent({ id: "never-featured", comunaName: "Valparaíso" }),
    makeEvent({ id: "featured-long-ago", comunaName: "Concepción" }),
  ];
  const lastFeaturedAt = new Map([
    ["featured-recent", "2026-08-15"],
    ["featured-long-ago", "2026-06-01"],
  ]);
  const result = selectDestacada(events, "2026-08-17", new Set(), lastFeaturedAt);
  assert.deepEqual(
    result.map((e) => e.id),
    ["never-featured", "featured-long-ago", "featured-recent"],
  );
});

test("selectDestacada: excludes events with no real photo or too-short description", () => {
  const events = [
    makeEvent({ id: "good" }),
    makeEvent({ id: "no-photo", imageUrl: null }),
    makeEvent({ id: "thin-description", description: "Muy corto." }),
    makeEvent({ id: "no-description", description: null }),
  ];
  const result = selectDestacada(events, "2026-08-17", new Set(), new Map());
  assert.deepEqual(
    result.map((e) => e.id),
    ["good"],
  );
});

test("selectDestacada: excludes events not currently running", () => {
  const events = [
    makeEvent({ id: "running", runStartDate: "2026-08-01", runEndDate: "2026-08-31" }),
    makeEvent({ id: "not-yet-open", runStartDate: "2026-09-01" }),
    makeEvent({ id: "already-closed", runEndDate: "2026-07-01" }),
  ];
  const result = selectDestacada(events, "2026-08-17", new Set(), new Map());
  assert.deepEqual(
    result.map((e) => e.id),
    ["running"],
  );
});

test("selectDestacada: caps a heavy comuna at 2 instead of filling the whole carousel with it", () => {
  const events = [
    makeEvent({ id: "s1", comunaName: "Santiago" }),
    makeEvent({ id: "s2", comunaName: "Santiago" }),
    makeEvent({ id: "s3", comunaName: "Santiago" }),
    makeEvent({ id: "v1", comunaName: "Valparaíso" }),
  ];
  const result = selectDestacada(events, "2026-08-17", new Set(), new Map());
  assert.deepEqual(
    result.map((e) => e.id).sort(),
    ["s1", "s2", "v1"].sort(),
  );
  assert.equal(result.length, 3);
});

test("all three selectors respect the carousel cap", () => {
  const many = Array.from({ length: 15 }, (_, i) =>
    makeEvent({
      id: `e${i}`,
      comunaName: `Comuna${i}`,
      openingDatetime: "2026-08-20T22:00:00+00:00",
      runStartDate: "2026-08-01",
      runEndDate: "2026-08-19",
    }),
  );
  assert.equal(selectInauguraciones(many, week).length, 10);
  assert.equal(selectNoTeLaPierdas(many, "2026-08-17", week, new Set()).length, 10);
  assert.equal(selectDestacada(many, "2026-08-17", new Set(), new Map()).length, 10);
});
