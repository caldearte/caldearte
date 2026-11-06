import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventCandidate } from "./discover.js";
import { buildSeenKeys, findExistingMatch, type ExistingEventInfo } from "./run.js";

// The sourceUrl tier between candidates of one batch (run.ts's
// sameSourceUrlUnlessDistinctShow), replayed over the real posts and pages:
// the shows it dropped for sharing a url with a sibling, and the shapes that
// must stay one event.

const POST = "https://www.instagram.com/p/De0CJgtBsCU/";
const VENUE = "Centro Cultural Las Condes";

function row(title: string, overrides: Partial<ExistingEventInfo> = {}): ExistingEventInfo {
  return {
    id: title,
    title,
    placeName: VENUE,
    sourceUrl: POST,
    openingDatetime: null,
    openingTimeConfirmed: false,
    runStartDate: "2026-10-22",
    runEndDate: "2026-11-01",
    location: "Las Condes",
    ...overrides,
  };
}

function candidate(title: string, overrides: Partial<EventCandidate> = {}): EventCandidate {
  return {
    title,
    description: null,
    artist: null,
    eventType: "exposicion",
    runStartDate: "2026-10-22",
    runEndDate: "2026-11-01",
    openingDatetime: null,
    openingTimeConfirmed: false,
    mediumType: "tradicional",
    sensitivityTags: [],
    curationReasoning: "Exposición en el centro cultural.",
    rejectionAxis: null,
    imageUrl: null,
    status: "approved",
    location: "Las Condes",
    placeName: VENUE,
    address: null,
    sourceUrl: POST,
    sourceAccount: null,
    artistInstagramHandle: null,
    ...overrides,
  } as EventCandidate;
}

// `rows` as insertCandidates leaves them: in `seen`, the last one holding the
// url, and all of them registered as inserted from this batch.
function afterInserting(...rows: ExistingEventInfo[]) {
  const seen = buildSeenKeys(rows);
  const insertedFromBatch = new Map<string, ExistingEventInfo[]>();
  for (const r of rows) insertedFromBatch.set(r.sourceUrl as string, [...(insertedFromBatch.get(r.sourceUrl as string) ?? []), r]);
  return { seen, insertedFromBatch };
}

test("shows lost next to a sibling from their own post or page are different shows", () => {
  const pairs: Array<[string, string, string]> = [
    ["Coreografías involuntarias: habitar el Metro de Santiago", "Geometría del agua", VENUE],
    ["Te creo paisaje", "Mi amigo chileno", "Museo Nacional de Bellas Artes"],
    ["Tránsitos. Del Mediterráneo al Pacífico", "Herbarium minerale. Relatos, extracción y profundidad", "MAC Parque Forestal"],
    ["Flora perpetua", "Raku Vitrina", "Galería Biophilia"],
    ["La magia del inconsciente", "Topología del vacío", VENUE],
    ["Tarde, mal o nunca", "Selección de obras", "NIDO Lucía"],
    // One shared function word ("los") is not a shared name.
    ["Los colores del Ermitaño", "La aventura de los fósforos", "Universidad de Concepción Campus Los Ángeles"],
  ];
  for (const [first, second, placeName] of pairs) {
    const { seen, insertedFromBatch } = afterInserting(row(first, { placeName }));
    const m = findExistingMatch(candidate(second, { placeName }), seen, insertedFromBatch);
    assert.equal(m.existingMatch, undefined, second);
  }
});

test("works with no dates at all, the usual shape of a caption", () => {
  const dates = { runStartDate: null, runEndDate: null };
  const { seen, insertedFromBatch } = afterInserting(row("Flora perpetua", dates));
  assert.equal(findExistingMatch(candidate("Raku Vitrina", dates), seen, insertedFromBatch).sourceUrlMatch, undefined);
});

test("a guided visit stays with its show, sharing its title or not", () => {
  const { seen, insertedFromBatch } = afterInserting(row("Ballroom"));
  assert.equal(findExistingMatch(candidate("Ballroom - Visita guiada"), seen, insertedFromBatch).sourceUrlMatch?.title, "Ballroom");

  for (const title of ["Visita Guiada", "Recorrido guiado por la muestra", "Visitas mediadas", "Mediación junto a artistas expositores"]) {
    const m = findExistingMatch(candidate(title), seen, insertedFromBatch);
    assert.equal(m.sourceUrlMatch?.title, "Ballroom", title);
  }
});

test("a title with nothing of its own stays with the show next to it", () => {
  const { seen, insertedFromBatch } = afterInserting(row("Flora perpetua"));
  for (const title of ["Exposición", "Muestra en el Centro Cultural Las Condes"]) {
    assert.equal(findExistingMatch(candidate(title), seen, insertedFromBatch).sourceUrlMatch?.title, "Flora perpetua", title);
  }
});

test("copies of the same title stop at the title tier ('ANATOMICA' ×3)", () => {
  const { seen, insertedFromBatch } = afterInserting(row("ANATOMICA"));
  assert.equal(findExistingMatch(candidate("ANATOMICA"), seen, insertedFromBatch).titleMatch?.title, "ANATOMICA");
});

test("every sibling counts, not just the last one that took the url", () => {
  const { seen, insertedFromBatch } = afterInserting(row("Foro de las Artes"), row("Raku Vitrina"));
  assert.equal(seen.sourceUrls.get(POST)?.title, "Raku Vitrina");
  assert.equal(findExistingMatch(candidate("Foro de las Artes: segunda edición"), seen, insertedFromBatch).sourceUrlMatch?.title, "Foro de las Artes");
});

test("a row from an earlier run keeps the old behavior, whatever its title", () => {
  const seen = buildSeenKeys([row("Pintura y fósforos protagonizan nuevas exposiciones")]);
  const m = findExistingMatch(candidate("Los colores del Ermitaño"), seen, new Map());
  assert.equal(m.sourceUrlMatch?.title, "Pintura y fósforos protagonizan nuevas exposiciones");
  assert.ok(findExistingMatch(candidate("Los colores del Ermitaño"), seen).sourceUrlMatch, "wouldInsertAsNew passes no batch");
});

test("a sibling from another url of the batch changes nothing", () => {
  const seen = buildSeenKeys([row("Pintura y fósforos protagonizan nuevas exposiciones")]);
  const other = row("Raku Vitrina", { sourceUrl: "https://www.instagram.com/p/DfS6-tTpirP/" });
  const m = findExistingMatch(candidate("Los colores del Ermitaño"), seen, new Map([[other.sourceUrl as string, [other]]]));
  assert.ok(m.sourceUrlMatch);
});
