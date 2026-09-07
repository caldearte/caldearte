// Daily snapshot of Apify's real usage cost — Apify has no per-call
// ledger reaching this DB the way Anthropic does (usage-tracking.ts's
// api_usage_log); the only source of truth is their own account, exposed
// via GET /v2/users/me/usage/monthly (confirmed against their docs,
// 2026-08-15), authenticated with the same APIFY_TOKEN
// instagram-discovery/run.ts already uses.
//
// Upserts EVERY day in the response's dailyServiceUsages array, not just
// today — a missed cron day (workflow failure, Apify outage) self-heals
// on the next successful run instead of leaving a permanent gap in the
// admin cost history, since the endpoint always returns the whole
// current billing cycle to date.
import { getSupabaseClient } from "../lib/supabase-client.js";
import { apifyCycleStart, APIFY_CYCLE_ANCHOR_DAY } from "../lib/apify-cost-split.js";

const APIFY_USAGE_URL = "https://api.apify.com/v2/users/me/usage/monthly";

interface ApifyDailyUsage {
  date: string; // ISO timestamp, e.g. "2026-08-14T00:00:00.000Z"
  totalUsageCreditsUsd: number;
}

interface ApifyUsageResponse {
  data: {
    totalUsageCreditsUsdAfterVolumeDiscount: number;
    dailyServiceUsages: ApifyDailyUsage[];
  };
}

export interface CostSnapshotRow {
  platform: "apify";
  usage_date: string; // YYYY-MM-DD
  amount_usd: number;
  raw: ApifyDailyUsage;
}

// Pure — separately exported so the shaping logic is testable without a
// real Apify call, same pattern as apify-instagram.ts's own
// parseApifyInstagramPosts.
export function toCostSnapshotRows(response: ApifyUsageResponse): CostSnapshotRow[] {
  return (response.data.dailyServiceUsages ?? []).map((day) => ({
    platform: "apify" as const,
    usage_date: day.date.slice(0, 10),
    amount_usd: day.totalUsageCreditsUsd,
    raw: day,
  }));
}

export async function run(): Promise<void> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error("[apify-usage-snapshot] APIFY_TOKEN not set — skipping");
    return;
  }

  let response: ApifyUsageResponse;
  try {
    const res = await fetch(APIFY_USAGE_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.error(`[apify-usage-snapshot] Apify usage API returned ${res.status}`);
      return;
    }
    response = (await res.json()) as ApifyUsageResponse;
  } catch (err) {
    // Never throw — this is a best-effort daily snapshot, not something
    // that should fail a whole workflow run over a transient network blip.
    console.error(`[apify-usage-snapshot] failed to fetch Apify usage: ${(err as Error).message}`);
    return;
  }

  const rows = toCostSnapshotRows(response);
  if (rows.length === 0) {
    console.log("[apify-usage-snapshot] no daily usage rows in response");
    return;
  }

  const { error } = await getSupabaseClient().from("platform_cost_snapshots").upsert(rows, { onConflict: "platform,usage_date" });
  if (error) {
    console.error(`[apify-usage-snapshot] failed to upsert snapshots: ${error.message}`);
    return;
  }

  // The response only ever covers the CURRENT billing cycle, so its
  // earliest day is Apify's own answer for where that cycle started. We
  // hardcode the anchor (apify-cost-split.ts's APIFY_CYCLE_ANCHOR_DAY)
  // rather than storing it, so this is the check that tells us if it ever
  // moves — a plan change, or the anchor being wrong in the first place,
  // which is exactly the bug this whole area had until 2026-09-06.
  //
  // Not an error: a cycle whose first days had zero usage can legitimately
  // start later than the anchor, and being wrong here only affects
  // reporting, never a real run. Worth a loud line in the log, not a
  // failed workflow.
  const observedCycleStart = rows.reduce((earliest, r) => (r.usage_date < earliest ? r.usage_date : earliest), rows[0].usage_date);
  const expectedCycleStart = apifyCycleStart(new Date());
  if (observedCycleStart < expectedCycleStart) {
    console.warn(
      `[apify-usage-snapshot] ⚠️ cycle anchor looks wrong: Apify reports usage from ${observedCycleStart}, but APIFY_CYCLE_ANCHOR_DAY=${APIFY_CYCLE_ANCHOR_DAY} puts the cycle start at ${expectedCycleStart}. Update the anchor in apify-cost-split.ts (both copies).`,
    );
  }

  console.log(
    `[apify-usage-snapshot] upserted ${rows.length} day(s), cycle-to-date total $${response.data.totalUsageCreditsUsdAfterVolumeDiscount.toFixed(2)} (cycle from ${observedCycleStart})`,
  );
}
