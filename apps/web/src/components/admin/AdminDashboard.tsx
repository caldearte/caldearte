"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { bucketLabel, countActiveByPeriod, enumeratePeriods, isEventInPeriod, sumAmountByPeriod, sumFlowByPeriod, type Granularity } from "@/lib/adminAnalyticsBucketing";
import { splitApifyFreeTier } from "@/lib/apifyCostSplit";
import { shortRegionName } from "@/lib/regionNames";
import type { AdminAnalyticsPayload } from "@/lib/adminAnalytics";
import { colorFor } from "./chartPalette";
import { groupPipelineLabel } from "./pipelineGrouping";
import GranularityToggle from "./GranularityToggle";
import StackedPeriodBar from "./StackedPeriodBar";
import CostSummaryLine from "./CostSummaryLine";
import FuentesMetricsTable from "./FuentesMetricsTable";
import OutOfScopeTrends from "./OutOfScopeTrends";

// recharts' ResponsiveContainer needs real DOM measurement (getBoundingClientRect
// et al.) that doesn't exist during Next's server render — attempting it threw
// "Cannot read properties of undefined (reading 'length')" deep in a minified
// recharts chunk in production (Vercel), even though these are already "use
// client" components (that alone doesn't skip SSR, only client-only rendering
// does). `ssr: false` is the standard fix for chart libraries like this one.
const ChartLoading = () => <div className="w-full h-[280px] flex items-center justify-center font-geist text-[13px] text-text-primary/50">Cargando gráfico…</div>;
const RegionDonutChart = dynamic(() => import("./RegionDonutChart"), { ssr: false, loading: ChartLoading });

// Rewritten 2026-08-17: /admin used to be the full historical dashboard
// (Chile total, por región, fuentes por pipeline) — all of that moved to
// /admin/eventos and /admin/fuentes. This page is now a quick CURRENT-
// period-only summary (no "Total" granularity — see GranularityToggle's
// hideTotal prop, "período actual" has no meaningful all-time reading):
// costo del período, eventos, regiones, fuentes, señales fuera de alcance.
export default function AdminDashboard({ data }: { data: AdminAnalyticsPayload }) {
  const [granularity, setGranularity] = useState<Granularity>("week");

  const { minDate, maxDate } = useMemo(() => {
    const dates: string[] = [];
    for (const e of data.events) {
      if (e.openingDate) dates.push(e.openingDate);
      if (e.runStart) dates.push(e.runStart);
      if (e.runEnd) dates.push(e.runEnd);
    }
    for (const s of data.outOfScopeSignals) dates.push(s.createdAt.slice(0, 10));
    if (dates.length === 0) {
      const today = new Date().toISOString().slice(0, 10);
      return { minDate: today, maxDate: today };
    }
    dates.sort();
    return { minDate: dates[0], maxDate: dates[dates.length - 1] };
  }, [data]);

  const periods = useMemo(() => enumeratePeriods(minDate, maxDate, granularity), [minDate, maxDate, granularity]);

  const currentPeriod = bucketLabel(new Date().toISOString().slice(0, 10), granularity);

  const inauguracionesCount = sumFlowByPeriod(
    data.events.map((e) => ({ date: e.openingDate })),
    [currentPeriod],
    granularity,
  )[0]?.count ?? 0;
  const exposicionesActivasCount = countActiveByPeriod(
    data.events.map((e) => ({ start: e.runStart, end: e.runEnd })),
    [currentPeriod],
    granularity,
  )[0]?.count ?? 0;

  // Distinct events for the current period — an event that's both an
  // inauguración and an active exposición this period counts once, not
  // twice (Daniel's explicit call, 2026-08-17). Also the shared basis for
  // both donuts below, so their slices always sum to this same total.
  const currentPeriodEvents = useMemo(
    () => data.events.filter((e) => isEventInPeriod(e, currentPeriod, granularity)),
    [data.events, currentPeriod, granularity],
  );

  const { santiagoDonutData, allRegionsDonutData } = useMemo(() => {
    const byRegion = new Map<string, number>();
    let santiago = 0;
    for (const e of currentPeriodEvents) {
      const label = e.adminRegionName ? shortRegionName(e.adminRegionName) : "Sin región";
      byRegion.set(label, (byRegion.get(label) ?? 0) + 1);
      if (label === "Santiago") santiago++;
    }
    const allRegions = [...byRegion.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
    return {
      santiagoDonutData: [
        { name: "Santiago", value: santiago },
        { name: "Otras regiones", value: currentPeriodEvents.length - santiago },
      ],
      allRegionsDonutData: allRegions,
    };
  }, [currentPeriodEvents]);

  // Fuentes summary bar segments — same current-period event set as
  // above, grouped by fuente instead of by inauguración/exposición.
  const fuentesSegments = useMemo(() => {
    const byGroup = new Map<string, number>();
    for (const e of currentPeriodEvents) {
      const label = groupPipelineLabel(e.pipeline);
      byGroup.set(label, (byGroup.get(label) ?? 0) + 1);
    }
    return [...byGroup.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: colorFor(i) }));
  }, [currentPeriodEvents]);

  // Costo del período — Anthropic siempre "real" (sin capa gratuita);
  // Apify se divide primero sobre TODA la serie (la lógica de capa
  // gratuita es acumulativa por mes calendario, no se puede recortar
  // antes de dividir) y luego se acota al período actual, mismo patrón
  // que CostTable/CostosPage ya usan.
  const apifySplit = useMemo(() => splitApifyFreeTier(data.apifyCostByDay), [data.apifyCostByDay]);
  const anthropicCurrentUsd = sumAmountByPeriod(
    data.anthropicCostByDay.map((r) => ({ date: r.date, amount: r.amountUsd })),
    [currentPeriod],
    granularity,
  )[0]?.count ?? 0;
  const apifyRealCurrentUsd = sumAmountByPeriod(
    apifySplit.map((r) => ({ date: r.date, amount: r.realUsd })),
    [currentPeriod],
    granularity,
  )[0]?.count ?? 0;
  const apifyFreeCurrentUsd = sumAmountByPeriod(
    apifySplit.map((r) => ({ date: r.date, amount: r.freeUsd })),
    [currentPeriod],
    granularity,
  )[0]?.count ?? 0;

  return (
    <div className="flex flex-col gap-12">
      <GranularityToggle value={granularity} onChange={setGranularity} hideTotal />

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Costos</h2>
        <CostSummaryLine effectiveUsd={anthropicCurrentUsd + apifyRealCurrentUsd} freeTierUsd={apifyFreeCurrentUsd} />
      </section>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Chile — eventos</h2>
        <StackedPeriodBar
          segments={[
            { label: "Inauguraciones", value: inauguracionesCount, color: "#ff00fb" },
            { label: "Exposiciones activas", value: exposicionesActivasCount, color: "#3d373d" },
          ]}
          total={currentPeriodEvents.length}
          totalLabel="eventos en Chile este período"
        />
      </section>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Chile — regiones</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <RegionDonutChart data={santiagoDonutData} />
          <RegionDonutChart data={allRegionsDonutData} />
        </div>
      </section>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Fuentes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <StackedPeriodBar segments={fuentesSegments} total={currentPeriodEvents.length} totalLabel="eventos en Chile este período" />
          <FuentesMetricsTable comparison={data.pipelineComparison} />
        </div>
      </section>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Señales fuera de alcance</h2>
        <p className="font-geist text-[14px] text-text-primary/70 mb-4">
          Evidencia interna, no pública — acumulando datos para una futura decisión sobre ampliar el alcance de Caldearte
          (convocatorias, talleres, etc.).
        </p>
        <OutOfScopeTrends signals={data.outOfScopeSignals} periods={periods} granularity={granularity} />
      </section>
    </div>
  );
}
