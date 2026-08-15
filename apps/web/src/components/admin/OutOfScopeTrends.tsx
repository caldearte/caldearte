interface MonthlyTrend {
  month: string;
  categories: Record<string, number>;
}

const CATEGORY_LABELS: Record<string, string> = {
  convocatoria: "Convocatorias",
  taller_o_charla: "Talleres / charlas",
  otro_evento_no_arte_visual: "Otro (música, teatro, etc.)",
};

// Plain table, same posture as SourceComparisonTable — a handful of
// months of counts doesn't need a chart to be legible, and this section
// is explicitly framed (see AdminPage's own copy) as accumulating
// evidence, not a finished metric worth a polished visualization yet.
export default function OutOfScopeTrends({ trends }: { trends: MonthlyTrend[] }) {
  if (trends.length === 0) {
    return <p className="font-geist text-[14px] text-text-primary/70">Sin señales registradas todavía en la ventana seleccionada.</p>;
  }

  const categories = [...new Set(trends.flatMap((t) => Object.keys(t.categories)))];

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-geist text-[14px] text-text-primary border-collapse">
        <thead>
          <tr className="border-b border-text-primary/20 text-left">
            <th className="py-2 pr-4">Mes</th>
            {categories.map((category) => (
              <th key={category} className="py-2 pr-4 text-right">
                {CATEGORY_LABELS[category] ?? category}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trends.map((row) => (
            <tr key={row.month} className="border-b border-text-primary/10">
              <td className="py-2 pr-4">{row.month}</td>
              {categories.map((category) => (
                <td key={category} className="py-2 pr-4 text-right">
                  {row.categories[category] ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
