interface BrightSourceRow {
  url: string;
  lastFetchedAt: string | null;
  intervalDays: number | null;
  accepted: number;
  rejected: number;
  possiblyDead: boolean;
}

// Already sorted server-side (best performing first, possibly-dead
// trailing) — see admin-analytics/index.ts's bySourceRank. No per-source
// cost column: api_usage_log only tracks cost per pipeline, not per
// individual source (a Claude call typically batches many candidates
// from many sources at once).
export default function BrightSourcesTable({ sources }: { sources: BrightSourceRow[] }) {
  if (sources.length === 0) {
    return <p className="font-geist text-[14px] text-text-primary/70">Sin fuentes registradas todavía.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-geist text-[14px] text-text-primary border-collapse">
        <thead>
          <tr className="border-b border-text-primary/20 text-left">
            <th className="py-2 pr-4">Fuente</th>
            <th className="py-2 pr-4 text-right">Aceptados</th>
            <th className="py-2 pr-4 text-right">Rechazados</th>
            <th className="py-2 pr-4">Último fetch</th>
            <th className="py-2 pr-4 text-right">Cadencia</th>
            <th className="py-2 pr-4">Estado</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((row) => (
            <tr key={row.url} className={`border-b border-text-primary/10 ${row.possiblyDead ? "opacity-60" : ""}`}>
              <td className="py-2 pr-4 break-all">{row.url}</td>
              <td className="py-2 pr-4 text-right">{row.accepted}</td>
              <td className="py-2 pr-4 text-right">{row.rejected}</td>
              <td className="py-2 pr-4">{row.lastFetchedAt ?? "nunca"}</td>
              <td className="py-2 pr-4 text-right">{row.intervalDays !== null ? `${row.intervalDays}d` : "—"}</td>
              <td className="py-2 pr-4">{row.possiblyDead ? "Posiblemente muerta" : "Activa"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
