"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Single stacked horizontal bar — a snapshot of the CURRENT period only
// (not a historical series, unlike EventosChart), with the period's real
// total to the right. Generic over N segments so both /admin sections
// that need this shape (Chile — eventos: 2 segments; Fuentes: one per
// pipeline group) reuse the exact same component — Daniel's explicit
// request 2026-08-17 ("mismo gráfico de Chile eventos" for Fuentes).
export default function StackedPeriodBar({
  segments,
  total,
  totalLabel,
}: {
  segments: { label: string; value: number; color: string }[];
  total: number;
  totalLabel: string;
}) {
  const data = [Object.fromEntries([["name", "Eventos"], ...segments.map((s) => [s.label, s.value])])];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
      <div className="flex flex-col gap-2">
        <div className="w-full h-[80px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" hide />
              <Tooltip />
              {segments.map((s) => (
                <Bar key={s.label} dataKey={s.label} stackId="a" fill={s.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-4 font-geist text-[13px] text-text-primary">
          {segments.map((s) => (
            <span key={s.label} className="flex items-center gap-2">
              <span className="w-[10px] h-[10px] rounded-full inline-block" style={{ background: s.color }} />
              {s.label} ({s.value})
            </span>
          ))}
        </div>
      </div>
      <div className="text-center">
        <div className="font-fragment-mono text-[48px] text-text-primary leading-none">{total}</div>
        <div className="font-geist text-[13px] text-text-primary/60">{totalLabel}</div>
      </div>
    </div>
  );
}
