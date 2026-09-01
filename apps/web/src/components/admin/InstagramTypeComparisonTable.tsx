// "inauguracion"/"no_te_la_pierdas"/"destacada" retired 2026-08-31 (the
// automated pipeline now posts a single "agenda" carousel — see
// apps/curator/src/social-publish/selection.ts's own doc comment) — kept
// in this union only so real historical rows from before that date still
// type and render correctly here.
interface InstagramPostRow {
  postType: "inauguracion" | "no_te_la_pierdas" | "destacada" | "agenda";
  reach: number | null;
  saved: number | null;
  likeCount: number | null;
}

const POST_TYPE_LABEL: Record<InstagramPostRow["postType"], string> = {
  inauguracion: "Inauguración (se repite en la semana)",
  no_te_la_pierdas: "No te la pierdas",
  destacada: "Destacada",
  agenda: "Agenda",
};

const TYPE_ORDER: InstagramPostRow["postType"][] = ["inauguracion", "no_te_la_pierdas", "destacada", "agenda"];

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

// Promedio por post, no total — el punto es comparar el RENDIMIENTO
// típico de un post de cada tipo, no cuál tipo se publicó más veces.
// "Inauguración" incluye tanto el post original del domingo como su
// repetición del lunes en el mismo promedio — si el lunes rinde
// sistemáticamente peor, el promedio de este tipo cae por debajo de los
// otros dos, que nunca se repiten.
export default function InstagramTypeComparisonTable({ posts }: { posts: InstagramPostRow[] }) {
  const byType = new Map<InstagramPostRow["postType"], InstagramPostRow[]>();
  for (const p of posts) {
    const list = byType.get(p.postType) ?? [];
    list.push(p);
    byType.set(p.postType, list);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-geist text-[14px] text-text-primary border-collapse">
        <thead>
          <tr className="border-b border-text-primary/20 text-left">
            <th className="py-2 pr-4">Tipo</th>
            <th className="py-2 pr-4 text-right">Posts</th>
            <th className="py-2 pr-4 text-right">Alcance prom.</th>
            <th className="py-2 pr-4 text-right">Me gusta prom.</th>
            <th className="py-2 pr-4 text-right">Guardados prom.</th>
          </tr>
        </thead>
        <tbody>
          {TYPE_ORDER.map((type) => {
            const rows = byType.get(type) ?? [];
            return (
              <tr key={type} className="border-b border-text-primary/10">
                <td className="py-2 pr-4">{POST_TYPE_LABEL[type]}</td>
                <td className="py-2 pr-4 text-right">{rows.length}</td>
                <td className="py-2 pr-4 text-right">{Math.round(avg(rows.map((r) => r.reach ?? 0)))}</td>
                <td className="py-2 pr-4 text-right">{Math.round(avg(rows.map((r) => r.likeCount ?? 0)))}</td>
                <td className="py-2 pr-4 text-right">{Math.round(avg(rows.map((r) => r.saved ?? 0)))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
