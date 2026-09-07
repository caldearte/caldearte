// Deliberate small duplicate of apps/web/src/lib/apifyCostSplit.ts's own
// logic — curator and web are separate deployable packages (curator is a
// plain Node script, not a Next.js app importing from apps/web), so this
// is copied rather than shared. Keep both in sync if Apify's free-tier
// terms ever change.
//
// Apify's real billing shape (confirmed 2026-08-15): $5 of usage credit
// per billing cycle, consumed first — non-rolling, doesn't carry over.
// The daily amounts stored by apify-usage-snapshot/run.ts are GROSS
// usage cost, not already net of the free credit.
export const APIFY_FREE_TIER_USD = 5;

// Apify's cycle is a billing ANNIVERSARY, not the 1st of the calendar
// month. Determined 2026-09-06 from two independent signals: Apify's own
// /users/me/usage/monthly returns only the current cycle's days and its
// earliest was 2026-08-13, and summing those days chronologically hits
// exactly $5.00 on 2026-08-30 — the day Instagram discovery started
// failing with "Monthly usage hard limit exceeded".
//
// Treating this as the 1st was a real production bug (fixed 2026-09-06):
// from Sep 1 the daily digest and /admin/costos both summed only the
// calendar month, reported ~$0.007 used, and printed "$4.99 disponibles"
// every day while Apify was in fact refusing every Actor run and
// Instagram discovery had been dark for a week.
//
// A hardcoded anchor rather than stored state on purpose: it's a fixed
// property of the account that only moves if the plan itself changes, so
// there's nothing to keep in sync day to day. apify-usage-snapshot/run.ts
// checks Apify's own response against it on every run and logs loudly if
// they ever disagree, which is the cheap way to find out it moved.
export const APIFY_CYCLE_ANCHOR_DAY = 13;

// First day of the billing cycle that `now` falls inside, as YYYY-MM-DD.
// Clamped for short months: an anchor of 31 lands on Feb 28/29 rather
// than rolling into March.
export function apifyCycleStart(now: Date, anchorDay: number = APIFY_CYCLE_ANCHOR_DAY): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const clampedDay = (y: number, m: number) => Math.min(anchorDay, new Date(Date.UTC(y, m + 1, 0)).getUTCDate());

  // Before this month's anchor, we're still inside the cycle that opened
  // last month.
  const useMonth = now.getUTCDate() >= clampedDay(year, month) ? month : month - 1;
  const start = new Date(Date.UTC(year, useMonth, 1));
  start.setUTCDate(clampedDay(start.getUTCFullYear(), start.getUTCMonth()));
  return start.toISOString().slice(0, 10);
}

export interface DailySplitCost {
  date: string;
  freeUsd: number;
  realUsd: number;
}

// Chronological, running-cumulative-per-billing-cycle — a day's usage
// only becomes "real" once the cycle's cumulative total (days processed
// so far in THAT cycle, in date order) exceeds the free tier. The cycle
// boundary resets the running total to 0, matching Apify's own reset.
export function splitApifyFreeTier(
  costByDay: { date: string; amountUsd: number }[],
  freeTierUsd: number = APIFY_FREE_TIER_USD,
  anchorDay: number = APIFY_CYCLE_ANCHOR_DAY,
): DailySplitCost[] {
  const sorted = [...costByDay].sort((a, b) => a.date.localeCompare(b.date));
  const cumulativeByCycle = new Map<string, number>();

  return sorted.map((row) => {
    const cycle = apifyCycleStart(new Date(`${row.date}T00:00:00Z`), anchorDay);
    const cumBefore = cumulativeByCycle.get(cycle) ?? 0;
    const freeUsd = Math.max(0, Math.min(row.amountUsd, freeTierUsd - cumBefore));
    const realUsd = row.amountUsd - freeUsd;
    cumulativeByCycle.set(cycle, cumBefore + row.amountUsd);
    return { date: row.date, freeUsd, realUsd };
  });
}
