"use client";

import { mergePipelineComparison } from "./pipelineGrouping";

interface PipelineRow {
  pipeline: string;
  accepted: number;
  rejected: number;
  avgCostUsdPerEvent: number | null;
  totalCostUsd: number;
  approvalRate: number | null;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

// Companion table to /admin's "Fuentes" summary bar — % rechazadas y
// costo promedio por evento válido, por fuente (Daniel's explicit
// request, 2026-08-17). All-time, same posture as SourceComparisonTable
// (/admin/fuentes) — this isn't period-scoped, just a compact per-source
// efficiency read next to the current-period event-count bar. Same
// grouping as SourceComparisonTable (mergePipelineComparison,
// pipelineGrouping.ts) so both agree on "Web" including MAVI.
export default function FuentesMetricsTable({ comparison }: { comparison: PipelineRow[] }) {
  const rows = mergePipelineComparison(comparison);

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-geist text-[14px] text-text-primary border-collapse">
        <thead>
          <tr className="border-b border-text-primary/20 text-left">
            <th className="py-2 pr-4">Fuente</th>
            <th className="py-2 pr-4 text-right">% rechazadas</th>
            <th className="py-2 pr-4 text-right">Costo/evento válido</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-text-primary/10">
              <td className="py-2 pr-4">{row.label}</td>
              <td className="py-2 pr-4 text-right">{formatPercent(row.approvalRate === null ? null : 1 - row.approvalRate)}</td>
              <td className="py-2 pr-4 text-right">{row.avgCostUsdPerEvent === null ? "—" : formatUsd(row.avgCostUsdPerEvent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
