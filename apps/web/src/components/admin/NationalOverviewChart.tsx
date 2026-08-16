"use client";

import { Area, AreaChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { countActiveByPeriod, currentPeriodLabel, formatPeriodLabel, sumFlowByPeriod, type Granularity } from "@/lib/adminAnalyticsBucketing";
import StatBars from "./StatBars";

interface EventRow {
  openingDate: string | null;
  runStart: string | null;
  runEnd: string | null;
}

// Chart 1: nationwide overview, two OVERLAID (not stacked) areas — same
// visual language as the "Cash flow" reference: inauguraciones is a FLOW
// (an opening happened on one date, counted once), exposiciones activas
// is a STATE (an exhibition counts in every period it's running, same as
// a balance line, not a summed flow).
export default function NationalOverviewChart({
  events,
  periods,
  granularity,
}: {
  events: EventRow[];
  periods: string[];
  granularity: Granularity;
}) {
  const inauguraciones = sumFlowByPeriod(
    events.map((e) => ({ date: e.openingDate })),
    periods,
    granularity,
  );
  const activas = countActiveByPeriod(
    events.map((e) => ({ start: e.runStart, end: e.runEnd })),
    periods,
    granularity,
  );

  if (granularity === "total") {
    return (
      <StatBars
        items={[
          { label: "Inauguraciones", value: inauguraciones[0]?.count ?? 0, color: "#ff00fb" },
          { label: "Exposiciones (alguna vez activas)", value: activas[0]?.count ?? 0, color: "#3d373d" },
        ]}
      />
    );
  }

  const activasByPeriod = new Map(activas.map((a) => [a.period, a.count]));
  const rows = inauguraciones.map((row) => ({
    label: formatPeriodLabel(row.period, granularity),
    inauguraciones: row.count,
    exposicionesActivas: activasByPeriod.get(row.period) ?? 0,
  }));

  return (
    <div className="w-full h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#00000015" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {/* "You are here" — the current week/month/year, always on for
              the main dashboard's charts (Daniel's explicit request,
              2026-08-16), unlike /admin/costos' hover-driven version. */}
          <ReferenceLine x={currentPeriodLabel(granularity)} stroke="#000000" strokeWidth={3} />
          <Area type="monotone" dataKey="inauguraciones" name="Inauguraciones" stroke="#ff00fb" fill="#ff00fb" fillOpacity={0.35} />
          <Area type="monotone" dataKey="exposicionesActivas" name="Expos activas" stroke="#3d373d" fill="#3d373d" fillOpacity={0.25} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
