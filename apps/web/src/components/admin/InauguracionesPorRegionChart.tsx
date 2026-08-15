"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { sumFlowByPeriod, type Granularity } from "@/lib/adminAnalyticsBucketing";
import { shortRegionName } from "@/lib/regionNames";
import { colorFor } from "./chartPalette";
import { pivotBuckets } from "./pivotBuckets";
import StatBars from "./StatBars";

interface EventRow {
  openingDate: string | null;
  adminRegionName: string | null;
}

const SIN_REGION = "Sin región";

// Chart 3: same stacked shape as chart 2, but FLOW semantics — an
// opening counts once, in the period it happened.
export default function InauguracionesPorRegionChart({
  events,
  periods,
  granularity,
}: {
  events: EventRow[];
  periods: string[];
  granularity: Granularity;
}) {
  const items = events.map((e) => ({
    date: e.openingDate,
    group: e.adminRegionName ? shortRegionName(e.adminRegionName) : SIN_REGION,
  }));
  const buckets = sumFlowByPeriod(items, periods, granularity);

  if (granularity === "total") {
    const totals = new Map<string, number>();
    for (const b of buckets) {
      const key = b.group ?? SIN_REGION;
      totals.set(key, (totals.get(key) ?? 0) + b.count);
    }
    const summary = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: colorFor(i) }));
    return <StatBars items={summary} />;
  }

  const { rows, groups } = pivotBuckets(buckets, periods, granularity);
  if (groups.length === 0) {
    return <p className="font-geist text-[14px] text-text-primary/70">Sin datos.</p>;
  }

  return (
    <div className="w-full h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#00000015" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {groups.map((group, i) => (
            <Area key={group} type="monotone" dataKey={group} name={group} stackId="1" stroke={colorFor(i)} fill={colorFor(i)} fillOpacity={0.75} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
