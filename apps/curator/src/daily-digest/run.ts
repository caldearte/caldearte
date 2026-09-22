// Consolidated once-a-day summary — see lib/daily-digest.ts's own doc
// comment for why this replaces the 4 separate per-pipeline emails.
// Runs once daily (daily-digest.yml), after every possible discovery
// cron for that day has already fired, and sends ONE email covering
// whatever ran — skips sending entirely on a day nothing ran (the new
// cadence, 2026-08-26, means not every pipeline fires every day).
import { getSupabaseClient } from "../lib/supabase-client.js";
import { getConfigNumber, startOfCurrentUtcMonth } from "../lib/usage-tracking.js";
import { isAnthropicModel } from "../lib/pricing.js";
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

// The Instagram pipeline runs Monday through Saturday
// (instagram-bright-sources.yml, cron `1-6`). getUTCDay(): 0 = Sunday.
function instagramRunsOn(now: Date): boolean {
  const day = now.getUTCDay();
  return day >= 1 && day <= 6;
}

// Why the digest waits (2026-09-22): GitHub delays EVERY scheduled
// workflow in this repo by 4-7 hours, measured across a week — Instagram
// (08:17 UTC) fired between 12:32 and 15:08, this digest (10:30) between
// 13:57 and 16:32. The delay is the same whatever minute a cron asks for
// (09:33 drifts exactly like 10:30), so moving crons around buys nothing;
// what saves the digest today is only that both drift together and are
// scheduled 2 h apart. The margin is thin — 84 minutes on 2026-09-19 —
// and the day the digest drifts 3.5 h while Instagram drifts 6.8 h, the
// email goes out without the day's main run in it. So: on a day Instagram
// is due, wait for its row to appear before reading, up to
// INSTAGRAM_WAIT_TIMEOUT_MS. Timing out is not an error — the run may
// genuinely have failed, and a digest that says so is the point.
const INSTAGRAM_WAIT_TIMEOUT_MS = 90 * 60 * 1000;
const INSTAGRAM_WAIT_POLL_MS = 5 * 60 * 1000;

export interface RunDeps {
  now?: Date;
  sendDailyDigestEmailFn?: typeof sendDailyDigestEmail;
  // Test seams for the wait loop above.
  sleepFn?: (ms: number) => Promise<void>;
  instagramWaitTimeoutMs?: number;
}

// Exported for tests: polls until today's Instagram run summary exists,
// or the timeout passes. Returns whether it showed up.
export async function waitForInstagramRun(
  hasRunFn: () => Promise<boolean>,
  opts: { timeoutMs: number; pollMs: number; sleepFn: (ms: number) => Promise<void>; nowFn: () => number },
): Promise<boolean> {
  const deadline = opts.nowFn() + opts.timeoutMs;
  for (;;) {
    if (await hasRunFn()) return true;
    if (opts.nowFn() >= deadline) return false;
    console.log(`[daily-digest] today's Instagram run isn't recorded yet — waiting ${Math.round(opts.pollMs / 60000)} min (GitHub cron drift, see run.ts)`);
    await opts.sleepFn(opts.pollMs);
  }
}

export async function run(deps: RunDeps = {}): Promise<void> {
  const now = deps.now ?? new Date();
  const { dateStr, startUtc, endUtc } = santiagoDayBoundsUtc(now);
  const client = getSupabaseClient();

  if (instagramRunsOn(now)) {
    const found = await waitForInstagramRun(
      async () => {
        const { data, error } = await client
          .from("discovery_run_summaries")
          .select("entrypoint")
          .eq("entrypoint", "instagram")
          .gte("started_at", startUtc.toISOString())
          .lt("started_at", endUtc.toISOString())
          .limit(1);
        // A read failure is not "hasn't run" — don't spin on it.
        if (error) {
          console.error(`[daily-digest] failed to check for today's Instagram run: ${error.message}`);
          return true;
        }
        return (data ?? []).length > 0;
      },
      {
        timeoutMs: deps.instagramWaitTimeoutMs ?? INSTAGRAM_WAIT_TIMEOUT_MS,
        pollMs: INSTAGRAM_WAIT_POLL_MS,
        sleepFn: deps.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
        nowFn: () => Date.now(),
      },
    );
    if (!found) {
      console.warn(`[daily-digest] today's Instagram run never showed up — sending the digest without it`);
    }
  }

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
  let safetyNetTodayUsd = 0;
  let safetyNetMonthUsd = 0;
  let apifyTodayGrossUsd = 0;
  let apifyTodayFreeUsd = 0;
  let apifyTodayRealUsd = 0;
  let apifyCycleGrossUsd = 0;
  let apifyCycleFreeUsd = 0;
  let apifyCycleRealUsd = 0;
  const apifyCycleStartDate = apifyCycleStart(now);
  let monthlyBudgetUsd = 0;

  try {
    const [{ data: usageRows, error: usageError }, { data: monthRows, error: monthError }, budget, { data: apifyRows, error: apifyError }] = await Promise.all([
      client.from("api_usage_log").select("estimated_cost_usd, model").gte("created_at", startUtc.toISOString()).lt("created_at", endUtc.toISOString()),
      // Same window getCurrentMonthSpend uses (calendar month, UTC), read
      // with the model so the safety-net model's spend can be shown
      // on its own line — the ceiling itself still counts both.
      client.from("api_usage_log").select("estimated_cost_usd, model").gte("created_at", startOfCurrentUtcMonth()),
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
    if (monthError) throw new Error(monthError.message);
    if (apifyError) throw new Error(apifyError.message);

    for (const r of usageRows ?? []) {
      if (isAnthropicModel(r.model)) anthropicTodayUsd += Number(r.estimated_cost_usd);
      else safetyNetTodayUsd += Number(r.estimated_cost_usd);
    }
    for (const r of monthRows ?? []) {
      if (isAnthropicModel(r.model)) anthropicMonthUsd += Number(r.estimated_cost_usd);
      else safetyNetMonthUsd += Number(r.estimated_cost_usd);
    }
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
      safetyNetTodayUsd,
      safetyNetMonthUsd,
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
