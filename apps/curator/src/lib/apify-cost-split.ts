// Deliberate small duplicate of apps/web/src/lib/apifyCostSplit.ts's own
// logic — curator and web are separate deployable packages (curator is a
// plain Node script, not a Next.js app importing from apps/web), so this
// is copied rather than shared. Keep both in sync if Apify's free-tier
// terms ever change.
//
// Apify's real billing shape (confirmed 2026-08-15): $5 of usage credit
// per calendar month, consumed first — non-rolling, doesn't carry over.
// The daily amounts stored by apify-usage-snapshot/run.ts are GROSS
// usage cost, not already net of the free credit.
export const APIFY_FREE_TIER_USD = 5;

export interface DailySplitCost {
  date: string;
  freeUsd: number;
  realUsd: number;
}

// Chronological, running-cumulative-per-calendar-month — a day's usage
// only becomes "real" once the month's cumulative total (days processed
// so far THIS month, in date order) exceeds the free tier.
export function splitApifyFreeTier(costByDay: { date: string; amountUsd: number }[], freeTierUsd: number = APIFY_FREE_TIER_USD): DailySplitCost[] {
  const sorted = [...costByDay].sort((a, b) => a.date.localeCompare(b.date));
  const cumulativeByMonth = new Map<string, number>();

  return sorted.map((row) => {
    const month = row.date.slice(0, 7);
    const cumBefore = cumulativeByMonth.get(month) ?? 0;
    const freeUsd = Math.max(0, Math.min(row.amountUsd, freeTierUsd - cumBefore));
    const realUsd = row.amountUsd - freeUsd;
    cumulativeByMonth.set(month, cumBefore + row.amountUsd);
    return { date: row.date, freeUsd, realUsd };
  });
}
