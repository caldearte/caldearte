import { PIPELINE_LABELS } from "./pipelineLabels";

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
// is in the numbers side by side, not a visual trend. Sorted cheapest
// cost/evento first (nulls — no accepted events yet — trail last), so
// the most cost-efficient pipeline reads at the top.
export default function SourceComparisonTable({ comparison }: { comparison: PipelineRow[] }) {
  const sorted = [...comparison].sort((a, b) => {
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
            <th className="py-2 pr-4">Pipeline</th>
            <th className="py-2 pr-4 text-right">Aceptados</th>
            <th className="py-2 pr-4 text-right">Rechazados</th>
            <th className="py-2 pr-4 text-right">% aprobación</th>
            <th className="py-2 pr-4 text-right">Costo total (aprox.)</th>
            <th className="py-2 pr-4 text-right">Costo/evento (aprox.)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.pipeline} className="border-b border-text-primary/10">
              <td className="py-2 pr-4">{PIPELINE_LABELS[row.pipeline] ?? row.pipeline}</td>
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
