interface InstagramSourceRow {
  username: string;
  lastFetchedAt: string | null;
  intervalDays: number | null;
  accepted: number;
  rejected: number;
  possiblyDead: boolean;
}

// Same shape as BrightSourcesTable, keyed by @username instead of url —
// already sorted server-side (best performing first, possibly-dead
// trailing), see admin-analytics/index.ts's bySourceRank.
//
// No "Cadencia" column, 2026-08-24 — no cadence concept left to show
// (every source runs on every cron fire, see instagram-fetch-state.ts's
// own doc comment); intervalDays stays in the row shape since the edge
// function still sends it, just unused here now.
export default function InstagramSourcesTable({ sources }: { sources: InstagramSourceRow[] }) {
  if (sources.length === 0) {
    return <p className="font-geist text-[14px] text-text-primary/70">Sin cuentas registradas todavía.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-geist text-[14px] text-text-primary border-collapse">
        <thead>
          <tr className="border-b border-text-primary/20 text-left">
            <th className="py-2 pr-4">Cuenta</th>
            <th className="py-2 pr-4 text-right">Aceptados</th>
            <th className="py-2 pr-4 text-right">Rechazados</th>
            <th className="py-2 pr-4">Último fetch</th>
            <th className="py-2 pr-4">Estado</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((row) => (
            <tr key={row.username} className={`border-b border-text-primary/10 ${row.possiblyDead ? "opacity-60" : ""}`}>
              <td className="py-2 pr-4">@{row.username}</td>
              <td className="py-2 pr-4 text-right">{row.accepted}</td>
              <td className="py-2 pr-4 text-right">{row.rejected}</td>
              <td className="py-2 pr-4">{row.lastFetchedAt ?? "nunca"}</td>
              <td className="py-2 pr-4">{row.possiblyDead ? "Posiblemente muerta" : "Activa"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
