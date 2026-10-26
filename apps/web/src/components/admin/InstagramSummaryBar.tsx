// Resumen ejecutivo de Instagram para /admin — Daniel 2026-08-24: "pon
// una sección de INSTAGRAM que tenga datos generales, número de
// visitantes, me gusta, etc", antes de "Señales fuera de alcance".
// Mismo lenguaje visual que CostSummaryLine (número grande + etiqueta),
// pero varias métricas en fila en vez de una sola línea. Desde
// 2026-10-25 todo se refiere a los últimos 30 días (ya no hay selector
// de período) — "visitantes" se lee como alcance (reach: cuentas distintas
// que vieron un post), la métrica real más cercana a esa idea que la
// Graph API expone por post.
function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-fragment-mono text-[28px] text-text-primary leading-none">{value}</span>
      <span className="font-geist text-[13px] text-text-primary/60">{label}</span>
    </div>
  );
}

export default function InstagramSummaryBar({
  followersCount,
  followersDelta,
  reachTotal,
  likesTotal,
  savedTotal,
}: {
  followersCount: number | null;
  followersDelta: number | null;
  reachTotal: number;
  likesTotal: number;
  savedTotal: number;
}) {
  return (
    <div className="flex flex-wrap gap-8">
      <Tile
        value={followersCount !== null ? followersCount.toLocaleString("es-CL") : "—"}
        label={followersDelta !== null && followersDelta !== 0 ? `seguidores (${followersDelta > 0 ? "+" : ""}${followersDelta} en 30 días)` : "seguidores"}
      />
      <Tile value={reachTotal.toLocaleString("es-CL")} label="alcance en 30 días" />
      <Tile value={likesTotal.toLocaleString("es-CL")} label="me gusta en 30 días" />
      <Tile value={savedTotal.toLocaleString("es-CL")} label="guardados en 30 días" />
    </div>
  );
}
