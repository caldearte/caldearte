import { test } from "node:test";
import assert from "node:assert/strict";
import {
  flagBudgetExceeded,
  sendRunSummaryEmail,
  buildSubject,
  buildBody,
  buildHtmlBody,
  sendHeadlessRunSummaryEmail,
  buildHeadlessSubject,
  buildHeadlessBody,
  buildHeadlessHtmlBody,
  type RunSummary,
  type HeadlessRunSummary,
} from "./notify.js";

test("flagBudgetExceeded: no-ops when GITHUB_TOKEN/GITHUB_REPOSITORY are unset", async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalRepo = process.env.GITHUB_REPOSITORY;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_REPOSITORY;

  try {
    // Should resolve without throwing and without making any network call.
    await flagBudgetExceeded({ spend: 12.5, budget: 10 });
  } finally {
    if (originalToken !== undefined) process.env.GITHUB_TOKEN = originalToken;
    if (originalRepo !== undefined) process.env.GITHUB_REPOSITORY = originalRepo;
  }

  assert.ok(true);
});

const fixtureSummary: RunSummary = {
  startedAt: new Date(2026, 6, 18, 6, 0, 0),
  units: { total: 2, failed: ["Puente Alto"] },
  comunas: ["Santiago", "Puente Alto"],
  brightSources: { due: 5, total: 12 },
  candidates: {
    total: 10,
    approvedByCuration: 6,
    rejectedByCuration: 4,
    insertedCount: 5,
    byMediumType: { tradicional: 8, intervencion_no_tradicional: 2 },
    sensitivityTagged: 1,
  },
  eventGroups: [
    {
      label: "Santiago",
      candidates: [
        {
          title: "Expo real en el GAM",
          status: "approved",
          location: "Santiago",
          placeName: "GAM",
          runStartDate: "2026-08-01",
          runEndDate: "2026-08-30",
          curationReasoning: "Exposición de arte visual en espacio legítimo.",
          sourceUrl: "https://x.cl/expo-real",
        },
        {
          title: "Taller de cerámica",
          status: "rejected",
          location: "Santiago",
          placeName: null,
          runStartDate: null,
          runEndDate: null,
          curationReasoning: "Es un taller, no una exposición — fuera de alcance.",
          sourceUrl: "https://x.cl/taller",
        },
      ],
    },
  ],
  cost: {
    anthropicUsd: 0.118,
    tavilyCredits: 12,
    tavilyUsd: 0.096,
    totalUsd: 0.214,
    monthToDateUsd: 4.32,
    monthlyBudgetUsd: 50,
  },
};

test("sendRunSummaryEmail: no-ops with a warning when RESEND_API_KEY is unset", async () => {
  const original = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    // Should resolve without throwing and without making any network call.
    await sendRunSummaryEmail(fixtureSummary);
  } finally {
    if (original !== undefined) process.env.RESEND_API_KEY = original;
  }

  assert.ok(true);
});

test("buildSubject includes the comuna count", () => {
  assert.equal(buildSubject(fixtureSummary), "Caldearte — resumen de Event Discovery (18/07/2026, 2 comunas)");
});

test("buildBody includes the key figures: comunas, failed units, event counts, and cost breakdown", () => {
  const body = buildBody(fixtureSummary);
  assert.match(body, /Santiago, Puente Alto/);
  assert.match(body, /1: Puente Alto/);
  assert.match(body, /Total candidatos: 10/);
  assert.match(body, /Aprobados por curatoría: 6/);
  assert.match(body, /Rechazados por curatoría: 4/);
  assert.match(body, /Insertados en el calendario: 5/);
  assert.match(body, /Con tag de sensibilidad: 1/);
  assert.match(body, /tradicional: 8/);
  assert.match(body, /intervencion_no_tradicional: 2/);
  assert.match(body, /Anthropic \(Haiku\): \$0\.1180/);
  assert.match(body, /Tavily \(12 créditos × \$0\.008\): \$0\.0960/);
  assert.match(body, /Total: \$0\.2140/);
  assert.match(body, /\$4\.32 de \$50\.00/);
});

test("buildBody handles the no-failures, no-bright-sources-due edge case cleanly", () => {
  const body = buildBody({
    ...fixtureSummary,
    units: { total: 1, failed: [] },
    brightSources: { due: 0, total: 12 },
  });
  assert.match(body, /UNIDADES FALLIDAS\n\(ninguna\)/);
  assert.match(body, /0 de 12 debidas/);
});

test("buildBody's text fallback lists both approved and rejected candidates, grouped by source", () => {
  const body = buildBody(fixtureSummary);
  assert.match(body, /-- Santiago \(2\) --/);
  assert.match(body, /\[OK\] Expo real en el GAM/);
  assert.match(body, /\[RECHAZADO\] Taller de cerámica/);
  assert.match(body, /Es un taller, no una exposición — fuera de alcance\./);
});

test("buildHtmlBody renders a table with both approved and rejected candidates, source link, and reasoning", () => {
  const html = buildHtmlBody(fixtureSummary);
  assert.match(html, /Santiago \(2\)/);
  assert.match(html, /✅ Aprobado/);
  assert.match(html, /❌ Rechazado/);
  assert.match(html, /<a href="https:\/\/x\.cl\/expo-real"[^>]*>Expo real en el GAM<\/a>/);
  assert.match(html, /Taller de cerámica/);
  assert.match(html, /Es un taller, no una exposición — fuera de alcance\./);
  assert.match(html, /GAM/);
});

test("buildHtmlBody omits empty groups and degrades cleanly with zero eventGroups", () => {
  const html = buildHtmlBody({ ...fixtureSummary, eventGroups: [{ label: "Empty Comuna", candidates: [] }] });
  assert.doesNotMatch(html, /Empty Comuna/);

  const emptyHtml = buildHtmlBody({ ...fixtureSummary, eventGroups: [] });
  assert.doesNotMatch(emptyHtml, /<table/);
});

const fixtureHeadlessSummary: HeadlessRunSummary = {
  startedAt: new Date(2026, 6, 20, 7, 0, 0),
  sourcesFetched: ["https://mavi.uc.cl/exposiciones-actuales/"],
  candidates: {
    total: 3,
    approvedByCuration: 2,
    rejectedByCuration: 1,
    insertedCount: 2,
    byMediumType: { tradicional: 3 },
    sensitivityTagged: 0,
  },
  eventGroups: [
    {
      label: "https://mavi.uc.cl/exposiciones-actuales/",
      candidates: [
        {
          title: "Muestra en el MAVI",
          status: "approved",
          location: "Santiago",
          placeName: "Museo de Artes Visuales MAVI UC",
          runStartDate: "2026-07-01",
          runEndDate: "2026-09-01",
          curationReasoning: "Exposición de arte visual en museo legítimo.",
          sourceUrl: "https://mavi.uc.cl/exposiciones/muestra",
        },
      ],
    },
  ],
  cost: { anthropicUsd: 0.02, tavilyCredits: 0, tavilyUsd: 0, totalUsd: 0.02, monthToDateUsd: 4.34, monthlyBudgetUsd: 50 },
};

test("sendHeadlessRunSummaryEmail: no-ops with a warning when RESEND_API_KEY is unset", async () => {
  const original = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    await sendHeadlessRunSummaryEmail(fixtureHeadlessSummary);
  } finally {
    if (original !== undefined) process.env.RESEND_API_KEY = original;
  }

  assert.ok(true);
});

test("buildHeadlessSubject includes the source count", () => {
  assert.equal(
    buildHeadlessSubject(fixtureHeadlessSummary),
    "Caldearte — resumen de fuentes brillantes (headless) (20/07/2026, 1 fuente(s))",
  );
});

test("buildHeadlessBody includes the sources fetched, event counts, and cost breakdown — no comunas/failed-units sections, unlike buildBody", () => {
  const body = buildHeadlessBody(fixtureHeadlessSummary);
  assert.match(body, /FUENTES CONSULTADAS \(1\)/);
  assert.match(body, /https:\/\/mavi\.uc\.cl\/exposiciones-actuales\//);
  assert.match(body, /Total candidatos: 3/);
  assert.match(body, /Insertados en el calendario: 2/);
  assert.match(body, /Anthropic \(Haiku\): \$0\.0200/);
  assert.match(body, /\$4\.34 de \$50\.00/);
  assert.doesNotMatch(body, /COMUNAS/);
  assert.doesNotMatch(body, /UNIDADES FALLIDAS/);
});

test("buildHeadlessBody handles no sources due cleanly", () => {
  const body = buildHeadlessBody({ ...fixtureHeadlessSummary, sourcesFetched: [] });
  assert.match(body, /FUENTES CONSULTADAS \(0\)\n\(ninguna debida esta corrida\)/);
});

test("buildHeadlessHtmlBody renders the MAVI event table with source link and venue", () => {
  const html = buildHeadlessHtmlBody(fixtureHeadlessSummary);
  assert.match(html, /mavi\.uc\.cl\/exposiciones-actuales\/ \(1\)/);
  assert.match(html, /✅ Aprobado/);
  assert.match(html, /Muestra en el MAVI/);
  assert.match(html, /Museo de Artes Visuales MAVI UC/);
});
