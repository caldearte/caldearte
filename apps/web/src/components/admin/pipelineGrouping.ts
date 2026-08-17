import { PIPELINE_LABELS } from "./pipelineLabels";

interface PipelineComparisonRow {
  pipeline: string;
  accepted: number;
  rejected: number;
  avgCostUsdPerEvent: number | null;
  totalCostUsd: number;
  approvalRate: number | null;
}

export interface MergedPipelineRow {
  label: string;
  accepted: number;
  rejected: number;
  totalCostUsd: number;
  avgCostUsdPerEvent: number | null;
  approvalRate: number | null;
}

// "Web" merges bright_source + headless (MAVI) into one group — MAVI is
// itself a website scrape, it shouldn't read as a category separate from
// "web" (Daniel's explicit correction, 2026-08-16/17). Shared by every
// place that groups events/pipelineComparison rows by fuente, so
// /admin's summary and /admin/fuentes' detail always agree on the same
// grouping instead of drifting (real inconsistency found 2026-08-17:
// they used to group differently).
export function groupPipelineLabel(pipeline: string | null): string {
  if (pipeline === null) return "Sin atribuir";
  if (pipeline === "bright_source" || pipeline === "headless") return "Web";
  if (pipeline === "instagram") return "Instagram";
  return PIPELINE_LABELS[pipeline] ?? pipeline;
}

// Aggregates pipelineComparison rows (admin-analytics' all-time,
// per-pipeline accepted/rejected/cost figures) onto the same "Web"/
// "Instagram"/... groups groupPipelineLabel defines — full merged shape
// so every consumer (SourceComparisonTable's full table,
// FuentesMetricsTable's rejected%/costo-por-evento pair) can pick just
// the columns it needs from one shared computation.
export function mergePipelineComparison(comparison: PipelineComparisonRow[]): MergedPipelineRow[] {
  const totals = new Map<string, { accepted: number; rejected: number; totalCostUsd: number }>();
  for (const row of comparison) {
    const label = groupPipelineLabel(row.pipeline);
    const g = totals.get(label) ?? { accepted: 0, rejected: 0, totalCostUsd: 0 };
    g.accepted += row.accepted;
    g.rejected += row.rejected;
    g.totalCostUsd += row.totalCostUsd;
    totals.set(label, g);
  }
  return [...totals.entries()].map(([label, g]) => ({
    label,
    accepted: g.accepted,
    rejected: g.rejected,
    totalCostUsd: g.totalCostUsd,
    avgCostUsdPerEvent: g.accepted > 0 ? g.totalCostUsd / g.accepted : null,
    approvalRate: g.accepted + g.rejected > 0 ? g.accepted / (g.accepted + g.rejected) : null,
  }));
}
