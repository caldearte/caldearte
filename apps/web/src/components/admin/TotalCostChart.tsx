"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPeriodLabel, sumAmountByPeriod, type Granularity } from "@/lib/adminAnalyticsBucketing";
import StatBars from "./StatBars";

interface CostRow {
  date: string;
  amountUsd: number;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

// Single merged series (Anthropic + Apify summed together) — the
// companion "how much total" view next to CostHistoryChart's "which
// service" breakdown.
export default function TotalCostChart({
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
  // Set while hovering a row in CostTable — unlike the always-on
  // ReferenceLine on the main /admin dashboard's charts, this one only
  // shows on hover (Daniel's explicit request, 2026-08-16), since
  // "current period" isn't a meaningful default here.
  highlightedPeriodLabel?: string | null;
}) {
  const merged = [...anthropicCostByDay, ...apifyCostByDay].map((r) => ({ date: r.date, amount: r.amountUsd }));
  const total = sumAmountByPeriod(merged, periods, granularity);

  if (granularity === "total") {
    return <StatBars items={[{ label: `Total ${formatUsd(total[0]?.count ?? 0)}`, value: total[0]?.count ?? 0, color: "#ff00fb" }]} />;
  }

  const rows = total.map((row) => ({ label: formatPeriodLabel(row.period, granularity), totalUsd: row.count }));

  return (
    <div className="w-full h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#00000015" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
          <Tooltip formatter={(value) => formatUsd(Number(value))} />
          {highlightedPeriodLabel && <ReferenceLine x={highlightedPeriodLabel} stroke="#000000" strokeWidth={3} />}
          <Area type="monotone" dataKey="totalUsd" name="Total" stroke="#ff00fb" fill="#ff00fb" fillOpacity={0.35} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
