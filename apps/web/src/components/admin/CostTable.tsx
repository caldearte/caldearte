"use client";

import { formatPeriodLabel, sumAmountByPeriod, type Granularity } from "@/lib/adminAnalyticsBucketing";

interface CostRow {
  date: string;
  amountUsd: number;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

// Plain table below the charts — copying exact numbers off an area
// chart is genuinely hard (Daniel's explicit request, 2026-08-16); this
// updates with the same granularity toggle the charts use, one row per
// period, easy to select/copy. Hovering a row also drives the vertical
// "you are pointing here" ReferenceLine on both charts above (via
// onHoverPeriod, raw period key — CostosPage formats it per chart).
export default function CostTable({
  anthropicCostByDay,
  apifyCostByDay,
  periods,
  granularity,
  onHoverPeriod,
}: {
  anthropicCostByDay: CostRow[];
  apifyCostByDay: CostRow[];
  periods: string[];
  granularity: Granularity;
  onHoverPeriod?: (period: string | null) => void;
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
  const apifyByPeriod = new Map(apify.map((row) => [row.period, row.count]));

  const rows = anthropic.map((row) => {
    const anthropicUsd = row.count;
    const apifyUsd = apifyByPeriod.get(row.period) ?? 0;
    return {
      period: row.period,
      label: formatPeriodLabel(row.period, granularity),
      anthropicUsd,
      apifyUsd,
      totalUsd: anthropicUsd + apifyUsd,
    };
  });
  rows.reverse(); // most recent period first — easier to scan/copy than oldest-first

  if (rows.length === 0) {
    return <p className="font-geist text-[14px] text-text-primary/70">Sin datos todavía.</p>;
  }

  return (
    // Fixed height showing ~5 data rows + header, scrolls for the rest
    // (Daniel's explicit request, 2026-08-16) — header stays pinned
    // (sticky) while scrolling so the columns stay legible.
    <div className="overflow-x-auto overflow-y-auto max-h-[240px]">
      <table className="w-full font-geist text-[14px] text-text-primary border-collapse">
        <thead className="sticky top-0 bg-surface-sage">
          <tr className="border-b border-text-primary/20 text-left">
            <th className="py-2 pr-4">Período</th>
            <th className="py-2 pr-4 text-right">Anthropic</th>
            <th className="py-2 pr-4 text-right">Apify</th>
            <th className="py-2 pr-4 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.period}
              className="border-b border-text-primary/10 hover:bg-surface-white"
              onMouseEnter={() => onHoverPeriod?.(row.period)}
              onMouseLeave={() => onHoverPeriod?.(null)}
            >
              <td className="py-2 pr-4">{row.label}</td>
              <td className="py-2 pr-4 text-right">{formatUsd(row.anthropicUsd)}</td>
              <td className="py-2 pr-4 text-right">{formatUsd(row.apifyUsd)}</td>
              <td className="py-2 pr-4 text-right">{formatUsd(row.totalUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
