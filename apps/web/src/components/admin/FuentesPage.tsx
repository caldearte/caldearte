"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { enumeratePeriods, type Granularity } from "@/lib/adminAnalyticsBucketing";
import type { AdminAnalyticsPayload } from "@/lib/adminAnalytics";
import GranularityToggle from "./GranularityToggle";
import SourceComparisonTable from "./SourceComparisonTable";
import TopSourcesTable, { type TopSourceRow } from "./TopSourcesTable";
import CoberturaTable from "./CoberturaTable";

const TOP_SOURCES_COUNT = 20;

const CATEGORY_LABEL: Record<AdminAnalyticsPayload["brightSources"][number]["category"], TopSourceRow["category"]> = {
  bright_source: "Web",
  headless: "Headless",
  google_alerts: "Google Alerts",
};

// Mismo criterio de ranking que ya usa admin-analytics/index.ts's
// bySourceRank server-side (por categoría separada) — acá se combinan
// las 4 categorías en una sola lista y se corta a las 20 mejores.
function rankSource(a: { possiblyDead: boolean; accepted: number }, b: { possiblyDead: boolean; accepted: number }): number {
  if (a.possiblyDead !== b.possiblyDead) return a.possiblyDead ? 1 : -1;
  return b.accepted - a.accepted;
}

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

  const topSources = useMemo(() => {
    const merged: TopSourceRow[] = [
      ...instagramSources.map((s) => ({
        label: `@${s.username}`,
        category: "Instagram" as const,
        lastFetchedAt: s.lastFetchedAt,
        accepted: s.accepted,
        rejected: s.rejected,
        possiblyDead: s.possiblyDead || s.isInactive,
      })),
      ...brightSources.map((s) => ({
        label: s.url,
        category: CATEGORY_LABEL[s.category],
        lastFetchedAt: s.lastFetchedAt,
        accepted: s.accepted,
        rejected: s.rejected,
        possiblyDead: s.possiblyDead,
      })),
    ];
    merged.sort(rankSource);
    return merged.slice(0, TOP_SOURCES_COUNT);
  }, [instagramSources, brightSources]);

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
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">
          Top {TOP_SOURCES_COUNT} fuentes
        </h2>
        <p className="font-geist text-[14px] text-text-primary/70 mb-4">
          Las {TOP_SOURCES_COUNT} fuentes con más eventos aprobados, de todas las categorías (Instagram, Web, Headless,
          Google Alerts) combinadas — origen indicado por fila.
        </p>
        <TopSourcesTable sources={topSources} />
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
