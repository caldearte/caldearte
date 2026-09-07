// Consolidated once-a-day summary — see lib/daily-digest.ts's own doc
// comment for why this replaces the 4 separate per-pipeline emails.
// Runs once daily (daily-digest.yml), after every possible discovery
// cron for that day has already fired, and sends ONE email covering
// whatever ran — skips sending entirely on a day nothing ran (the new
// cadence, 2026-08-26, means not every pipeline fires every day).
import { getSupabaseClient } from "../lib/supabase-client.js";
import { getCurrentMonthSpend, getConfigNumber } from "../lib/usage-tracking.js";
import { splitApifyFreeTier, apifyCycleStart } from "../lib/apify-cost-split.js";
import { sendDailyDigestEmail, type DailyDigestPipelineRun, type DailyDigestSummary, type DiscoveryEntrypoint } from "../lib/daily-digest.js";
import type { EventGroup } from "../lib/notify.js";

// Same "treat the Santiago calendar date as if it were UTC" approximation
// already used by social-publish/run.ts's own weekBoundsInSantiago — good
// enough for a summary email, not something publish-critical.
export function santiagoDayBoundsUtc(now: Date): { dateStr: string; startUtc: Date; endUtc: Date } {
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now);
  const [y, m, d] = dateStr.split("-").map(Number);
  const startUtc = new Date(Date.UTC(y, m - 1, d));
  const endUtc = new Date(Date.UTC(y, m - 1, d + 1));
  return { dateStr, startUtc, endUtc };
}

interface RawSummaryShape {
  candidates: { total: number; approvedByCuration: number; rejectedByCuration: number };
  eventGroups: EventGroup[];
  // Only ever present on an "instagram" row today — see
  // run-summary-store.ts's recordRunSummary `extra` param and
  // apify-instagram.ts's own doc comment.
  apifyError?: string | null;
}

export interface RunDeps {
  now?: Date;
  sendDailyDigestEmailFn?: typeof sendDailyDigestEmail;
}

export async function run(deps: RunDeps = {}): Promise<void> {
  const now = deps.now ?? new Date();
  const { dateStr, startUtc, endUtc } = santiagoDayBoundsUtc(now);
  const client = getSupabaseClient();

  const { data: runRows, error: runsError } = await client
    .from("discovery_run_summaries")
    .select("entrypoint, started_at, cost_usd, raw_summary")
    .gte("started_at", startUtc.toISOString())
    .lt("started_at", endUtc.toISOString())
    .order("started_at", { ascending: true });

  if (runsError) {
    console.error(`[daily-digest] failed to load today's run summaries: ${runsError.message}`);
    return;
  }

  if (!runRows || runRows.length === 0) {
    console.log(`[daily-digest] nothing ran on ${dateStr} — skipping email`);
    return;
  }

  const runs: DailyDigestPipelineRun[] = runRows.map((row) => {
    const raw = row.raw_summary as unknown as RawSummaryShape;
    return {
      entrypoint: row.entrypoint as DiscoveryEntrypoint,
      startedAt: new Date(row.started_at),
      candidates: raw.candidates,
      eventGroups: raw.eventGroups,
      costUsd: Number(row.cost_usd),
      fetchError: raw.apifyError ?? null,
    };
  });

  let anthropicTodayUsd = 0;
  let anthropicMonthUsd = 0;
  let apifyTodayGrossUsd = 0;
  let apifyTodayFreeUsd = 0;
  let apifyTodayRealUsd = 0;
  let apifyCycleGrossUsd = 0;
  let apifyCycleFreeUsd = 0;
  let apifyCycleRealUsd = 0;
  const apifyCycleStartDate = apifyCycleStart(now);
  let monthlyBudgetUsd = 0;

  try {
    const [{ data: usageRows, error: usageError }, monthSpend, budget, { data: apifyRows, error: apifyError }] = await Promise.all([
      client.from("api_usage_log").select("estimated_cost_usd").gte("created_at", startUtc.toISOString()).lt("created_at", endUtc.toISOString()),
      getCurrentMonthSpend(),
      getConfigNumber("monthly_budget_usd"),
      client
        .from("platform_cost_snapshots")
        .select("usage_date, amount_usd")
        .eq("platform", "apify")
        // Apify's cycle, NOT the calendar month — see apify-cost-split.ts's
        // own comment on APIFY_CYCLE_ANCHOR_DAY. Summing from the 1st was a
        // real bug: it under-reported the cycle every month and printed a
        // false "$4.99 disponibles" while Apify was already refusing runs.
        .gte("usage_date", apifyCycleStartDate)
        .lt("usage_date", endUtc.toISOString().slice(0, 10)),
    ]);

    if (usageError) throw new Error(usageError.message);
    if (apifyError) throw new Error(apifyError.message);

    anthropicTodayUsd = (usageRows ?? []).reduce((sum, r) => sum + Number(r.estimated_cost_usd), 0);
    anthropicMonthUsd = monthSpend;
    monthlyBudgetUsd = budget;

    const apifySplit = splitApifyFreeTier((apifyRows ?? []).map((r) => ({ date: r.usage_date, amountUsd: Number(r.amount_usd) })));
    for (const day of apifySplit) {
      apifyCycleGrossUsd += day.freeUsd + day.realUsd;
      apifyCycleFreeUsd += day.freeUsd;
      apifyCycleRealUsd += day.realUsd;
      if (day.date === dateStr) {
        apifyTodayGrossUsd = day.freeUsd + day.realUsd;
        apifyTodayFreeUsd = day.freeUsd;
        apifyTodayRealUsd = day.realUsd;
      }
    }
  } catch (err) {
    // Ancillary reporting only — the runs themselves are already fully
    // saved by this point, same posture as every other pipeline's own
    // "failed to compute month-to-date spend" catch.
    console.error(`[daily-digest] failed to compute cost figures: ${(err as Error).message}`);
  }

  const summary: DailyDigestSummary = {
    date: dateStr,
    runs,
    cost: {
      anthropicTodayUsd,
      apifyTodayGrossUsd,
      apifyTodayFreeUsd,
      apifyTodayRealUsd,
      anthropicMonthUsd,
      apifyCycleGrossUsd,
      apifyCycleStartDate,
      apifyCycleFreeUsd,
      apifyCycleRealUsd,
      monthlyBudgetUsd,
    },
  };

  await (deps.sendDailyDigestEmailFn ?? sendDailyDigestEmail)(summary);
  console.log(`[daily-digest] sent digest for ${dateStr} — ${runs.length} pipeline(s)`);
}
