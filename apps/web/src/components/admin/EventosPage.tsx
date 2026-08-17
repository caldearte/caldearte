"use client";

import { useMemo, useState } from "react";
import { enumeratePeriods, type Granularity } from "@/lib/adminAnalyticsBucketing";
import { shortRegionName } from "@/lib/regionNames";
import GranularityToggle from "./GranularityToggle";
import EventosPeriodBlock from "./EventosPeriodBlock";

interface EventRow {
  openingDate: string | null;
  runStart: string | null;
  runEnd: string | null;
  adminRegionName: string | null;
}

// The 16 real macro-regiones, north→south — same canonical list/order as
// regionNames.ts's SHORT_REGION_NAMES (the DB's own CHECK constraint,
// supabase/migrations/20260731150000_newsletter_subscribers_check_constraints.sql).
// Always all 16, even ones with zero events today (Daniel's explicit
// call, 2026-08-17) — same posture the public CityPicker already takes
// ("0 events is still a valid destination"), so this page doesn't reflow
// as régiones gain their first event.
const ADMIN_REGION_NAMES = [
  "Arica y Parinacota",
  "Tarapacá",
  "Antofagasta",
  "Atacama",
  "Coquimbo",
  "Valparaíso",
  "Región Metropolitana de Santiago",
  "Región del Libertador Gral. Bernardo O'Higgins",
  "Región del Maule",
  "Región de Ñuble",
  "Región del Biobío",
  "Región de la Araucanía",
  "Región de Los Ríos",
  "Región de Los Lagos",
  "Región Aisén del Gral. Carlos Ibáñez del Campo",
  "Región de Magallanes y de la Antártica Chilena",
];

// Split out of AdminDashboard 2026-08-17 — historical event detail (Chile
// total + one block per región) moved here so /admin itself can stay a
// quick current-period summary. Owns its own granularity toggle, same
// pattern as CostosPage.
export default function EventosPage({ events }: { events: EventRow[] }) {
  const [granularity, setGranularity] = useState<Granularity>("month");

  const { minDate, maxDate } = useMemo(() => {
    const dates: string[] = [];
    for (const e of events) {
      if (e.openingDate) dates.push(e.openingDate);
      if (e.runStart) dates.push(e.runStart);
      if (e.runEnd) dates.push(e.runEnd);
    }
    if (dates.length === 0) {
      const today = new Date().toISOString().slice(0, 10);
      return { minDate: today, maxDate: today };
    }
    dates.sort();
    return { minDate: dates[0], maxDate: dates[dates.length - 1] };
  }, [events]);

  const periods = useMemo(() => enumeratePeriods(minDate, maxDate, granularity), [minDate, maxDate, granularity]);

  return (
    <div className="flex flex-col gap-12">
      <GranularityToggle value={granularity} onChange={setGranularity} />

      <EventosPeriodBlock title="Chile — total" events={events} periods={periods} granularity={granularity} />

      {ADMIN_REGION_NAMES.map((regionName) => (
        <EventosPeriodBlock
          key={regionName}
          title={shortRegionName(regionName)}
          events={events.filter((e) => e.adminRegionName === regionName)}
          periods={periods}
          granularity={granularity}
        />
      ))}
    </div>
  );
}
