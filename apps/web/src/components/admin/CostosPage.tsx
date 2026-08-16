"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { enumeratePeriods, type Granularity } from "@/lib/adminAnalyticsBucketing";
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

  return (
    <div className="flex flex-col gap-12">
      <GranularityToggle value={granularity} onChange={setGranularity} />

      {/* 2 columns on desktop so both charts fit the page's existing
          width side by side instead of one very wide chart each — same
          height per chart either way (both fixed h-[320px] internally),
          1 column on mobile. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section>
          <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Costos totales</h2>
          <TotalCostChart anthropicCostByDay={anthropicCostByDay} apifyCostByDay={apifyCostByDay} periods={periods} granularity={granularity} />
        </section>

        <section>
          <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Costos por servicio</h2>
          <CostHistoryChart anthropicCostByDay={anthropicCostByDay} apifyCostByDay={apifyCostByDay} periods={periods} granularity={granularity} />
        </section>
      </div>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Detalle por período</h2>
        <CostTable anthropicCostByDay={anthropicCostByDay} apifyCostByDay={apifyCostByDay} periods={periods} granularity={granularity} />
      </section>
    </div>
  );
}
