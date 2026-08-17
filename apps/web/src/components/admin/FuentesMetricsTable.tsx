"use client";

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

// "Web" merges bright_source + headless (MAVI) into one row — MAVI is
// itself a website scrape, it shouldn't read as a category separate from
// "web" (Daniel's explicit correction, 2026-08-17: "mavi... no debería
// estar [separado]"). Every other real pipeline value keeps its own row.
function mergeWebGroups(comparison: PipelineRow[]): { label: string; approvalRate: number | null; avgCostUsdPerEvent: number | null }[] {
  const web = comparison.filter((r) => r.pipeline === "bright_source" || r.pipeline === "headless");
  const rest = comparison.filter((r) => r.pipeline !== "bright_source" && r.pipeline !== "headless");

  const rows: { label: string; approvalRate: number | null; avgCostUsdPerEvent: number | null }[] = [];
  if (web.length > 0) {
    const accepted = web.reduce((sum, r) => sum + r.accepted, 0);
    const rejected = web.reduce((sum, r) => sum + r.rejected, 0);
    const totalCostUsd = web.reduce((sum, r) => sum + r.totalCostUsd, 0);
    rows.push({
      label: "Web",
      approvalRate: accepted + rejected > 0 ? accepted / (accepted + rejected) : null,
      avgCostUsdPerEvent: accepted > 0 ? totalCostUsd / accepted : null,
    });
  }
  for (const r of rest) {
    rows.push({
      label: r.pipeline === "instagram" ? "Instagram" : (PIPELINE_LABELS[r.pipeline] ?? r.pipeline),
      approvalRate: r.approvalRate,
      avgCostUsdPerEvent: r.avgCostUsdPerEvent,
    });
  }
  return rows;
}

// Companion table to /admin's "Fuentes" summary bar — % rechazadas y
// costo promedio por evento válido, por fuente (Daniel's explicit
// request, 2026-08-17). All-time, same posture as SourceComparisonTable
// (/admin/fuentes) — this isn't period-scoped, just a compact per-source
// efficiency read next to the current-period event-count bar.
export default function FuentesMetricsTable({ comparison }: { comparison: PipelineRow[] }) {
  const rows = mergeWebGroups(comparison);

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
