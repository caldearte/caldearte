import { test } from "node:test";
import assert from "node:assert/strict";
import { findSubmissionMatches, santiagoDate, type LiveEventForMatch, type SubmissionForMatch } from "./submission-match.js";

const RM = "55a66de1-aff0-4a28-a2a8-a59fe5956a1b";
const OTHER_REGION = "00000000-0000-0000-0000-000000000002";

// The real submission, 2026-11-12: "Rotten" at Casa
// Chagual. Its Instagram twin (468fa980) was removed by hand.
const rotten: SubmissionForMatch = {
  title: "Rotten",
  placeName: "Casa chagual",
  regionId: RM,
  openingDatetime: "2026-11-20T22:00:00.000Z",
  runEndDate: "2026-12-11",
};

function live(overrides: Partial<LiveEventForMatch> & Pick<LiveEventForMatch, "id" | "title">): LiveEventForMatch {
  return { place_name: null, region_id: RM, opening_datetime: null, run_start_date: null, run_end_date: null, ...overrides };
}

// Real rows, as stored on 2026-11-20.
const rottenFromInstagram = live({
  id: "468fa980",
  title: "Rotten",
  place_name: "Merced 633",
  opening_datetime: "2026-11-20 22:00:00+00",
  run_end_date: "2026-12-11",
});
const casaChagualOtherShows = [
  live({ id: "dc392d8c", title: "Quipu_ del Registro Ausente", place_name: "Casa Chagual", opening_datetime: "2026-10-30 22:00:00+00", run_end_date: "2026-11-13" }),
  live({ id: "a27cf03e", title: "Espacios velados", place_name: "Casa Chagual", opening_datetime: "2026-09-25 22:00:00+00", run_start_date: "2026-09-25", run_end_date: "2026-10-16" }),
  live({ id: "cbbca8aa", title: "Reliquia", place_name: "Casa Chagual", opening_datetime: "2026-08-07 23:00:00+00" }),
];

test("Rotten: the Instagram row is superseded even though it stored the street address as its venue", () => {
  const { supersede, possible } = findSubmissionMatches(rotten, [rottenFromInstagram, ...casaChagualOtherShows]);
  assert.deepEqual(supersede.map((e) => e.id), ["468fa980"]);
  assert.deepEqual(possible, []);
});

test("Same venue, same day, same title words: superseded", () => {
  const s: SubmissionForMatch = { ...rotten, title: "Cartografía del Fuego", placeName: "Hifas Galería" };
  const e = live({ id: "x", title: "Inauguración Cartografía del Fuego", place_name: "hifas.galeria Hifas", opening_datetime: "2026-11-20 22:00:00+00" });
  assert.deepEqual(findSubmissionMatches(s, [e]).supersede.map((r) => r.id), ["x"]);
});

test("A caption sentence stored as the title, same venue and day: only flagged, never removed", () => {
  const e = live({
    id: "caption",
    title: "Te invitamos este viernes a nuestra nueva muestra",
    place_name: "Casa Chagual",
    opening_datetime: "2026-11-20 22:00:00+00",
  });
  const { supersede, possible } = findSubmissionMatches(rotten, [e]);
  assert.deepEqual(supersede, []);
  assert.deepEqual(possible.map((r) => r.id), ["caption"]);
});

test("MAC Parque Forestal shape — two real shows, same venue, same opening minute, different titles: not superseded", () => {
  const s: SubmissionForMatch = {
    title: "Tierras Raras. Quadra Minerale",
    placeName: "MAC - Parque Forestal",
    regionId: RM,
    openingDatetime: "2026-11-20T22:00:00.000Z",
    runEndDate: "2027-01-18",
  };
  const e = live({ id: "obras", title: "Obras extraordinarias", place_name: "MAC Parque Forestal", opening_datetime: "2026-11-20 22:00:00+00", run_end_date: "2027-01-18" });
  assert.deepEqual(findSubmissionMatches(s, [e]).supersede, []);
});

test("Identical title without a venue match needs the closing day too", () => {
  const otherClosing = { ...rottenFromInstagram, id: "y", run_end_date: "2026-12-20" };
  const { supersede, possible } = findSubmissionMatches(rotten, [otherClosing]);
  assert.deepEqual(supersede, []);
  assert.deepEqual(possible.map((r) => r.id), ["y"]); // same title + same opening day
});

test("Identical title without a venue match needs the same región", () => {
  const elsewhere = { ...rottenFromInstagram, id: "z", region_id: OTHER_REGION };
  assert.deepEqual(findSubmissionMatches(rotten, [elsewhere]).supersede, []);
});

test("Different región vetoes the venue signal even when the venue names share a word", () => {
  const s: SubmissionForMatch = { ...rotten, title: "Paisajes del sur", placeName: "Casa de la Cultura" };
  const e = live({ id: "w", title: "Paisajes del sur", place_name: "Casa de la Cultura", region_id: OTHER_REGION, opening_datetime: "2026-11-20 22:00:00+00", run_end_date: "2026-12-30" });
  assert.deepEqual(findSubmissionMatches(s, [e]).supersede, []);
});

test("A row with no venue at all never counts as the same venue", () => {
  const s: SubmissionForMatch = { ...rotten, title: "Paisajes del sur" };
  const e = live({ id: "v", title: "Paisajes del sur", opening_datetime: "2026-11-20 22:00:00+00", run_end_date: "2026-12-30" });
  assert.deepEqual(findSubmissionMatches(s, [e]).supersede, []);
});

test("santiagoDate: a 21:30 opening is still that day in Santiago, not the next UTC day", () => {
  assert.equal(santiagoDate("2026-11-21T00:30:00.000Z"), "2026-11-20");
});
