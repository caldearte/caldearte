"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { enumeratePeriods, formatPeriodLabel, type Granularity } from "@/lib/adminAnalyticsBucketing";
import { splitApifyFreeTier, APIFY_FREE_TIER_USD } from "@/lib/apifyCostSplit";
import CostTable from "./CostTable";
import GranularityToggle from "./GranularityToggle";

// Same recharts/SSR reasoning as AdminDashboard's own dynamic imports —
// ResponsiveContainer needs real DOM measurement, throws during Next's
// server render otherwise.
const ChartLoading = () => <div className="w-full h-[320px] flex items-center justify-center font-geist text-[13px] text-text-primary/50">Cargando gráfico…</div>;
const CostHistoryChart = dynamic(() => import("./CostHistoryChart"), { ssr: false, loading: ChartLoading });
const TotalCostChart = dynamic(() => import("./TotalCostChart"), { ssr: false, loading: ChartLoading });

interface CostRow {
  date: string;
  amountUsd: number;
}

// Split out of AdminDashboard into its own /admin/costos route (Daniel's
// request, 2026-08-16) — owns its own granularity toggle since the
// period domain here (cost history dates) is independent of the main
// dashboard's event dates.
export default function CostosPage({
  anthropicCostByDay,
  apifyCostByDay,
}: {
  anthropicCostByDay: CostRow[];
  apifyCostByDay: CostRow[];
}) {
  const [granularity, setGranularity] = useState<Granularity>("month");
  // Raw period key (e.g. "2026-07-03"), set while hovering a CostTable
  // row — formatted per chart below since the chart's ReferenceLine
  // needs the same string shape as its own X axis labels.
  const [hoveredPeriod, setHoveredPeriod] = useState<string | null>(null);
  const highlightedPeriodLabel = hoveredPeriod ? formatPeriodLabel(hoveredPeriod, granularity) : null;

  // Apify's free tier is a HARD limit, not billed overage — once this
  // month's gross usage reaches $5, Apify itself refuses new Actor runs
  // until the next cycle. Real incident, 2026-08-30: hit mid-month,
  // Instagram bright sources went dark until the reset. This status line
  // makes that explicit instead of leaving it implicit in the charts
  // below. NOTE: the reset is Apify's own billing-anniversary date (was
  // 2026-09-13, not the 1st) — this calendar-month grouping is an
  // approximation, same caveat as apifyCostSplit.ts's own split logic.
  const apifyMonthGrossUsd = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    return apifyCostByDay.filter((r) => r.date.startsWith(thisMonth)).reduce((sum, r) => sum + r.amountUsd, 0);
  }, [apifyCostByDay]);
  const apifyRemainingUsd = APIFY_FREE_TIER_USD - apifyMonthGrossUsd;

  const { minDate, maxDate } = useMemo(() => {
    const dates = [...anthropicCostByDay.map((c) => c.date), ...apifyCostByDay.map((c) => c.date)];
    if (dates.length === 0) {
      const today = new Date().toISOString().slice(0, 10);
      return { minDate: today, maxDate: today };
    }
    dates.sort();
    return { minDate: dates[0], maxDate: dates[dates.length - 1] };
  }, [anthropicCostByDay, apifyCostByDay]);

  const periods = useMemo(() => enumeratePeriods(minDate, maxDate, granularity), [minDate, maxDate, granularity]);

  // "Costos totales" must never count Apify's $5/mo free tier as real
  // spend (Daniel's explicit request, 2026-08-16) — only the REAL
  // (billed) portion goes into the total. CostHistoryChart and CostTable
  // do their own splitting internally (they need the free/real
  // breakdown itself, not just the real total).
  const apifyRealCostByDay = useMemo(
    () => splitApifyFreeTier(apifyCostByDay).map((r) => ({ date: r.date, amountUsd: r.realUsd })),
    [apifyCostByDay],
  );

  return (
    <div className="flex flex-col gap-12">
      <p className={`font-geist text-[14px] ${apifyRemainingUsd <= 0 ? "text-red-700 font-medium" : "text-text-primary/60"}`}>
        {apifyRemainingUsd <= 0
          ? `⚠️ Apify: límite mensual alcanzado ($${apifyMonthGrossUsd.toFixed(2)} de $${APIFY_FREE_TIER_USD}) — sin nuevas corridas hasta el próximo ciclo`
          : `Apify: $${apifyRemainingUsd.toFixed(2)} disponibles de $${APIFY_FREE_TIER_USD}/mes antes del límite`}
      </p>

      <GranularityToggle value={granularity} onChange={setGranularity} />

      {/* 2 columns on desktop so both charts fit the page's existing
          width side by side instead of one very wide chart each — same
          height per chart either way (both fixed h-[320px] internally),
          1 column on mobile. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section>
          <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Costos totales</h2>
          <TotalCostChart
            anthropicCostByDay={anthropicCostByDay}
            apifyCostByDay={apifyRealCostByDay}
            periods={periods}
            granularity={granularity}
            highlightedPeriodLabel={highlightedPeriodLabel}
          />
        </section>

        <section>
          <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Costos por servicio</h2>
          <CostHistoryChart
            anthropicCostByDay={anthropicCostByDay}
            apifyCostByDay={apifyCostByDay}
            periods={periods}
            granularity={granularity}
            highlightedPeriodLabel={highlightedPeriodLabel}
          />
        </section>
      </div>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Detalle por período</h2>
        <CostTable
          anthropicCostByDay={anthropicCostByDay}
          apifyCostByDay={apifyCostByDay}
          periods={periods}
          granularity={granularity}
          onHoverPeriod={setHoveredPeriod}
        />
      </section>
    </div>
  );
}
