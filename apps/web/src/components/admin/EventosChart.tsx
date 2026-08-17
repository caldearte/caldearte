"use client";

import { Area, AreaChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { countActiveByPeriod, formatPeriodLabel, sumFlowByPeriod, type Granularity } from "@/lib/adminAnalyticsBucketing";
import StatBars from "./StatBars";

interface EventRow {
  openingDate: string | null;
  runStart: string | null;
  runEnd: string | null;
}

// Two OVERLAID (not stacked) areas — same visual language as a "Cash
// flow" reference: inauguraciones is a FLOW (an opening happened on one
// date, counted once), exposiciones activas is a STATE (an exhibition
// counts in every period it's running, same as a balance line, not a
// summed flow). Used by EventosPeriodBlock — once for "Chile — total" and
// once per región, each instance fed its own pre-filtered `events`.
//
// Renamed from NationalOverviewChart 2026-08-17: it used to be the one
// nationwide chart with an always-on, self-computed "current period"
// ReferenceLine; now it's reused per región too, and the line's position
// is driven by the parent (EventosPeriodBlock) instead — defaults to the
// current period but moves on hover, same prop shape TotalCostChart
// already uses for /admin/costos' hover-only version. Unlike
// TotalCostChart, this one is never conditional — the parent always
// supplies a real value (falls back to the current period itself when
// nothing's hovered), so the line is always visible, just not always
// fixed to "now" anymore.
export default function EventosChart({
  events,
  periods,
  granularity,
  highlightedPeriodLabel,
}: {
  events: EventRow[];
  periods: string[];
  granularity: Granularity;
  highlightedPeriodLabel: string;
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
          {/* "You are here" — defaults to the current period (via the
              parent's activePeriod fallback), moves to whichever row is
              hovered in EventosDetailTable, always visible either way. */}
          <ReferenceLine x={highlightedPeriodLabel} stroke="#000000" strokeWidth={3} />
          <Area type="monotone" dataKey="inauguraciones" name="Inauguraciones" stroke="#ff00fb" fill="#ff00fb" fillOpacity={0.35} />
          <Area type="monotone" dataKey="exposicionesActivas" name="Expos activas" stroke="#3d373d" fill="#3d373d" fillOpacity={0.25} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
