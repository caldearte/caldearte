import { test } from "node:test";
import assert from "node:assert/strict";
import { selectUpcoming, type SocialEvent } from "./selection.js";

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
    eventType: "inauguracion",
    sourceAccount: null,
    artistInstagramHandle: null,
    ...overrides,
  };
}

const window = { start: "2026-08-17", end: "2026-08-18" };

test("selectUpcoming: orders by opening date ascending", () => {
  const events = [
    makeEvent({ id: "b", openingDatetime: "2026-08-18T22:00:00+00:00" }),
    makeEvent({ id: "a", openingDatetime: "2026-08-17T14:00:00+00:00" }),
  ];
  const result = selectUpcoming(events, window, new Set());
  assert.deepEqual(
    result.map((e) => e.id),
    ["a", "b"],
  );
});

test("selectUpcoming: excludes events opening outside the window", () => {
  const events = [
    makeEvent({ id: "in", openingDatetime: "2026-08-17T22:00:00+00:00" }),
    makeEvent({ id: "before", openingDatetime: "2026-08-16T22:00:00+00:00" }),
    makeEvent({ id: "after", openingDatetime: "2026-08-19T22:00:00+00:00" }),
  ];
  const result = selectUpcoming(events, window, new Set());
  assert.deepEqual(
    result.map((e) => e.id),
    ["in"],
  );
});

test("selectUpcoming: mixes inauguracion and visita_guiada, excludes exposicion", () => {
  const events = [
    makeEvent({ id: "opening", openingDatetime: "2026-08-17T22:00:00+00:00", eventType: "inauguracion" }),
    makeEvent({ id: "tour", openingDatetime: "2026-08-18T14:00:00+00:00", eventType: "visita_guiada" }),
    makeEvent({ id: "expo", openingDatetime: "2026-08-17T22:00:00+00:00", eventType: "exposicion" }),
  ];
  const result = selectUpcoming(events, window, new Set());
  assert.deepEqual(
    result.map((e) => e.id),
    ["opening", "tour"],
  );
});

test("selectUpcoming: excludes sensitive-tagged events", () => {
  const events = [
    makeEvent({ id: "safe", openingDatetime: "2026-08-17T22:00:00+00:00" }),
    makeEvent({ id: "sensitive", openingDatetime: "2026-08-17T22:00:00+00:00", sensitivityTags: ["desnudo_erotismo"] }),
  ];
  const result = selectUpcoming(events, window, new Set());
  assert.deepEqual(
    result.map((e) => e.id),
    ["safe"],
  );
});

test("selectUpcoming: excludes events with no real photo — real bug found 2026-08-23 testing against production data, a flyer with no image would render broken", () => {
  const events = [
    makeEvent({ id: "with-photo", openingDatetime: "2026-08-17T22:00:00+00:00" }),
    makeEvent({ id: "no-photo", openingDatetime: "2026-08-17T22:00:00+00:00", imageUrl: null }),
  ];
  const result = selectUpcoming(events, window, new Set());
  assert.deepEqual(
    result.map((e) => e.id),
    ["with-photo"],
  );
});

test("selectUpcoming: excludes events with a .webp photo — real bug found 2026-08-23, Satori/next-og can't determine a .webp image's size", () => {
  const events = [
    makeEvent({ id: "jpeg-photo", openingDatetime: "2026-08-17T22:00:00+00:00" }),
    makeEvent({ id: "webp-photo", openingDatetime: "2026-08-17T22:00:00+00:00", imageUrl: "https://example.com/img.webp" }),
  ];
  const result = selectUpcoming(events, window, new Set());
  assert.deepEqual(
    result.map((e) => e.id),
    ["jpeg-photo"],
  );
});

test("selectUpcoming: excludes events already posted (ever, not just this week) — nothing repeats anymore under the 2026-08-31 redesign", () => {
  const events = [
    makeEvent({ id: "fresh", openingDatetime: "2026-08-17T22:00:00+00:00" }),
    makeEvent({ id: "already-posted", openingDatetime: "2026-08-18T14:00:00+00:00" }),
  ];
  const result = selectUpcoming(events, window, new Set(["already-posted"]));
  assert.deepEqual(
    result.map((e) => e.id),
    ["fresh"],
  );
});

test("selectUpcoming: respects the carousel cap", () => {
  const many = Array.from({ length: 15 }, (_, i) =>
    makeEvent({ id: `e${i}`, comunaName: `Comuna${i}`, openingDatetime: "2026-08-17T22:00:00+00:00" }),
  );
  assert.equal(selectUpcoming(many, window, new Set()).length, 10);
});

test("selectUpcoming: re-sorts chronologically after diversifying by comuna, even when that reorders across comunas", () => {
  // 3 comunas, 2 events each, 6 total (under the cap of 10, so nothing
  // gets truncated) — diversifyByComuna's own round-robin would emit
  // "each comuna's earliest" then "each comuna's second", which is NOT
  // globally chronological once dates interleave across comunas the way
  // they do here. selectUpcoming must re-sort its output, not trust
  // diversifyByComuna's own order.
  const events = [
    makeEvent({ id: "a-late", comunaName: "A", openingDatetime: "2026-08-18T20:00:00+00:00" }),
    makeEvent({ id: "b-early", comunaName: "B", openingDatetime: "2026-08-17T12:00:00+00:00" }),
    makeEvent({ id: "a-early", comunaName: "A", openingDatetime: "2026-08-17T13:00:00+00:00" }),
    makeEvent({ id: "c-mid", comunaName: "C", openingDatetime: "2026-08-18T00:00:00+00:00" }),
  ];
  const result = selectUpcoming(events, window, new Set());
  assert.deepEqual(
    result.map((e) => e.id),
    ["b-early", "a-early", "c-mid", "a-late"],
  );
});
