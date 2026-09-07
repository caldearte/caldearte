import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDailyDigestSubject, buildDailyDigestBody, buildDailyDigestHtmlBody, type DailyDigestSummary } from "./daily-digest.js";

const baseCost: DailyDigestSummary["cost"] = {
  anthropicTodayUsd: 0.1,
  apifyTodayGrossUsd: 0.2,
  apifyTodayFreeUsd: 0.2,
  apifyTodayRealUsd: 0,
  anthropicMonthUsd: 3.45,
  apifyCycleGrossUsd: 4.21,
  apifyCycleFreeUsd: 4.21,
  apifyCycleRealUsd: 0,
  apifyCycleStartDate: "2026-08-13",
  monthlyBudgetUsd: 15,
};

const approvedCandidate = {
  title: "Muestra real",
  status: "approved" as const,
  location: "Santiago",
  placeName: "Galería X",
  runStartDate: "2026-08-27",
  runEndDate: "2026-09-10",
  curationReasoning: "ok",
  sourceUrl: "https://example.com/1",
  outcome: "inserted" as const,
};

const rejectedCandidate = {
  ...approvedCandidate,
  title: "Descartado",
  status: "rejected" as const,
  outcome: null,
};

function summaryWith(runs: DailyDigestSummary["runs"]): DailyDigestSummary {
  return { date: "2026-08-26", runs, cost: baseCost };
}

test("buildDailyDigestSubject reports the real date and how many pipelines ran, and counts only genuinely NEW (inserted) events", () => {
  const summary = summaryWith([
    {
      entrypoint: "instagram",
      startedAt: new Date("2026-08-26T08:17:00.000Z"),
      candidates: { total: 2, approvedByCuration: 1, rejectedByCuration: 1 },
      eventGroups: [{ label: "cuenta_x", candidates: [approvedCandidate, rejectedCandidate] }],
      costUsd: 0.05,
    },
    {
      entrypoint: "google_alerts",
      startedAt: new Date("2026-08-26T09:22:00.000Z"),
      candidates: { total: 0, approvedByCuration: 0, rejectedByCuration: 0 },
      eventGroups: [],
      costUsd: 0,
    },
  ]);

  const subject = buildDailyDigestSubject(summary);
  assert.match(subject, /26\/08\/2026/);
  assert.match(subject, /2 fuente\(s\)/);
  assert.match(subject, /1 evento\(s\) nuevo\(s\)/, "only the 'inserted' outcome counts as genuinely new, not the rejected one");
});

test("buildDailyDigestSubject reports zero new events when nothing was inserted (e.g. all duplicates or rejections)", () => {
  const summary = summaryWith([
    {
      entrypoint: "headless",
      startedAt: new Date("2026-08-26T07:12:00.000Z"),
      candidates: { total: 1, approvedByCuration: 0, rejectedByCuration: 1 },
      eventGroups: [{ label: "fuente_y", candidates: [rejectedCandidate] }],
      costUsd: 0,
    },
  ]);

  assert.match(buildDailyDigestSubject(summary), /0 evento\(s\) nuevo\(s\)/);
});

test("buildDailyDigestBody lists every pipeline that ran today with its own counts, plus a consolidated cost section", () => {
  const summary = summaryWith([
    {
      entrypoint: "instagram",
      startedAt: new Date("2026-08-26T08:17:00.000Z"),
      candidates: { total: 2, approvedByCuration: 1, rejectedByCuration: 1 },
      eventGroups: [{ label: "cuenta_x", candidates: [approvedCandidate, rejectedCandidate] }],
      costUsd: 0.05,
    },
  ]);

  const body = buildDailyDigestBody(summary);
  assert.match(body, /Instagram/);
  assert.match(body, /2 candidatos · 1 aprobados · 1 rechazados/);
  assert.match(body, /COSTO/);
  assert.match(body, /\$15\.00/, "monthly budget ceiling must appear");
  assert.match(body, /DETALLE POR EVENTO/);
  assert.match(body, /Muestra real/, "the approved candidate's own title must appear in the per-event detail section");
  assert.match(body, /Descartado/, "the rejected candidate's own title must appear too — the detail section covers both");
});

test("buildDailyDigestBody's cost section separates Apify's real (billed) cost from what the free tier already covered", () => {
  const summary = summaryWith([]);
  const body = buildDailyDigestBody(summary);
  assert.match(body, /\$0\.2000 cubierto por capa gratuita/);
  assert.match(body, /\$0\.0000 real de \$0\.2000 bruto/);
});

test("buildDailyDigestHtmlBody renders a row per pipeline and includes the per-event detail tables", () => {
  const summary = summaryWith([
    {
      entrypoint: "event_discovery",
      startedAt: new Date("2026-08-26T06:07:00.000Z"),
      candidates: { total: 1, approvedByCuration: 1, rejectedByCuration: 0 },
      eventGroups: [{ label: "https://fuente.cl", candidates: [approvedCandidate] }],
      costUsd: 0.03,
    },
  ]);

  const html = buildDailyDigestHtmlBody(summary);
  assert.match(html, /Web \(comuna \+ agregadores\)/);
  assert.match(html, /Muestra real/);
  assert.doesNotMatch(html, /<script/i);
});

test("buildDailyDigestHtmlBody shows a plain placeholder instead of empty tables when no candidates exist across any pipeline", () => {
  const summary = summaryWith([
    {
      entrypoint: "google_alerts",
      startedAt: new Date("2026-08-26T09:22:00.000Z"),
      candidates: { total: 0, approvedByCuration: 0, rejectedByCuration: 0 },
      eventGroups: [],
      costUsd: 0,
    },
  ]);

  assert.match(buildDailyDigestHtmlBody(summary), /sin candidatos hoy/);
});

test("buildDailyDigestBody/HtmlBody surface a visible warning when a pipeline's own fetch failed outright (real gap found 2026-08-30: an Apify hard-limit error read as '0 candidates, ran fine' everywhere downstream)", () => {
  const summary = summaryWith([
    {
      entrypoint: "instagram",
      startedAt: new Date("2026-08-30T08:17:00.000Z"),
      candidates: { total: 0, approvedByCuration: 0, rejectedByCuration: 0 },
      eventGroups: [],
      costUsd: 0,
      fetchError: "Monthly usage hard limit exceeded",
    },
  ]);

  const body = buildDailyDigestBody(summary);
  assert.match(body, /BLOQUEADO/);
  assert.match(body, /Monthly usage hard limit exceeded/);

  const html = buildDailyDigestHtmlBody(summary);
  assert.match(html, /BLOQUEADO/);
  assert.match(html, /Monthly usage hard limit exceeded/);
});

test("buildDailyDigestBody/HtmlBody omit the fetch-error warning when nothing failed", () => {
  const summary = summaryWith([
    {
      entrypoint: "instagram",
      startedAt: new Date("2026-08-30T08:17:00.000Z"),
      candidates: { total: 0, approvedByCuration: 0, rejectedByCuration: 0 },
      eventGroups: [],
      costUsd: 0,
    },
  ]);

  assert.doesNotMatch(buildDailyDigestBody(summary), /BLOQUEADO/);
  assert.doesNotMatch(buildDailyDigestHtmlBody(summary), /BLOQUEADO/);
});

test("buildDailyDigestBody/HtmlBody: Apify status line shows remaining budget under the free-tier limit", () => {
  const body = buildDailyDigestBody(summaryWith([]));
  assert.match(body, /\$0\.79 disponibles de \$5 en el ciclo actual/, "APIFY_FREE_TIER_USD 5 - apifyCycleGrossUsd 4.21 = 0.79 remaining");
  // Cycle opened 13/08 -> renews 13/09, NOT "next month" generically.
  assert.match(body, /se renueva el 13\/09\/2026/);
  assert.doesNotMatch(body, /LÍMITE DEL CICLO ALCANZADO/);

  const html = buildDailyDigestHtmlBody(summaryWith([]));
  assert.match(html, /\$0\.79 disponibles/);
  assert.doesNotMatch(html, /LÍMITE DEL CICLO ALCANZADO/);
});

test("buildDailyDigestBody/HtmlBody: Apify status line flags the hard limit as reached once gross spend hits the free tier", () => {
  const overLimitCost: DailyDigestSummary["cost"] = { ...baseCost, apifyCycleGrossUsd: 5.02 };
  const summary: DailyDigestSummary = { date: "2026-08-30", runs: [], cost: overLimitCost };

  const body = buildDailyDigestBody(summary);
  assert.match(body, /LÍMITE DEL CICLO ALCANZADO \(\$5\.02 de \$5\) — sin nuevas corridas hasta el 13\/09\/2026/);

  const html = buildDailyDigestHtmlBody(summary);
  assert.match(html, /LÍMITE DEL CICLO ALCANZADO/);
  assert.match(html, /color:#b3261e/, "the over-limit status must render in the warning color, not the default gray");
});
