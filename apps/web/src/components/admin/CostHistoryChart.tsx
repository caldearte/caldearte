"use client";

import { Area, AreaChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPeriodLabel, sumAmountByPeriod, type Granularity } from "@/lib/adminAnalyticsBucketing";
import StatBars from "./StatBars";

interface CostRow {
  date: string;
  amountUsd: number;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

// Real historical cost, two OVERLAID (not stacked) areas — same posture
// as NationalOverviewChart: Anthropic and Apify are independent series,
// not parts of one composed total. Anthropic comes from api_usage_log's
// precise per-call ledger; Apify only has a daily snapshot (no per-call
// data reaches us — see apps/curator/src/apify-usage-snapshot's own
// comment), but both reduce to the same {date, amount} shape here.
export default function CostHistoryChart({
  anthropicCostByDay,
  apifyCostByDay,
  periods,
  granularity,
  highlightedPeriodLabel,
}: {
  anthropicCostByDay: CostRow[];
  apifyCostByDay: CostRow[];
  periods: string[];
  granularity: Granularity;
  // Set while hovering a row in CostTable — see TotalCostChart's own
  // comment on why this is hover-driven, not always-on.
  highlightedPeriodLabel?: string | null;
}) {
  const anthropic = sumAmountByPeriod(
    anthropicCostByDay.map((r) => ({ date: r.date, amount: r.amountUsd })),
    periods,
    granularity,
  );
  const apify = sumAmountByPeriod(
    apifyCostByDay.map((r) => ({ date: r.date, amount: r.amountUsd })),
    periods,
    granularity,
  );

  if (granularity === "total") {
    return (
      <StatBars
        items={[
          { label: `Anthropic ${formatUsd(anthropic[0]?.count ?? 0)}`, value: anthropic[0]?.count ?? 0, color: "#ff00fb" },
          { label: `Apify ${formatUsd(apify[0]?.count ?? 0)}`, value: apify[0]?.count ?? 0, color: "#3d373d" },
        ]}
      />
    );
  }

  const apifyByPeriod = new Map(apify.map((a) => [a.period, a.count]));
  const rows = anthropic.map((row) => ({
    label: formatPeriodLabel(row.period, granularity),
    anthropicUsd: row.count,
    apifyUsd: apifyByPeriod.get(row.period) ?? 0,
  }));

  return (
    <div className="w-full h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#00000015" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
          <Tooltip formatter={(value) => formatUsd(Number(value))} />
          <Legend />
          {highlightedPeriodLabel && <ReferenceLine x={highlightedPeriodLabel} stroke="#000000" strokeWidth={3} />}
          <Area type="monotone" dataKey="anthropicUsd" name="Anthropic" stroke="#ff00fb" fill="#ff00fb" fillOpacity={0.35} />
          <Area type="monotone" dataKey="apifyUsd" name="Apify" stroke="#3d373d" fill="#3d373d" fillOpacity={0.25} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
