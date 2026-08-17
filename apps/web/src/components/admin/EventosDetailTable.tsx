"use client";

import { countActiveByPeriod, formatPeriodLabel, isEventInPeriod, sumFlowByPeriod, type Granularity } from "@/lib/adminAnalyticsBucketing";

interface EventRow {
  openingDate: string | null;
  runStart: string | null;
  runEnd: string | null;
}

// Companion table to EventosChart — same "copying numbers off an area
// chart is hard" reasoning as CostTable, plus the same hover→ReferenceLine
// sync (onHoverPeriod). Difference from CostTable: `activePeriod` is
// never null here — EventosPeriodBlock always supplies either the hovered
// row's period or, when nothing's hovered, the CURRENT period — so the
// current-period row stays visibly highlighted even at rest, not just on
// hover (Daniel's explicit request, 2026-08-17).
export default function EventosDetailTable({
  events,
  periods,
  granularity,
  activePeriod,
  onHoverPeriod,
}: {
  events: EventRow[];
  periods: string[];
  granularity: Granularity;
  activePeriod: string;
  onHoverPeriod?: (period: string | null) => void;
}) {
  const inauguraciones = sumFlowByPeriod(
    events.map((e) => ({ date: e.openingDate })),
    periods,
    granularity,
  );
  const activas = countActiveByPeriod(
    events.map((e) => ({ start: e.runStart, end: e.runEnd })),
    periods,
    granularity,
  );
  const activasByPeriod = new Map(activas.map((a) => [a.period, a.count]));

  const rows = inauguraciones.map((row) => {
    // Distinct total (not a sum of the two columns) — an event that's
    // both an inauguración and an active exposición this period counts
    // once, same rule as EventosSummaryBar's total (2026-08-17).
    const total = events.filter((e) => isEventInPeriod(e, row.period, granularity)).length;
    return {
      period: row.period,
      label: formatPeriodLabel(row.period, granularity),
      inauguraciones: row.count,
      exposicionesActivas: activasByPeriod.get(row.period) ?? 0,
      total,
    };
  });
  rows.reverse(); // most recent period first, same convention as CostTable

  if (rows.length === 0) {
    return <p className="font-geist text-[14px] text-text-primary/70">Sin datos todavía.</p>;
  }

  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[240px]">
      <table className="w-full font-geist text-[14px] text-text-primary border-collapse">
        <thead className="sticky top-0 bg-surface-sage">
          <tr className="text-left border-b border-text-primary/20">
            <th className="py-2 pr-4">Período</th>
            <th className="py-2 pr-4 text-right">Inauguraciones</th>
            <th className="py-2 pr-4 text-right">Exposiciones activas</th>
            <th className="py-2 pr-4 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.period}
              className={`border-b border-text-primary/10 hover:bg-surface-white ${row.period === activePeriod ? "bg-surface-white" : ""}`}
              onMouseEnter={() => onHoverPeriod?.(row.period)}
              onMouseLeave={() => onHoverPeriod?.(null)}
            >
              <td className="py-2 pr-4">{row.label}</td>
              <td className="py-2 pr-4 text-right">{row.inauguraciones}</td>
              <td className="py-2 pr-4 text-right">{row.exposicionesActivas}</td>
              <td className="py-2 pr-4 text-right">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
