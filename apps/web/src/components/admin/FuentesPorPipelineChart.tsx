"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { sumFlowByPeriod, type Granularity } from "@/lib/adminAnalyticsBucketing";
import { shortRegionName } from "@/lib/regionNames";
import { colorFor } from "./chartPalette";
import { PIPELINE_LABELS } from "./pipelineLabels";
import { pivotBuckets } from "./pivotBuckets";
import StatBars from "./StatBars";

interface EventRow {
  openingDate: string | null;
  runStart: string | null;
  adminRegionName: string | null;
  pipeline: string | null;
}

const ALL_CHILE = "__all__";
const SIN_ATRIBUIR = "Sin atribuir";

// Chart 4: stacked by pipeline, "todo Chile" by default with a región
// selector to drill into one región's own source composition — same
// component serves both views, avoiding building one chart per región
// up front.
export default function FuentesPorPipelineChart({
  events,
  periods,
  granularity,
}: {
  events: EventRow[];
  periods: string[];
  granularity: Granularity;
}) {
  const [selectedRegion, setSelectedRegion] = useState<string>(ALL_CHILE);

  const regionOptions = useMemo(() => {
    const names = new Set<string>();
    for (const e of events) if (e.adminRegionName) names.add(e.adminRegionName);
    return [...names].sort();
  }, [events]);

  const filtered = selectedRegion === ALL_CHILE ? events : events.filter((e) => e.adminRegionName === selectedRegion);
  const items = filtered.map((e) => ({
    date: e.openingDate ?? e.runStart,
    group: e.pipeline ? (PIPELINE_LABELS[e.pipeline] ?? e.pipeline) : SIN_ATRIBUIR,
  }));
  const buckets = sumFlowByPeriod(items, periods, granularity);

  const selector = (
    <select
      value={selectedRegion}
      onChange={(e) => setSelectedRegion(e.target.value)}
      className="font-geist text-[13px] text-text-primary border border-text-primary/30 rounded-sm px-2 py-1 bg-surface-sage"
    >
      <option value={ALL_CHILE}>Todo Chile</option>
      {regionOptions.map((name) => (
        <option key={name} value={name}>
          {shortRegionName(name)}
        </option>
      ))}
    </select>
  );

  if (granularity === "total") {
    const totals = new Map<string, number>();
    for (const b of buckets) {
      const key = b.group ?? SIN_ATRIBUIR;
      totals.set(key, (totals.get(key) ?? 0) + b.count);
    }
    const summary = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: colorFor(i) }));
    return (
      <div className="flex flex-col gap-3">
        {selector}
        <StatBars items={summary} />
      </div>
    );
  }

  const { rows, groups } = pivotBuckets(buckets, periods, granularity);

  return (
    <div className="flex flex-col gap-3">
      {selector}
      {groups.length === 0 ? (
        <p className="font-geist text-[14px] text-text-primary/70">Sin datos para esta región.</p>
      ) : (
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
      )}
    </div>
  );
}
