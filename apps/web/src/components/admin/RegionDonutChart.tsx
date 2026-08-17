"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { colorFor } from "./chartPalette";

// First donut/pie chart in this codebase (2026-08-17) — every other admin
// chart is a stacked/overlaid area, but "Santiago vs otras regiones" and
// "las 16 regiones" read better as a proportion of a whole than as a time
// series (this is a current-period snapshot, not history). Reuses
// colorFor() (chartPalette.ts) for slice colors, same palette the
// stacked-area charts already use, so colors stay consistent app-wide.
export default function RegionDonutChart({ data }: { data: { name: string; value: number }[] }) {
  const nonZero = data.filter((d) => d.value > 0);

  if (nonZero.length === 0) {
    return <p className="font-geist text-[14px] text-text-primary/70">Sin datos para este período.</p>;
  }

  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={nonZero} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
            {nonZero.map((entry, i) => (
              <Cell key={entry.name} fill={colorFor(i)} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
