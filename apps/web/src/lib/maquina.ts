// Máquina — /admin/maquina since 2026-10-25 (Daniel): everything that
// measures whether the machine works, reduced to what you can act on.
// It replaces /admin/fuentes, /admin/costos and /admin/modelo-sombra
// (and /admin/eventos, now covered by Misión's región table). Fixed
// windows, no period toggle. Pure functions over the admin-analytics
// payload; the caller passes `now`.

import type { AdminAnalyticsPayload } from "./adminAnalytics";
import { APIFY_FREE_TIER_USD, apifyCycleStart } from "./apifyCostSplit";

const DAY_MS = 24 * 60 * 60 * 1000;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface CostSummary {
  anthropicMonthUsd: number;
  // system_config.monthly_budget_usd, the same ceiling the curator
  // enforces; null until the Edge Function ships it.
  anthropicBudgetUsd: number | null;
  apifyCycleStart: string;
  apifyCycleUsd: number;
  apifyCreditUsd: number;
  apifyExcessUsd: number;
  // Last 6 calendar months, oldest first: Anthropic, plus Apify gross usage.
  byMonth: Array<{ month: string; anthropicUsd: number; apifyUsd: number }>;
}

export function costSummary(
  data: Pick<AdminAnalyticsPayload, "anthropicCostByDay" | "apifyCostByDay"> & { monthlyBudgetUsd?: number | null },
  now: Date,
): CostSummary {
  const month = ymd(now).slice(0, 7);
  const cycleStart = apifyCycleStart(now);
  const anthropicMonthUsd = data.anthropicCostByDay.filter((r) => r.date.startsWith(month)).reduce((acc, r) => acc + r.amountUsd, 0);
  const apifyCycleUsd = data.apifyCostByDay.filter((r) => r.date >= cycleStart).reduce((acc, r) => acc + r.amountUsd, 0);

  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(ymd(d).slice(0, 7));
  }
  const sumMonth = (rows: { date: string; amountUsd: number }[], m: string) => rows.filter((r) => r.date.startsWith(m)).reduce((acc, r) => acc + r.amountUsd, 0);

  return {
    anthropicMonthUsd,
    anthropicBudgetUsd: data.monthlyBudgetUsd ?? null,
    apifyCycleStart: cycleStart,
    apifyCycleUsd,
    apifyCreditUsd: APIFY_FREE_TIER_USD,
    apifyExcessUsd: Math.max(0, apifyCycleUsd - APIFY_FREE_TIER_USD),
    byMonth: months.map((m) => ({ month: m, anthropicUsd: sumMonth(data.anthropicCostByDay, m), apifyUsd: sumMonth(data.apifyCostByDay, m) })),
  };
}

export interface SourceAttentionRow {
  label: string;
  category: "Instagram" | "Web" | "Headless" | "Google Alerts";
  lastFetchedAt: string | null;
}

// Sources worth a look: read, but never produced a single candidate
// (accepted or rejected). Deliberately deactivated accounts
// (is_inactive) are left out — that was already a decision. The
// Instagram dormancy counter (consecutiveZeroYieldAtCap: empty cycles
// at the slow cadence) is not used here: the adaptive cadence already
// handles quiet accounts on its own.
export function sourcesNeedingAttention(data: Pick<AdminAnalyticsPayload, "brightSources" | "instagramSources">): SourceAttentionRow[] {
  const category = { bright_source: "Web", headless: "Headless", google_alerts: "Google Alerts" } as const;
  const rows: SourceAttentionRow[] = [];
  for (const s of data.instagramSources) {
    if (s.isInactive) continue;
    if (s.possiblyDead) rows.push({ label: `@${s.username}`, category: "Instagram", lastFetchedAt: s.lastFetchedAt });
  }
  for (const s of data.brightSources) {
    if (s.possiblyDead) {
      rows.push({ label: s.url, category: category[s.category], lastFetchedAt: s.lastFetchedAt });
    }
  }
  return rows.sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}

export interface RunRow {
  entrypoint: AdminAnalyticsPayload["discoveryRunSummaries"][number]["entrypoint"];
  startedAt: string;
  candidates: number;
  inserted: number;
  insertFailed: number;
  costUsd: number;
  problem: string | null;
}

// Runs from the last 7 days, newest first, each flagged when something
// went wrong: failed inserts, or a run that saw nothing at all.
export function recentRuns(runs: AdminAnalyticsPayload["discoveryRunSummaries"], now: Date): RunRow[] {
  const since = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  return runs
    .filter((r) => r.startedAt >= since)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .map((r) => ({
      entrypoint: r.entrypoint,
      startedAt: r.startedAt,
      candidates: r.candidatesTotal,
      inserted: r.insertedCount + r.replacedCount,
      insertFailed: r.insertFailedCount,
      costUsd: r.costUsd,
      problem: r.insertFailedCount > 0 ? `${r.insertFailedCount} inserciones fallidas` : r.candidatesTotal === 0 ? "no encontró candidatos" : null,
    }));
}

export interface SafetyNetSummary {
  reviewed: number;
  vetoes: number;
  errors: number;
  byPipeline: Array<{ pipeline: "instagram" | "bright_source"; reviewed: number; vetoes: number }>;
  latestVetoes: Array<{ createdAt: string; pipeline: "instagram" | "bright_source"; label: string; reasoning: string }>;
}

// The safety net (lib/safety-net.ts in the curator): a second model
// re-reads Haiku's approvals, on Instagram and on the web sources, and a
// scope rejection vetoes them. A veto is a comparison row where Haiku
// approved and the second model rejected. Rows are comparisons as the
// curator records them (one per source or batch), not single events.
// Last 30 days.
export function safetyNetSummary(comparisons: AdminAnalyticsPayload["shadowCurationComparisons"], now: Date): SafetyNetSummary {
  const since = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const recent = comparisons.filter((c) => c.createdAt >= since);
  const isVeto = (c: (typeof recent)[number]) => !c.agree && c.realStatus === "approved" && c.shadowStatus === "rejected";
  const vetoes = recent.filter(isVeto).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return {
    reviewed: recent.length,
    vetoes: vetoes.length,
    errors: recent.filter((c) => c.shadowStatus === "error").length,
    byPipeline: (["instagram", "bright_source"] as const).map((pipeline) => ({
      pipeline,
      reviewed: recent.filter((c) => c.pipeline === pipeline).length,
      vetoes: vetoes.filter((c) => c.pipeline === pipeline).length,
    })),
    latestVetoes: vetoes.slice(0, 5).map((c) => ({ createdAt: c.createdAt, pipeline: c.pipeline, label: c.label, reasoning: c.shadowReasoning })),
  };
}

const OUT_OF_SCOPE_LABELS: Record<string, string> = {
  convocatoria: "Convocatorias",
  taller_o_charla: "Talleres / charlas",
  otro_evento_no_arte_visual: "Otros eventos (música, teatro…)",
};

// Out-of-scope signals as one line: counts by category, last 30 days.
// The rows keep accumulating in the DB for a future scope decision.
export function outOfScope30d(signals: AdminAnalyticsPayload["outOfScopeSignals"], now: Date): Array<{ label: string; count: number }> {
  const since = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const counts = new Map<string, number>();
  for (const s of signals) {
    if (s.createdAt < since) continue;
    const label = OUT_OF_SCOPE_LABELS[s.category] ?? s.category;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
