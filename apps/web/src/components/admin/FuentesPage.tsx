"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { enumeratePeriods, type Granularity } from "@/lib/adminAnalyticsBucketing";
import type { AdminAnalyticsPayload } from "@/lib/adminAnalytics";
import GranularityToggle from "./GranularityToggle";
import SourceComparisonTable from "./SourceComparisonTable";
import BrightSourcesTable from "./BrightSourcesTable";
import InstagramSourcesTable from "./InstagramSourcesTable";
import CoberturaTable from "./CoberturaTable";

const ChartLoading = () => <div className="w-full h-[320px] flex items-center justify-center font-geist text-[13px] text-text-primary/50">Cargando gráfico…</div>;
const FuentesPorPipelineChart = dynamic(() => import("./FuentesPorPipelineChart"), { ssr: false, loading: ChartLoading });

// Split out of AdminDashboard 2026-08-17 — "Fuentes por pipeline" and its
// 3 companion tables moved here as-is (unchanged content/behavior), own
// granularity toggle since this page's period domain (event dates driving
// the chart) is independent of /admin's current-period-only summary.
export default function FuentesPage({
  events,
  pipelineComparison,
  brightSources,
  instagramSources,
  pendingEscalationsCount,
  discoveryRunSummaries,
}: {
  events: AdminAnalyticsPayload["events"];
  pipelineComparison: AdminAnalyticsPayload["pipelineComparison"];
  brightSources: AdminAnalyticsPayload["brightSources"];
  instagramSources: AdminAnalyticsPayload["instagramSources"];
  pendingEscalationsCount: AdminAnalyticsPayload["pendingEscalationsCount"];
  discoveryRunSummaries: AdminAnalyticsPayload["discoveryRunSummaries"];
}) {
  const [granularity, setGranularity] = useState<Granularity>("month");

  const { minDate, maxDate } = useMemo(() => {
    const dates: string[] = [];
    for (const e of events) {
      if (e.openingDate) dates.push(e.openingDate);
      if (e.runStart) dates.push(e.runStart);
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

      {/* Real gap found 2026-08-17: the accept/reject-token half of this
          flow was never wired to a real email, so these rows had zero
          visibility anywhere until now — just a count, no detail view
          yet (7 real pending conflicts found during that audit). */}
      {pendingEscalationsCount > 0 && (
        <p className="font-geist text-[14px] text-text-primary">
          <span className="font-fragment-mono text-brand-magenta">{pendingEscalationsCount}</span> conflicto
          {pendingEscalationsCount === 1 ? "" : "s"} de curación pendiente{pendingEscalationsCount === 1 ? "" : "s"} de revisión
        </p>
      )}

      {/* Chart left, comparison table right (Daniel's request, 2026-08-17)
          — same 2-column convention as every EventosPeriodBlock. Ambos
          agrupan MAVI dentro de "Web" (pipelineGrouping.ts) — antes
          mostraban MAVI como su propia fila, distinto del resumen de
          /admin, que ya la fusionaba (inconsistencia real, corregida
          2026-08-17). */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section>
          <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Eventos por fuente</h2>
          <FuentesPorPipelineChart events={events} periods={periods} granularity={granularity} />
        </section>

        <section>
          <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Comparación por fuente</h2>
          <SourceComparisonTable comparison={pipelineComparison} />
        </section>
      </div>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Fuentes brillantes (web)</h2>
        <BrightSourcesTable sources={brightSources} />
      </section>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Cuentas de Instagram</h2>
        <InstagramSourcesTable sources={instagramSources} />
      </section>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Cobertura por corrida</h2>
        <p className="font-geist text-[14px] text-text-primary/70 mb-4">
          Últimos 90 días — candidatos curados y qué pasó después de la curación, no solo aprobado/rechazado.
        </p>
        <CoberturaTable runs={discoveryRunSummaries} />
      </section>
    </div>
  );
}
