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

// Plain server-rendered table — no chart library needed here, the value
// is in the numbers side by side, not a visual trend. Grouped via
// mergePipelineComparison (Web = bright_source + headless/MAVI merged,
// 2026-08-17 — see that file's own comment) so this always agrees with
// /admin's summary grouping instead of showing MAVI as its own row here.
// Sorted cheapest cost/evento first (nulls — no accepted events yet —
// trail last), so the most cost-efficient fuente reads at the top.
export default function SourceComparisonTable({ comparison }: { comparison: PipelineRow[] }) {
  const rows = mergePipelineComparison(comparison);
  const sorted = [...rows].sort((a, b) => {
    if (a.avgCostUsdPerEvent === null && b.avgCostUsdPerEvent === null) return 0;
    if (a.avgCostUsdPerEvent === null) return 1;
    if (b.avgCostUsdPerEvent === null) return -1;
    return a.avgCostUsdPerEvent - b.avgCostUsdPerEvent;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-geist text-[14px] text-text-primary border-collapse">
        <thead>
          <tr className="border-b border-text-primary/20 text-left">
            <th className="py-2 pr-4">Fuente</th>
            <th className="py-2 pr-4 text-right">Aceptados</th>
            <th className="py-2 pr-4 text-right">Rechazados</th>
            <th className="py-2 pr-4 text-right">% aprobación</th>
            <th className="py-2 pr-4 text-right">Costo total (aprox.)</th>
            <th className="py-2 pr-4 text-right">Costo/evento (aprox.)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.label} className="border-b border-text-primary/10">
              <td className="py-2 pr-4">{row.label}</td>
              <td className="py-2 pr-4 text-right">{row.accepted}</td>
              <td className="py-2 pr-4 text-right">{row.rejected}</td>
              <td className="py-2 pr-4 text-right">{formatPercent(row.approvalRate)}</td>
              <td className="py-2 pr-4 text-right">{formatUsd(row.totalCostUsd)}</td>
              <td className="py-2 pr-4 text-right">{row.avgCostUsdPerEvent === null ? "—" : formatUsd(row.avgCostUsdPerEvent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
