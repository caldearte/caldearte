import { formatPeriodLabel, type Granularity, type PeriodBucket } from "@/lib/adminAnalyticsBucketing";

export interface PivotedRow {
  period: string;
  label: string;
  [group: string]: string | number;
}

const NO_GROUP_LABEL = "Sin dato";

// Reshapes the (period, group, count) triples every bucketing function
// returns into recharts' expected wide-row shape — one row per period,
// one column per group — shared by the 3 stacked-area charts (región x2,
// pipeline x1) so this pivot logic exists in exactly one place.
export function pivotBuckets(
  buckets: PeriodBucket[],
  periods: string[],
  granularity: Granularity,
): { rows: PivotedRow[]; groups: string[] } {
  const groups = [...new Set(buckets.map((b) => b.group ?? NO_GROUP_LABEL))].sort();

  const rows: PivotedRow[] = periods.map((period) => {
    const row: PivotedRow = { period, label: formatPeriodLabel(period, granularity) };
    for (const group of groups) row[group] = 0;
    return row;
  });
  const rowByPeriod = new Map(rows.map((r) => [r.period, r]));

  for (const bucket of buckets) {
    const row = rowByPeriod.get(bucket.period);
    if (!row) continue;
    row[bucket.group ?? NO_GROUP_LABEL] = bucket.count;
  }

  return { rows, groups };
}
