"use client";

import { formatPeriodLabel, sumAmountByPeriod, type Granularity } from "@/lib/adminAnalyticsBucketing";
import { splitApifyFreeTier } from "@/lib/apifyCostSplit";

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
//
// Apify gets its own Gratuito/Real sub-columns (2026-08-16, real
// question from Daniel: "why are we counting Apify's $5/mo free tier as
// real cost?") — Total only ever sums the REAL column, never Gratuito;
// Gratuito is shown muted specifically so it visually reads as "not
// counted," not just as another number.
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
  const apifySplit = splitApifyFreeTier(apifyCostByDay);

  const anthropic = sumAmountByPeriod(
    anthropicCostByDay.map((r) => ({ date: r.date, amount: r.amountUsd })),
    periods,
    granularity,
  );
  const apifyFree = sumAmountByPeriod(
    apifySplit.map((r) => ({ date: r.date, amount: r.freeUsd })),
    periods,
    granularity,
  );
  const apifyReal = sumAmountByPeriod(
    apifySplit.map((r) => ({ date: r.date, amount: r.realUsd })),
    periods,
    granularity,
  );
  const apifyFreeByPeriod = new Map(apifyFree.map((row) => [row.period, row.count]));
  const apifyRealByPeriod = new Map(apifyReal.map((row) => [row.period, row.count]));

  const rows = anthropic.map((row) => {
    const anthropicUsd = row.count;
    const apifyFreeUsd = apifyFreeByPeriod.get(row.period) ?? 0;
    const apifyRealUsd = apifyRealByPeriod.get(row.period) ?? 0;
    return {
      period: row.period,
      label: formatPeriodLabel(row.period, granularity),
      anthropicUsd,
      apifyFreeUsd,
      apifyRealUsd,
      totalUsd: anthropicUsd + apifyRealUsd,
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
          <tr className="text-left">
            <th className="py-2 pr-4 align-top" rowSpan={2}>
              Período
            </th>
            <th className="py-2 pr-4 text-right align-top" rowSpan={2}>
              Anthropic
            </th>
            <th className="py-2 text-center align-top" colSpan={2}>
              Apify
            </th>
            <th className="py-2 pr-4 text-right align-top" rowSpan={2}>
              Total
            </th>
          </tr>
          <tr className="border-b border-text-primary/20 text-left">
            <th className="pb-2 pr-4 text-right font-normal text-text-primary/60">Gratuito</th>
            <th className="pb-2 pr-4 text-right font-normal">Real</th>
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
              {/* Muted on purpose — not real money, not part of Total. */}
              <td className="py-2 pr-4 text-right text-text-primary/40">{formatUsd(row.apifyFreeUsd)}</td>
              <td className="py-2 pr-4 text-right">{formatUsd(row.apifyRealUsd)}</td>
              <td className="py-2 pr-4 text-right">{formatUsd(row.totalUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
