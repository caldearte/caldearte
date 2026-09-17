import { test } from "node:test";
import assert from "node:assert/strict";
import type { CurateResult, EventCandidate } from "../event-discovery/discover.js";
import type { BrightSourceItem } from "../event-discovery/extractors.js";
import { applySafetyNet, safetyNetVetoes } from "./safety-net.js";

function candidate(overrides: Partial<EventCandidate>): EventCandidate {
  return {
    title: "Expo",
    description: null,
    artist: null,
    eventType: "exposicion",
    runStartDate: "2026-09-20",
    runEndDate: "2026-10-20",
    openingDatetime: null,
    openingTimeConfirmed: false,
    mediumType: "tradicional",
    sensitivityTags: [],
    curationReasoning: "Exposición de pintura en galería.",
    rejectionAxis: null,
    imageUrl: null,
    status: "approved",
    location: "Santiago",
    placeName: null,
    address: null,
    sourceUrl: "https://www.instagram.com/p/AAA/",
    sourceAccount: "galeria",
    artistInstagramHandle: null,
    ...overrides,
  } as EventCandidate;
}

const item = (sourceUrl: string): BrightSourceItem => ({ title: "t", description: "d", sourceUrl, imageUrl: null, publishedDate: null }) as BrightSourceItem;

// Real case 2026-09-15: Haiku approved "Los archivos de Gabriela", the
// shadow model rejected it as a documentary/heritage show.
test("safetyNetVetoes flags an approval the second model rejected on scope", () => {
  const real = [candidate({ title: "Los archivos de Gabriela" })];
  const shadow = [candidate({ title: "Los archivos de Gabriela", status: "rejected", curationReasoning: "Muestra documental/patrimonial, no arte visual." })];
  assert.deepEqual(safetyNetVetoes(real, shadow), [
    { sourceUrl: "https://www.instagram.com/p/AAA/", reasoning: "Muestra documental/patrimonial, no arte visual.", rejectionAxis: null },
  ]);
});

test("safetyNetVetoes carries the second model's rejection axis", () => {
  const real = [candidate({ title: "The Art of Zhen Shan Ren" })];
  const shadow = [candidate({ status: "rejected", curationReasoning: "Promueve un movimiento religioso.", rejectionAxis: "religion" as EventCandidate["rejectionAxis"] })];
  assert.equal(safetyNetVetoes(real, shadow)[0].rejectionAxis, "religion");
});

test("safetyNetVetoes never vetoes on a code-filter rejection, a missing item, or a split verdict", () => {
  const real = [
    candidate({ sourceUrl: "https://www.instagram.com/p/CODE/" }),
    candidate({ sourceUrl: "https://www.instagram.com/p/MISSING/" }),
    candidate({ sourceUrl: "https://www.instagram.com/p/SPLIT/" }),
    candidate({ sourceUrl: "https://www.instagram.com/p/SPLIT/", title: "Second" }),
  ];
  const shadow = [
    // The second model approved it; only the deterministic filter rejected its version.
    candidate({ sourceUrl: "https://www.instagram.com/p/CODE/", status: "rejected", curationReasoning: "Exposición de fotografía. [FILTRO DE CÓDIGO: sin fecha de inauguración confirmada; rechazado]" }),
    candidate({ sourceUrl: "https://www.instagram.com/p/SPLIT/", status: "rejected", curationReasoning: "Taller, fuera de alcance." }),
    candidate({ sourceUrl: "https://www.instagram.com/p/SPLIT/", title: "Second", status: "approved" }),
  ];
  assert.deepEqual(safetyNetVetoes(real, shadow), []);
});

test("safetyNetVetoes ignores Haiku's own rejections", () => {
  const real = [candidate({ status: "rejected", curationReasoning: "Concierto." })];
  const shadow = [candidate({ status: "rejected", curationReasoning: "Concierto." })];
  assert.deepEqual(safetyNetVetoes(real, shadow), []);
});

test("applySafetyNet sends only the approved items, rewrites the vetoed candidates as rejections, and keeps the rest", async () => {
  const candidates = [
    candidate({ title: "Buena", sourceUrl: "https://www.instagram.com/p/GOOD/" }),
    candidate({ title: "Documental", sourceUrl: "https://www.instagram.com/p/DOC/" }),
    candidate({ title: "Concierto", sourceUrl: "https://www.instagram.com/p/NO/", status: "rejected", curationReasoning: "Concierto." }),
  ];
  const items = [item("https://www.instagram.com/p/GOOD/"), item("https://www.instagram.com/p/DOC/"), item("https://www.instagram.com/p/NO/")];
  let reviewed: string[] = [];
  const curateFn = async (_client: unknown, reviewItems: BrightSourceItem[]): Promise<CurateResult> => {
    reviewed = reviewItems.map((i) => i.sourceUrl);
    return {
      candidates: [
        candidate({ title: "Buena", sourceUrl: "https://www.instagram.com/p/GOOD/" }),
        candidate({ title: "Documental", sourceUrl: "https://www.instagram.com/p/DOC/", status: "rejected", curationReasoning: "Muestra documental, no arte visual." }),
      ],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  };
  const vetoed = await applySafetyNet({ client: { messages: { create: async () => ({}) } } as never, model: "test-model" }, candidates, items, curateFn);
  assert.deepEqual(reviewed, ["https://www.instagram.com/p/GOOD/", "https://www.instagram.com/p/DOC/"]);
  assert.equal(vetoed, 1);
  assert.equal(candidates[0].status, "approved");
  assert.equal(candidates[1].status, "rejected");
  assert.match(candidates[1].curationReasoning, /^\[VETO red de seguridad test-model\] Muestra documental, no arte visual\. — Haiku había aprobado: /);
  assert.equal(candidates[2].curationReasoning, "Concierto.");
});

test("applySafetyNet keeps every approval when the second model's call fails", async () => {
  const candidates = [candidate({ title: "Buena" })];
  const curateFn = async (): Promise<CurateResult> => {
    throw new Error("OpenRouter request failed: 429");
  };
  const vetoed = await applySafetyNet({ client: {} as never, model: "test-model" }, candidates, [item("https://www.instagram.com/p/AAA/")], curateFn);
  assert.equal(vetoed, 0);
  assert.equal(candidates[0].status, "approved");
});
