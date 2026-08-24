export interface CadenciaSourceRow {
  // "@handle" for Instagram, the bare URL for every other category —
  // CadenciaPage formats each before handing rows here.
  label: string;
  // Daniel 2026-08-23: one flat list of cadence tiers regardless of
  // origin, with the origin shown per-row instead of splitting into
  // separate sections per category.
  category: "Instagram" | "Web" | "Headless" | "Google Alerts";
  lastFetchedAt: string | null;
  accepted: number;
  rejected: number;
  isInactive: boolean;
  consecutiveZeroYieldAtCap: number;
}

// Días desde el último fetch real. Ya no hay tramos de cadencia que
// "alcanzar" (eliminados 2026-08-24 — todas las fuentes corren en cada
// disparo de su cron) — esta columna es puramente informativa, frescura
// del dato, no un indicador de en qué escalón está la cuenta.
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

// "Calidad" simple: aprobados vs. total con veredicto. Una cuenta sin
// ningún aprobado ni rechazado ("Sin datos aún") no es necesariamente
// mala — puede llevar poco tiempo o su único fetch no trajo nada nuevo
// para curar — se distingue explícitamente de "0% de aprobación" (que sí
// tuvo intentos y ninguno calificó).
function qualityLabel(accepted: number, rejected: number): string {
  const total = accepted + rejected;
  if (total === 0) return "Sin datos aún";
  return `${Math.round((accepted / total) * 100)}% aprobación (${accepted}/${total})`;
}

export default function CadenciaSourceList({ sources }: { sources: CadenciaSourceRow[] }) {
  if (sources.length === 0) {
    return <p className="font-geist text-[13px] text-text-primary/50 py-2">Ninguna fuente en esta cadencia.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-geist text-[13px] text-text-primary border-collapse">
        <thead>
          <tr className="border-b border-text-primary/20 text-left">
            <th className="py-2 pr-4">Origen</th>
            <th className="py-2 pr-4">Fuente</th>
            <th className="py-2 pr-4">Calidad</th>
            <th className="py-2 pr-4 text-right">Hace (días)</th>
            <th className="py-2 pr-4">Último fetch</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((row) => {
            const days = daysSince(row.lastFetchedAt);
            return (
              <tr key={row.label} className="border-b border-text-primary/10">
                <td className="py-2 pr-4 whitespace-nowrap">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-text-primary/10 text-[11px] uppercase tracking-wide">
                    {row.category}
                  </span>
                </td>
                <td className="py-2 pr-4 break-all">
                  {row.label}
                  {row.isInactive && <span className="ml-2 text-text-primary/40">(inactiva, no se revisa sola)</span>}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap">{qualityLabel(row.accepted, row.rejected)}</td>
                <td className="py-2 pr-4 text-right">{days !== null ? `${days}d` : "—"}</td>
                <td className="py-2 pr-4 text-text-primary/60">{row.lastFetchedAt ? row.lastFetchedAt.slice(0, 10) : "nunca"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
