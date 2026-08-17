"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { bucketLabel, formatPeriodLabel, type Granularity } from "@/lib/adminAnalyticsBucketing";
import EventosDetailTable from "./EventosDetailTable";

interface EventRow {
  openingDate: string | null;
  runStart: string | null;
  runEnd: string | null;
}

// Same SSR reasoning as every other recharts consumer in /admin —
// ResponsiveContainer needs real DOM measurement.
const ChartLoading = () => <div className="w-full h-[320px] flex items-center justify-center font-geist text-[13px] text-text-primary/50">Cargando gráfico…</div>;
const EventosChart = dynamic(() => import("./EventosChart"), { ssr: false, loading: ChartLoading });

// One self-contained chart+table pair — used once for "Chile — total" and
// once per región on /admin/eventos, each instance just fed a different
// pre-filtered `events` array. Owns its own hover state so hovering one
// región's table never moves another región's (or Chile total's) line —
// each block is independent (2026-08-17).
//
// The interaction combines two patterns that used to be separate: the old
// /admin dashboard's always-on "current period" line (no hover) and
// /admin/costos' hover-only line (nothing shown at rest). Here, the line
// AND the table's highlighted row default to the current period, move to
// whichever row is hovered, and revert to the current period on mouseleave
// — never "nothing selected."
export default function EventosPeriodBlock({
  title,
  events,
  periods,
  granularity,
}: {
  title: string;
  events: EventRow[];
  periods: string[];
  granularity: Granularity;
}) {
  const [hoveredPeriod, setHoveredPeriod] = useState<string | null>(null);
  const currentPeriodRaw = bucketLabel(new Date().toISOString().slice(0, 10), granularity);
  const activePeriod = hoveredPeriod ?? currentPeriodRaw;
  const highlightedPeriodLabel = formatPeriodLabel(activePeriod, granularity);

  return (
    <section>
      <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <EventosChart events={events} periods={periods} granularity={granularity} highlightedPeriodLabel={highlightedPeriodLabel} />
        <EventosDetailTable
          events={events}
          periods={periods}
          granularity={granularity}
          activePeriod={activePeriod}
          onHoverPeriod={setHoveredPeriod}
        />
      </div>
    </section>
  );
}
