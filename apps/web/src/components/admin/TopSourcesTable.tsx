export interface TopSourceRow {
  // "@handle" for Instagram, the bare URL for every other category.
  label: string;
  category: "Instagram" | "Web" | "Headless" | "Google Alerts";
  lastFetchedAt: string | null;
  accepted: number;
  rejected: number;
  possiblyDead: boolean;
}

// "Calidad" simple: aprobados vs. total con veredicto. Una fuente sin
// ningún aprobado ni rechazado ("Sin datos aún") no es necesariamente
// mala — puede llevar poco tiempo o su único fetch no trajo nada nuevo
// para curar — se distingue explícitamente de "0% de aprobación" (que sí
// tuvo intentos y ninguno calificó).
function qualityLabel(accepted: number, rejected: number): string {
  const total = accepted + rejected;
  if (total === 0) return "Sin datos aún";
  return `${Math.round((accepted / total) * 100)}% aprobación (${accepted}/${total})`;
}

// Reemplaza las 2 listas separadas (BrightSourcesTable/InstagramSourcesTable,
// todas las fuentes de cada categoría) por una sola lista combinada de las
// 20 mejores — Daniel 2026-08-24: "quiero quitar la lista larga de todas
// las fuentes y dejar solo una lista de las top 20". Ranking y el corte a
// 20 se hacen en FuentesPage.tsx (mismo criterio ya usado server-side por
// admin-analytics/index.ts's bySourceRank: más aprobados primero,
// posiblemente muertas al final), esta tabla solo renderiza lo que recibe.
export default function TopSourcesTable({ sources }: { sources: TopSourceRow[] }) {
  if (sources.length === 0) {
    return <p className="font-geist text-[14px] text-text-primary/70">Sin fuentes registradas todavía.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-geist text-[14px] text-text-primary border-collapse">
        <thead>
          <tr className="border-b border-text-primary/20 text-left">
            <th className="py-2 pr-4">Origen</th>
            <th className="py-2 pr-4">Fuente</th>
            <th className="py-2 pr-4">Calidad</th>
            <th className="py-2 pr-4">Último fetch</th>
            <th className="py-2 pr-4">Estado</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((row) => (
            <tr key={`${row.category}:${row.label}`} className={`border-b border-text-primary/10 ${row.possiblyDead ? "opacity-60" : ""}`}>
              <td className="py-2 pr-4 whitespace-nowrap">
                <span className="inline-block px-2 py-0.5 rounded-full bg-text-primary/10 text-[11px] uppercase tracking-wide">
                  {row.category}
                </span>
              </td>
              <td className="py-2 pr-4 break-all">{row.label}</td>
              <td className="py-2 pr-4 whitespace-nowrap">{qualityLabel(row.accepted, row.rejected)}</td>
              <td className="py-2 pr-4 text-text-primary/60">{row.lastFetchedAt ? row.lastFetchedAt.slice(0, 10) : "nunca"}</td>
              <td className="py-2 pr-4">{row.possiblyDead ? "Posiblemente muerta" : "Activa"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
