export interface CadenciaSourceRow {
  username: string;
  lastFetchedAt: string | null;
  accepted: number;
  rejected: number;
  isInactive: boolean;
  consecutiveZeroYieldAtCap: number;
}

// Días desde que la cuenta llegó a SU cadencia actual — last_fetched_at
// se actualiza junto con interval_days en cada fetch real
// (recordInstagramFetchState los escribe en el mismo upsert), así que
// "última vez que se revisó" y "desde cuándo tiene este intervalo" son
// siempre el mismo dato — no hay que guardar nada nuevo para esto.
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
    return <p className="font-geist text-[13px] text-text-primary/50 py-2">Ninguna cuenta en esta cadencia.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-geist text-[13px] text-text-primary border-collapse">
        <thead>
          <tr className="border-b border-text-primary/20 text-left">
            <th className="py-2 pr-4">Cuenta</th>
            <th className="py-2 pr-4">Calidad</th>
            <th className="py-2 pr-4 text-right">Días en esta cadencia</th>
            <th className="py-2 pr-4">Último fetch</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((row) => {
            const days = daysSince(row.lastFetchedAt);
            return (
              <tr key={row.username} className="border-b border-text-primary/10">
                <td className="py-2 pr-4">
                  @{row.username}
                  {row.isInactive && <span className="ml-2 text-text-primary/40">(inactiva, no se revisa sola)</span>}
                </td>
                <td className="py-2 pr-4">{qualityLabel(row.accepted, row.rejected)}</td>
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
