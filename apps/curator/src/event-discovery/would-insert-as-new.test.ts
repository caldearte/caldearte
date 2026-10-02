import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventCandidate } from "./discover.js";
import { buildSeenKeys, findExistingMatch, wouldInsertAsNew, type ExistingEventInfo } from "./run.js";

// What the MiniMax safety net reviews (see wouldInsertAsNew's own doc
// comment): approved candidates that would really become NEW events.

const NOW = new Date("2026-10-02T15:00:00.000Z");

function candidate(overrides: Partial<EventCandidate>): EventCandidate {
  return {
    title: "Muestra nueva",
    description: null,
    artist: null,
    eventType: "exposicion",
    runStartDate: "2026-09-20",
    runEndDate: "2026-11-20",
    openingDatetime: null,
    openingTimeConfirmed: false,
    mediumType: "tradicional",
    sensitivityTags: [],
    curationReasoning: "Exposición de pintura en galería.",
    rejectionAxis: null,
    imageUrl: null,
    status: "approved",
    location: "Santiago",
    placeName: "Galería Uno",
    address: null,
    sourceUrl: "https://www.instagram.com/p/NEW/",
    sourceAccount: "galeria",
    artistInstagramHandle: null,
    ...overrides,
  } as EventCandidate;
}

function stored(overrides: Partial<ExistingEventInfo>): ExistingEventInfo {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Muestra guardada",
    placeName: "Galería Uno",
    sourceUrl: "https://www.instagram.com/p/OLD/",
    openingDatetime: null,
    openingTimeConfirmed: false,
    runStartDate: "2026-09-20",
    runEndDate: "2026-11-20",
    location: "Santiago",
    ...overrides,
  };
}

test("wouldInsertAsNew: an approved, current candidate matching nothing stored is a new event worth a second opinion", () => {
  const seen = buildSeenKeys([stored({ title: "Otra exposición distinta", placeName: "Museo Lejano", location: "Valdivia", sourceUrl: "https://www.instagram.com/p/FAR/" })]);
  assert.equal(wouldInsertAsNew(candidate({}), seen, NOW), true);
});

test("wouldInsertAsNew: a duplicate of something already stored is NOT reviewed — insertCandidates drops it anyway", () => {
  const seen = buildSeenKeys([stored({ title: "Muestra nueva" })]);
  assert.equal(wouldInsertAsNew(candidate({ title: "Muestra nueva" }), seen, NOW), false);
});

test("wouldInsertAsNew: a candidate whose source URL is already stored is not reviewed", () => {
  const seen = buildSeenKeys([stored({ title: "Un título completamente distinto", sourceUrl: "https://www.instagram.com/p/NEW/" })]);
  assert.equal(wouldInsertAsNew(candidate({}), seen, NOW), false);
});

test("wouldInsertAsNew: an already-expired candidate is not reviewed (insertCandidates rejects it as expired)", () => {
  const seen = buildSeenKeys([]);
  assert.equal(wouldInsertAsNew(candidate({ runStartDate: "2026-05-01", runEndDate: "2026-06-01" }), seen, NOW), false);
});

test("wouldInsertAsNew: Haiku's own rejections and approvals without a sourceUrl are never reviewed", () => {
  const seen = buildSeenKeys([]);
  assert.equal(wouldInsertAsNew(candidate({ status: "rejected" }), seen, NOW), false);
  assert.equal(wouldInsertAsNew(candidate({ sourceUrl: null }), seen, NOW), false);
});

test("findExistingMatch reports WHICH tier matched and leaves `seen` untouched (it is read-only)", () => {
  const seen = buildSeenKeys([stored({ title: "Muestra nueva" })]);
  const before = JSON.stringify([...seen.titles.keys()]);
  const matches = findExistingMatch(candidate({ title: "Muestra nueva" }), seen);
  assert.ok(matches.titleMatch, "an exact normalized title is the first tier");
  assert.equal(matches.existingMatch, matches.titleMatch);
  assert.equal(JSON.stringify([...seen.titles.keys()]), before);

  const none = findExistingMatch(candidate({ title: "Nada que ver", placeName: "Museo Lejano", location: "Valdivia", sourceUrl: "https://www.instagram.com/p/ZZZ/" }), seen);
  assert.equal(none.existingMatch, undefined);
});
