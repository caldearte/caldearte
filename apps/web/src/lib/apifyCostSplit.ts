// Apify's real billing shape (confirmed 2026-08-15): $5 of usage credit
// per calendar month, consumed first: FREE — non-rolling, doesn't carry
// over — real money only starts once a month's cumulative usage crosses
// that $5. The daily amounts we store (apply-usage-snapshot's own
// dailyServiceUsages) are GROSS usage cost, not already net of the free
// credit — this file is what actually splits each day into its
// free-covered portion vs. its real (billed) portion, so the admin cost
// views can show "this is real money, this isn't" instead of quietly
// treating $5/mo of free usage as if it cost something.
export const APIFY_FREE_TIER_USD = 5;

export interface DailySplitCost {
  date: string;
  freeUsd: number;
  realUsd: number;
}

// Chronological, running-cumulative-per-calendar-month — a day's usage
// only becomes "real" once the month's cumulative total (days processed
// so far THIS month, in date order) exceeds the free tier. The month
// boundary resets the running total to 0, matching Apify's own cycle.
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
