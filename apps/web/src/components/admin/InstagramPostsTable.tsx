// "inauguracion"/"no_te_la_pierdas"/"destacada" retired 2026-08-31 (the
// automated pipeline now posts a single "agenda" carousel — see
// apps/curator/src/social-publish/selection.ts's own doc comment) — kept
// in this union only so real historical rows from before that date still
// type and render correctly here.
export interface InstagramPostRow {
  mediaId: string;
  postType: "inauguracion" | "no_te_la_pierdas" | "destacada" | "agenda";
  weekStart: string;
  publishedAt: string;
  reach: number | null;
  saved: number | null;
  likeCount: number | null;
  commentsCount: number | null;
}

const POST_TYPE_LABEL: Record<InstagramPostRow["postType"], string> = {
  inauguracion: "Inauguración",
  no_te_la_pierdas: "No te la pierdas",
  destacada: "Destacada",
  agenda: "Agenda",
};

const DOW_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function fmt(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("es-CL");
}

// Sin agrupar por período (a diferencia del resto de las tablas del
// dashboard) — a propósito: la pregunta real que motivó esto es
// post-a-post ("¿el lunes rinde peor que el domingo, misma semana?"),
// que un promedio por período esconde. Muestra el día de la semana junto
// a la fecha para que un domingo de inauguraciones quede visualmente
// pegado al lunes que lo repite.
export default function InstagramPostsTable({ posts, limit = 30 }: { posts: InstagramPostRow[]; limit?: number }) {
  const sorted = [...posts].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)).slice(0, limit);

  if (sorted.length === 0) {
    return <p className="font-geist text-[14px] text-text-primary/70">Sin posts registrados todavía.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-geist text-[14px] text-text-primary border-collapse">
        <thead>
          <tr className="border-b border-text-primary/20 text-left">
            <th className="py-2 pr-4">Publicado</th>
            <th className="py-2 pr-4">Tipo</th>
            <th className="py-2 pr-4 text-right">Alcance</th>
            <th className="py-2 pr-4 text-right">Me gusta</th>
            <th className="py-2 pr-4 text-right">Guardados</th>
            <th className="py-2 pr-4 text-right">Comentarios</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const d = new Date(row.publishedAt);
            const dowLabel = DOW_LABEL[d.getUTCDay()];
            return (
              <tr key={row.mediaId} className="border-b border-text-primary/10">
                <td className="py-2 pr-4 whitespace-nowrap text-text-primary/70">
                  {dowLabel} {row.publishedAt.slice(0, 10)}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap">{POST_TYPE_LABEL[row.postType]}</td>
                <td className="py-2 pr-4 text-right">{fmt(row.reach)}</td>
                <td className="py-2 pr-4 text-right">{fmt(row.likeCount)}</td>
                <td className="py-2 pr-4 text-right">{fmt(row.saved)}</td>
                <td className="py-2 pr-4 text-right">{fmt(row.commentsCount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
