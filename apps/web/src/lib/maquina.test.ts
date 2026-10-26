import { test } from "node:test";
import assert from "node:assert/strict";
import type { AdminAnalyticsPayload } from "./adminAnalytics";
import { costSummary, outOfScope30d, recentRuns, safetyNetSummary, sourcesNeedingAttention } from "./maquina";

const NOW = new Date("2026-10-25T15:00:00Z");

test("costSummary: Anthropic by calendar month, Apify by billing cycle (anchored on the 13th)", () => {
  const s = costSummary(
    {
      anthropicCostByDay: [
        { date: "2026-10-01", amountUsd: 1 },
        { date: "2026-10-20", amountUsd: 2 },
        { date: "2026-09-30", amountUsd: 5 },
      ],
      apifyCostByDay: [
        { date: "2026-10-12", amountUsd: 4 },
        { date: "2026-10-13", amountUsd: 15 },
        { date: "2026-10-20", amountUsd: 6 },
      ],
      monthlyBudgetUsd: 15,
    },
    NOW,
  );
  assert.equal(s.anthropicMonthUsd, 3);
  assert.equal(s.anthropicBudgetUsd, 15);
  assert.equal(s.apifyCycleStart, "2026-10-13");
  assert.equal(s.apifyCycleUsd, 21);
  assert.equal(s.apifyExcessUsd, 2);
  assert.equal(s.byMonth.length, 6);
  assert.deepEqual(s.byMonth.at(-1), { month: "2026-10", anthropicUsd: 3, apifyUsd: 25 });
  assert.equal(costSummary({ anthropicCostByDay: [], apifyCostByDay: [] }, NOW).anthropicBudgetUsd, null);
});

test("sourcesNeedingAttention skips deactivated accounts and healthy sources", () => {
  const ig = (over: Partial<AdminAnalyticsPayload["instagramSources"][number]>) => ({
    username: "x",
    lastFetchedAt: null,
    intervalDays: 1,
    accepted: 0,
    rejected: 0,
    possiblyDead: false,
    isInactive: false,
    consecutiveZeroYieldAtCap: 0,
    ...over,
  });
  const rows = sourcesNeedingAttention({
    instagramSources: [
      ig({ username: "dead", possiblyDead: true }),
      ig({ username: "capped", consecutiveZeroYieldAtCap: 3, accepted: 4 }),
      ig({ username: "paused", possiblyDead: true, isInactive: true }),
      ig({ username: "fine", accepted: 9 }),
    ],
    brightSources: [
      { url: "https://dead.cl", lastFetchedAt: null, intervalDays: 7, accepted: 0, rejected: 0, possiblyDead: true, category: "bright_source" },
      { url: "https://ok.cl", lastFetchedAt: null, intervalDays: 7, accepted: 3, rejected: 0, possiblyDead: false, category: "bright_source" },
    ],
  });
  assert.deepEqual(
    rows.map((r) => r.label),
    ["@dead", "https://dead.cl"],
    "a quiet account with past yield (@capped) is the cadence's job, not an alert",
  );
});

test("recentRuns keeps 7 days, newest first, and flags problems", () => {
  const run = (startedAt: string, over: Partial<AdminAnalyticsPayload["discoveryRunSummaries"][number]> = {}) => ({
    entrypoint: "instagram" as const,
    startedAt,
    candidatesTotal: 5,
    approvedByCuration: 1,
    rejectedByCuration: 4,
    insertedCount: 1,
    replacedCount: 0,
    duplicateSkippedCount: 0,
    axisBlockedCount: 0,
    expiredCount: 0,
    insertFailedCount: 0,
    costUsd: 0.1,
    ...over,
  });
  const rows = recentRuns([run("2026-10-10T10:00:00Z"), run("2026-10-24T10:00:00Z", { insertFailedCount: 2 }), run("2026-10-25T10:00:00Z", { candidatesTotal: 0 })], NOW);
  assert.deepEqual(
    rows.map((r) => [r.startedAt.slice(0, 10), r.problem]),
    [
      ["2026-10-25", "no encontró candidatos"],
      ["2026-10-24", "2 inserciones fallidas"],
    ],
  );
});

test("safetyNetSummary counts vetoes on both pipelines in the last 30 days", () => {
  const row = (createdAt: string, over: Partial<AdminAnalyticsPayload["shadowCurationComparisons"][number]>) => ({
    createdAt,
    pipeline: "instagram" as const,
    label: "post",
    model: "m",
    realStatus: "approved" as const,
    shadowStatus: "approved" as const,
    agree: true,
    realTags: [],
    shadowTags: [],
    realReasoning: "",
    shadowReasoning: "",
    error: null,
    ...over,
  });
  const s = safetyNetSummary(
    [
      row("2026-10-20T00:00:00Z", {}),
      row("2026-10-21T00:00:00Z", { agree: false, shadowStatus: "rejected", label: "circo", shadowReasoning: "no es arte visual" }),
      row("2026-10-22T00:00:00Z", { shadowStatus: "error", agree: false }),
      row("2026-08-01T00:00:00Z", { agree: false, shadowStatus: "rejected" }),
      row("2026-10-23T00:00:00Z", { pipeline: "bright_source", agree: false, shadowStatus: "rejected" }),
    ],
    NOW,
  );
  assert.equal(s.reviewed, 4);
  assert.equal(s.vetoes, 2);
  assert.equal(s.errors, 1);
  assert.deepEqual(s.byPipeline, [
    { pipeline: "instagram", reviewed: 3, vetoes: 1 },
    { pipeline: "bright_source", reviewed: 1, vetoes: 1 },
  ]);
  assert.deepEqual(s.latestVetoes[1], { createdAt: "2026-10-21T00:00:00Z", pipeline: "instagram", label: "circo", reasoning: "no es arte visual" });
});

test("outOfScope30d groups the last 30 days by category", () => {
  const sig = (createdAt: string, category: string) => ({ createdAt, category, pipeline: null, adminRegionName: null });
  assert.deepEqual(outOfScope30d([sig("2026-10-20T00:00:00Z", "convocatoria"), sig("2026-10-21T00:00:00Z", "convocatoria"), sig("2026-10-22T00:00:00Z", "taller_o_charla"), sig("2026-08-01T00:00:00Z", "convocatoria")], NOW), [
    { label: "Convocatorias", count: 2 },
    { label: "Talleres / charlas", count: 1 },
  ]);
});
