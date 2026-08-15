"use client";

import { formatPeriodLabel, sumFlowByPeriod, type Granularity } from "@/lib/adminAnalyticsBucketing";

interface SignalRow {
  createdAt: string;
  category: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  convocatoria: "Convocatorias",
  taller_o_charla: "Talleres / charlas",
  otro_evento_no_arte_visual: "Otro (música, teatro, etc.)",
};

// Plain table, same posture as SourceComparisonTable — a handful of
// periods of counts doesn't need a chart to be legible, and this section
// is explicitly framed (see AdminDashboard's own copy) as accumulating
// evidence, not a finished metric worth a polished visualization yet.
// Bucketed with the same shared granularity control as every other
// section (flow semantics — a rejection lands in the period it happened,
// counted once), rather than the fixed month-only buckets this table
// used before.
export default function OutOfScopeTrends({
  signals,
  periods,
  granularity,
}: {
  signals: SignalRow[];
  periods: string[];
  granularity: Granularity;
}) {
  if (signals.length === 0) {
    return <p className="font-geist text-[14px] text-text-primary/70">Sin señales registradas todavía.</p>;
  }

  const categories = [...new Set(signals.map((s) => s.category))].sort();
  const buckets = sumFlowByPeriod(
    signals.map((s) => ({ date: s.createdAt, group: s.category })),
    periods,
    granularity,
  );
  const countByKey = new Map(buckets.map((b) => [`${b.period}|${b.group}`, b.count]));

  const rows = periods
    .map((period) => ({
      period,
      label: formatPeriodLabel(period, granularity),
      counts: categories.map((category) => countByKey.get(`${period}|${category}`) ?? 0),
    }))
    .filter((row) => row.counts.some((c) => c > 0) || granularity === "total");

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-geist text-[14px] text-text-primary border-collapse">
        <thead>
          <tr className="border-b border-text-primary/20 text-left">
            <th className="py-2 pr-4">Período</th>
            {categories.map((category) => (
              <th key={category} className="py-2 pr-4 text-right">
                {CATEGORY_LABELS[category] ?? category}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.period} className="border-b border-text-primary/10">
              <td className="py-2 pr-4">{row.label}</td>
              {row.counts.map((count, i) => (
                <td key={categories[i]} className="py-2 pr-4 text-right">
                  {count}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
