"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Single stacked horizontal bar (2 colors: inauguraciones/exposiciones
// activas, same palette as EventosChart for consistency across the app)
// + the period's real total to the right — a snapshot of the CURRENT
// period only (2026-08-17), not a historical series like EventosChart.
export default function EventosSummaryBar({
  inauguraciones,
  exposicionesActivas,
  total,
}: {
  inauguraciones: number;
  exposicionesActivas: number;
  total: number;
}) {
  const data = [{ name: "Eventos", Inauguraciones: inauguraciones, "Exposiciones activas": exposicionesActivas }];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
      <div className="flex flex-col gap-2">
        <div className="w-full h-[80px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" hide />
              <Tooltip />
              <Bar dataKey="Inauguraciones" stackId="a" fill="#ff00fb" />
              <Bar dataKey="Exposiciones activas" stackId="a" fill="#3d373d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 font-geist text-[13px] text-text-primary">
          <span className="flex items-center gap-2">
            <span className="w-[10px] h-[10px] rounded-full inline-block" style={{ background: "#ff00fb" }} />
            Inauguraciones ({inauguraciones})
          </span>
          <span className="flex items-center gap-2">
            <span className="w-[10px] h-[10px] rounded-full inline-block" style={{ background: "#3d373d" }} />
            Exposiciones activas ({exposicionesActivas})
          </span>
        </div>
      </div>
      <div className="text-center">
        <div className="font-fragment-mono text-[48px] text-text-primary leading-none">{total}</div>
        <div className="font-geist text-[13px] text-text-primary/60">eventos en Chile este período</div>
      </div>
    </div>
  );
}
