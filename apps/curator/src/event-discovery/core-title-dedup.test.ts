import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventCandidate } from "./discover.js";
import { buildSeenKeys, findExistingMatch, type ExistingEventInfo } from "./run.js";

// coreTitleMatch (run.ts's findCoreTitleMatch), replayed over the real
// pairs found doubled on the live site on 2026-10-13: arteinformado.com
// stored first (2026-07-24, bare title, "MAC - Museo de Arte
// Contemporáneo", comuna "Santiago"), uchile.cl/artes.uchile.cl arrived
// later (2026-08-23, agenda-sentence title, "MAC - Quinta Normal" /
// "MAC - Parque Forestal", comuna "Quinta Normal").

function stored(overrides: Partial<ExistingEventInfo>): ExistingEventInfo {
  return {
    id: "arteinformado-row",
    title: "Materia sensible",
    placeName: "MAC - Museo de Arte Contemporáneo",
    sourceUrl: "https://www.arteinformado.com/agenda/f/materia-sensible-243861",
    openingDatetime: "2026-04-24T23:00:00+00:00",
    openingTimeConfirmed: true,
    runStartDate: "2026-04-25",
    runEndDate: "2026-08-23",
    location: "Santiago",
    ...overrides,
  };
}

function uchile(overrides: Partial<EventCandidate>): EventCandidate {
  return {
    title: 'Muestra "Materia sensible" en el Museo de Arte Contemporáneo',
    description: null,
    artist: null,
    eventType: "exposicion",
    runStartDate: "2026-04-25",
    runEndDate: "2026-08-23",
    openingDatetime: null,
    openingTimeConfirmed: false,
    mediumType: "tradicional",
    sensitivityTags: [],
    curationReasoning: "Exposición en el MAC.",
    rejectionAxis: null,
    imageUrl: null,
    status: "approved",
    location: "Quinta Normal",
    placeName: "MAC - Quinta Normal",
    address: null,
    sourceUrl: "https://uchile.cl/agenda/239637/muestra-materia-sensible-en-el-museo-de-arte-contemporaneo",
    sourceAccount: null,
    artistInstagramHandle: null,
    ...overrides,
  } as EventCandidate;
}

const QUINTA_NORMAL_PAIRS: Array<[string, string]> = [
  ['Muestra "Materia sensible" en el Museo de Arte Contemporáneo', "Materia sensible"],
  ['Exhibición "La espiga y el oro" en el MAC Quinta Normal', "La espiga y el oro"],
  ['Exposición "Vestiario" en el Museo de Arte Contemporáneo', "Vestiario"],
  ['Exhibición "La memoria de los umbrales" en el MAC Quinta Normal', "La memoria de los umbrales"],
  ['Exposición "Hallazgo, réplica, ficción" en Museo de Arte Contemporáneo', "Hallazgo, réplica, ficción"],
  ['Muestra "Poética de las aguas" en el Museo de Arte Contemporáneo', "Poética de las Aguas"],
  ['Muestra "Rama torcida" en el Museo de Arte Contemporáneo', "Rama torcida"],
];

test("coreTitleMatch: the 7 real MAC Quinta Normal pairs (2026-10-13) now match — and no older tier did", () => {
  for (const [uchileTitle, arteinformadoTitle] of QUINTA_NORMAL_PAIRS) {
    const seen = buildSeenKeys([stored({ title: arteinformadoTitle })]);
    const m = findExistingMatch(uchile({ title: uchileTitle }), seen);
    assert.equal(m.coreTitleMatch?.id, "arteinformado-row", uchileTitle);
    assert.equal(m.existingMatch?.id, "arteinformado-row", uchileTitle);
    // The miss being fixed: every pre-existing tier came back empty.
    assert.equal(m.titleMatch ?? m.sourceUrlMatch ?? m.locationDateMatch ?? m.fuzzyMatch ?? m.sameVenueMatch, undefined, uchileTitle);
  }
});

test("coreTitleMatch: also in the other crawl order (uchile stored first, arteinformado arriving)", () => {
  const seen = buildSeenKeys([
    stored({
      id: "uchile-row",
      title: 'Exposición "Vestiario" en el Museo de Arte Contemporáneo',
      placeName: "MAC - Quinta Normal",
      location: "Quinta Normal",
      openingDatetime: null,
      openingTimeConfirmed: false,
    }),
  ]);
  const m = findExistingMatch(uchile({ title: "Vestiario", placeName: "MAC - Museo de Arte Contemporáneo", location: "Santiago" }), seen);
  assert.equal(m.existingMatch?.id, "uchile-row");
});

test("coreTitleMatch: the real Colección MAC pair — bare title vs the same title with its subtitle, identical run", () => {
  const seen = buildSeenKeys([
    stored({
      title: "Colección MAC. Modulaciones de la imagen fotográfica",
      location: "Parque Forestal, Santiago",
      runStartDate: "2026-07-11",
      runEndDate: "2026-10-11",
    }),
  ]);
  const m = findExistingMatch(
    uchile({ title: 'Exposición "Colección MAC" en el Museo MAC', placeName: "MAC - Parque Forestal", location: "Santiago", runStartDate: "2026-07-11", runEndDate: "2026-10-11" }),
    seen,
  );
  assert.equal(m.coreTitleMatch?.id, "arteinformado-row");
});

test("coreTitleMatch: no false merge across the MAC Parque Forestal temporada — different shows, same venue, same season dates", () => {
  const season = { runStartDate: "2026-07-11", runEndDate: "2026-10-11" };
  const seen = buildSeenKeys([
    stored({ id: "nazca", title: "Nazca/Sudamericana: Capítulo II, Sudamericana tiene memoria del aire", placeName: "MAC Parque Forestal", ...season }),
    stored({ id: "tierras", title: "Tierras Raras. Quadra Minerale", placeName: "MAC Parque Forestal", ...season }),
    stored({ id: "bestiarios", title: 'Muestra "Bestiarios Rudimentarios" en el Museo de Arte Contemporáneo', placeName: "MAC - Parque Forestal", ...season }),
  ]);
  for (const title of ['Exposición "Obras extraordinarias" en el MAC Parque Forestal', "Obras extraordinarias", 'Exposición "Colección MAC" en el Museo MAC']) {
    const m = findExistingMatch(uchile({ title, placeName: "MAC - Parque Forestal", location: "Santiago", ...season }), seen);
    assert.equal(m.coreTitleMatch, undefined, title);
  }
});

test("coreTitleMatch: a bare main title pointing at TWO subtitled shows in the same season merges with neither", () => {
  const season = { runStartDate: "2026-07-11", runEndDate: "2026-10-11" };
  const seen = buildSeenKeys([
    stored({ id: "x", title: "Colección MAC: Modulaciones de la imagen fotográfica", ...season }),
    stored({ id: "y", title: "Colección MAC: Escultura y espacio", ...season }),
  ]);
  const m = findExistingMatch(uchile({ title: 'Exposición "Colección MAC" en el Museo MAC', placeName: "MAC - Parque Forestal", ...season }), seen);
  assert.equal(m.coreTitleMatch, undefined);
});

test("coreTitleMatch: a subtitled candidate does not take over a bare title when another subtitled sibling is already stored", () => {
  const season = { runStartDate: "2026-07-11", runEndDate: "2026-10-11" };
  const seen = buildSeenKeys([
    stored({ id: "bare", title: 'Exposición "Colección MAC" en el Museo MAC', placeName: "MAC - Parque Forestal", ...season }),
    stored({ id: "y", title: "Colección MAC: Escultura y espacio", ...season }),
  ]);
  const m = findExistingMatch(uchile({ title: "Colección MAC. Modulaciones de la imagen fotográfica", placeName: "MAC - Museo de Arte Contemporáneo", ...season }), seen);
  assert.equal(m.coreTitleMatch, undefined);
});

test("coreTitleMatch: the subtitle branch needs the identical run — the Quinta Normal 'Colección MAC: Modulaciones' (07-18 → 09-27) is not the Parque Forestal one", () => {
  const seen = buildSeenKeys([
    stored({ title: "Colección MAC: Modulaciones de la imagen fotográfica", placeName: "MAC Quinta Normal", runStartDate: "2026-07-18", runEndDate: "2026-09-27" }),
  ]);
  const m = findExistingMatch(
    uchile({ title: 'Exposición "Colección MAC" en el Museo MAC', placeName: "MAC - Parque Forestal", runStartDate: "2026-07-11", runEndDate: "2026-10-11" }),
    seen,
  );
  assert.equal(m.coreTitleMatch, undefined);
});

test("coreTitleMatch: an equal core title still needs a venue that shares a word, and a venue on both sides", () => {
  const seen = buildSeenKeys([stored({ title: "Vestiario", placeName: "Galería Patricia Ready" })]);
  assert.equal(findExistingMatch(uchile({ title: 'Exposición "Vestiario" en el Museo de Arte Contemporáneo' }), seen).coreTitleMatch, undefined);

  const noVenue = buildSeenKeys([stored({ title: "Vestiario", placeName: null })]);
  assert.equal(findExistingMatch(uchile({ title: 'Exposición "Vestiario" en el Museo de Arte Contemporáneo' }), noVenue).coreTitleMatch, undefined);
});

test("coreTitleMatch: an equal core title with runs that do not overlap is a different show (a venue re-running a title next year)", () => {
  const seen = buildSeenKeys([stored({ title: "Vestiario", runStartDate: "2025-04-25", runEndDate: "2025-08-23" })]);
  assert.equal(findExistingMatch(uchile({ title: 'Exposición "Vestiario" en el Museo de Arte Contemporáneo' }), seen).coreTitleMatch, undefined);
});

test("coreTitleMatch: a different end date still matches when the runs start the same day — one source with a wrong end date", () => {
  const seen = buildSeenKeys([stored({ title: "Vestiario", runEndDate: "2026-08-30", openingDatetime: null, openingTimeConfirmed: false })]);
  assert.equal(findExistingMatch(uchile({ title: 'Exposición "Vestiario" en el Museo de Arte Contemporáneo' }), seen).coreTitleMatch?.id, "arteinformado-row");
});

test("coreTitleMatch: merely overlapping runs do not merge — the real split-sede show (Colección MAC, Parque Forestal 07-11 → 10-11 and Quinta Normal 07-18 → 09-27)", () => {
  const seen = buildSeenKeys([
    stored({ title: "Colección MAC. Modulaciones de la imagen fotográfica", location: "Parque Forestal, Santiago", runStartDate: "2026-07-11", runEndDate: "2026-10-11" }),
  ]);
  const quintaNormal = uchile({
    title: "Colección MAC: Modulaciones de la imagen fotográfica",
    placeName: "MAC Quinta Normal",
    location: "Santiago",
    runStartDate: "2026-07-18",
    runEndDate: "2026-09-27",
    sourceUrl: "https://mac.uchile.cl/exposiciones/coleccion-mac-modulaciones-de-la-imagen-fotografica-2/",
  });
  assert.equal(findExistingMatch(quintaNormal, seen).coreTitleMatch, undefined);
});
