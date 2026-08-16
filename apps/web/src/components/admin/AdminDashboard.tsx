"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { enumeratePeriods, type Granularity } from "@/lib/adminAnalyticsBucketing";
import type { AdminAnalyticsPayload } from "@/lib/adminAnalytics";
import GranularityToggle from "./GranularityToggle";
import SourceComparisonTable from "./SourceComparisonTable";
import BrightSourcesTable from "./BrightSourcesTable";
import InstagramSourcesTable from "./InstagramSourcesTable";
import OutOfScopeTrends from "./OutOfScopeTrends";

// recharts' ResponsiveContainer needs real DOM measurement (getBoundingClientRect
// et al.) that doesn't exist during Next's server render — attempting it threw
// "Cannot read properties of undefined (reading 'length')" deep in a minified
// recharts chunk in production (Vercel), even though these are already "use
// client" components (that alone doesn't skip SSR, only client-only rendering
// does). `ssr: false` is the standard fix for chart libraries like this one.
const ChartLoading = () => <div className="w-full h-[320px] flex items-center justify-center font-geist text-[13px] text-text-primary/50">Cargando gráfico…</div>;
const NationalOverviewChart = dynamic(() => import("./NationalOverviewChart"), { ssr: false, loading: ChartLoading });
const ExposicionesPorRegionChart = dynamic(() => import("./ExposicionesPorRegionChart"), { ssr: false, loading: ChartLoading });
const InauguracionesPorRegionChart = dynamic(() => import("./InauguracionesPorRegionChart"), { ssr: false, loading: ChartLoading });
const FuentesPorPipelineChart = dynamic(() => import("./FuentesPorPipelineChart"), { ssr: false, loading: ChartLoading });

// Owns the one shared granularity toggle — everything below re-renders
// from the same in-memory payload the server component fetched once, no
// re-fetch on toggle change (see admin-analytics/index.ts's own comment
// on why it ships row-level data instead of pre-bucketed series).
export default function AdminDashboard({ data }: { data: AdminAnalyticsPayload }) {
  const [granularity, setGranularity] = useState<Granularity>("month");

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

  return (
    <div className="flex flex-col gap-12">
      <GranularityToggle value={granularity} onChange={setGranularity} />

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Chile — total</h2>
        <NationalOverviewChart events={data.events} periods={periods} granularity={granularity} />
      </section>

      {/* 2 columns on desktop so both región breakdowns fit the page's
          existing width side by side instead of one very wide chart
          each — same height per chart either way, 1 column on mobile. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section>
          <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Exposiciones por región</h2>
          <ExposicionesPorRegionChart events={data.events} periods={periods} granularity={granularity} />
        </section>

        <section>
          <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Inauguraciones por región</h2>
          <InauguracionesPorRegionChart events={data.events} periods={periods} granularity={granularity} />
        </section>
      </div>

      {/* Deliberately its own full-width row, not paired in the grid
          above — kept clearly separate from the región breakdowns
          (Daniel's explicit request, 2026-08-16), since it's a
          different dimension (source/pipeline, not región). */}
      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Fuentes por pipeline</h2>
        <FuentesPorPipelineChart events={data.events} periods={periods} granularity={granularity} />
      </section>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Fuentes / pipelines — comparación</h2>
        <SourceComparisonTable comparison={data.pipelineComparison} />
      </section>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Fuentes brillantes (web)</h2>
        <BrightSourcesTable sources={data.brightSources} />
      </section>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Cuentas de Instagram</h2>
        <InstagramSourcesTable sources={data.instagramSources} />
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
