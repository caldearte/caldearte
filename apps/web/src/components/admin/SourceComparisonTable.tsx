interface PipelineRow {
  pipeline: string;
  accepted: number;
  rejected: number;
  avgCostUsdPerEvent: number | null;
  totalCostUsd: number;
  approvalRate: number | null;
}

interface DeadSourceAlert {
  url: string;
  lastFetchedAt: string | null;
  intervalDays: number | null;
  possiblyDead: boolean;
}

interface RegionCoverageRow {
  regionName: string;
  count: number;
}

const PIPELINE_LABELS: Record<string, string> = {
  comuna_search: "Búsqueda por comuna (Tavily)",
  bright_source: "Fuentes brillantes (web)",
  instagram: "Instagram",
  google_alerts: "Google Alerts",
  headless: "MAVI (headless)",
};

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

// Plain server-rendered table — no chart library needed here, the value
// is in the numbers side by side, not a visual trend. Server component
// (no "use client"): purely presentational, no interactivity.
export default function SourceComparisonTable({
  comparison,
  deadSourceAlerts,
  regionCoverage,
}: {
  comparison: PipelineRow[];
  deadSourceAlerts: DeadSourceAlert[];
  regionCoverage: RegionCoverageRow[];
}) {
  return (
    <div className="flex flex-col gap-8">
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
            {comparison.map((row) => (
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

      {deadSourceAlerts.length > 0 && (
        <div>
          <h3 className="font-fragment-mono uppercase text-[14px] text-text-primary mb-2">
            Fuentes posiblemente muertas ({deadSourceAlerts.length})
          </h3>
          <p className="font-geist text-[13px] text-text-primary/60 mb-2">
            Umbral inicial, sin ajustar contra datos reales todavía — a revisar con el tiempo.
          </p>
          <ul className="font-geist text-[13px] text-text-primary flex flex-col gap-1">
            {deadSourceAlerts.map((alert) => (
              <li key={alert.url}>
                {alert.url} — último fetch: {alert.lastFetchedAt ?? "nunca"}
                {alert.intervalDays !== null ? ` (cadencia: ${alert.intervalDays}d)` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="font-fragment-mono uppercase text-[14px] text-text-primary mb-2">Cobertura por región</h3>
        <ul className="font-geist text-[13px] text-text-primary flex flex-col gap-1">
          {regionCoverage.map((row) => (
            <li key={row.regionName} className="flex justify-between max-w-[400px]">
              <span>{row.regionName}</span>
              <span>{row.count}</span>
            </li>
          ))}
          {regionCoverage.length === 0 && <li className="text-text-primary/60">Sin datos en la ventana seleccionada.</li>}
        </ul>
      </div>
    </div>
  );
}
