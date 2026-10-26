import { MISION_DEADLINE_LABEL, MISION_GOALS, type MisionData, type MisionKpi, type RegionCoverageRow, type VenueKindShare } from "@/lib/misionKpis";
import type { SignalSeriesPoint } from "@/lib/audienceSignals";
import { shortRegionName } from "@/lib/regionNames";

// The /admin home since 2026-10-25 (Daniel): Misión. KPI tiles against
// the June 2027 goals, the venue-kind share, and coverage by región (one
// table instead of the old 16 chart blocks and 2 donuts). All inline SVG
// and plain markup, so it renders on the server with no recharts or
// ssr:false dynamic import. Logic lives in lib/misionKpis.ts (tested).

const KIND_LABELS: Record<VenueKindShare["kind"], string> = {
  institucional: "Institucional",
  municipal: "Municipal",
  independiente: "Independiente",
  sin_clasificar: "Sin clasificar",
};

const KIND_COLORS: Record<VenueKindShare["kind"], string> = {
  institucional: "#3d373d",
  municipal: "#d9a441",
  independiente: "#ff00fb",
  sin_clasificar: "#c9c4c9",
};

function formatValue(value: number | null, format: MisionKpi["format"]): string {
  if (value === null) return "—";
  return format === "pct" ? `${value.toLocaleString("es-CL")}%` : value.toLocaleString("es-CL");
}

function Sparkline({ series }: { series: SignalSeriesPoint[] }) {
  const width = 160;
  const height = 36;
  if (series.length < 2) {
    return <div className="h-[36px] w-full border-b border-dashed border-text-primary/20" aria-hidden />;
  }
  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (series.length - 1);
  const points = series.map((p, i) => `${(i * step).toFixed(1)},${(height - 2 - ((p.value - min) / span) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden className="overflow-visible">
      <polyline points={points} fill="none" stroke="#ff00fb" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Delta({ kpi }: { kpi: MisionKpi }) {
  const delta = kpi.delta30d ?? kpi.sinceStart?.delta ?? null;
  const suffix = kpi.delta30d !== null ? "en 30 días" : kpi.sinceStart ? "desde el inicio" : null;
  if (delta === null || suffix === null) return <span className="font-geist text-[12px] text-text-primary/40">sin datos para comparar</span>;
  const unit = kpi.format === "pct" ? " pts" : "";
  if (delta === 0) return <span className="font-geist text-[12px] text-text-primary/50">sin cambio {suffix}</span>;
  return (
    <span className={`font-geist text-[12px] ${delta > 0 ? "text-brand-magenta" : "text-text-primary/60"}`}>
      {delta > 0 ? "+" : ""}
      {delta.toLocaleString("es-CL")}
      {unit} {suffix}
    </span>
  );
}

function GoalBar({ value, goal }: { value: number | null; goal: { target: number; label: string } }) {
  const progress = value === null ? 0 : Math.min(1, value / goal.target);
  return (
    <div className="flex flex-col gap-1">
      <div className="h-[6px] w-full bg-text-primary/10 rounded-full overflow-hidden">
        <div className="h-full bg-brand-magenta" style={{ width: `${(progress * 100).toFixed(1)}%` }} />
      </div>
      <span className="font-geist text-[12px] text-text-primary/60">
        Meta {MISION_DEADLINE_LABEL}: {goal.label} · {Math.round(progress * 100)}%
      </span>
    </div>
  );
}

function KpiTile({ label, hint, kpi, goal }: { label: string; hint: string; kpi: MisionKpi; goal?: { target: number; label: string } }) {
  return (
    <div className="flex flex-col gap-2 bg-white rounded-sm p-5">
      <span className="font-fragment-mono uppercase text-[12px] tracking-wide text-text-primary/70">{label}</span>
      <span className="font-fragment-mono text-[44px] leading-none text-text-primary">{formatValue(kpi.value, kpi.format)}</span>
      <Delta kpi={kpi} />
      <Sparkline series={kpi.series} />
      {goal ? <GoalBar value={kpi.value} goal={goal} /> : <span className="font-geist text-[12px] text-text-primary/40">Sin meta definida</span>}
      <span className="font-geist text-[12px] text-text-primary/50">{hint}</span>
    </div>
  );
}

function KindBar({ title, rows }: { title: string; rows: VenueKindShare[] }) {
  const total = rows.reduce((acc, r) => acc + r.events, 0);
  return (
    <div className="flex flex-col gap-2">
      <span className="font-fragment-mono uppercase text-[12px] tracking-wide text-text-primary/70">
        {title} · {total.toLocaleString("es-CL")} eventos
      </span>
      <div className="flex h-[22px] w-full rounded-sm overflow-hidden bg-text-primary/10">
        {rows
          .filter((r) => r.events > 0)
          .map((r) => (
            <div key={r.kind} style={{ width: `${r.pct}%`, background: KIND_COLORS[r.kind] }} title={`${KIND_LABELS[r.kind]}: ${r.pct}%`} />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 font-geist text-[13px] text-text-primary">
        {rows.map((r) => (
          <span key={r.kind} className="flex items-center gap-2">
            <span className="w-[10px] h-[10px] rounded-full inline-block" style={{ background: KIND_COLORS[r.kind] }} />
            {KIND_LABELS[r.kind]} {r.pct.toLocaleString("es-CL")}% ({r.events})
          </span>
        ))}
      </div>
    </div>
  );
}

function RegionTable({ rows }: { rows: RegionCoverageRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.pct90d));
  return (
    <div className="bg-white rounded-sm p-5 overflow-x-auto">
      <table className="w-full font-geist text-[14px] text-text-primary">
        <thead>
          <tr className="text-left font-fragment-mono uppercase text-[12px] text-text-primary/60">
            <th className="py-2 pr-4 font-normal">Región</th>
            <th className="py-2 pr-4 font-normal text-right">30 días</th>
            <th className="py-2 pr-4 font-normal text-right">90 días</th>
            <th className="py-2 font-normal w-[40%]">% de los 90 días</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.adminRegionName} className={`border-t border-text-primary/10 ${r.events90d === 0 ? "text-text-primary/40" : ""}`}>
              <td className="py-2 pr-4 whitespace-nowrap">{shortRegionName(r.adminRegionName)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{r.events30d}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{r.events90d}</td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <div className="h-[8px] bg-brand-magenta rounded-full" style={{ width: `${(r.pct90d / max) * 80}%` }} />
                  <span className="tabular-nums text-[12px] text-text-primary/70">{r.pct90d.toLocaleString("es-CL")}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MisionDashboard({ mision, regions }: { mision: MisionData; regions: RegionCoverageRow[] }) {
  const { venueKinds } = mision;
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-fragment-mono uppercase text-[18px] text-brand-magenta">Misión</h2>
          <p className="font-geist text-[14px] text-text-primary/70 max-w-[680px]">
            Acercar el arte a las personas, con el mismo interés y seriedad para todos los espacios. Estos números dicen si lo estamos
            logrando; la máquina (fuentes, costos, corridas) está en las otras páginas.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiTile label="Seguidores en Instagram" hint="@caldearte.oficial, último snapshot semanal" kpi={mision.followers} goal={MISION_GOALS.followers} />
          <KpiTile label="Suscriptores al newsletter" hint="confirmados y activos" kpi={mision.subscribers} goal={MISION_GOALS.subscribers} />
          <KpiTile label="Eventos publicados" hint="inauguraciones de los últimos 30 días" kpi={mision.events30d} goal={MISION_GOALS.events30d} />
          <KpiTile label="Fuera de la RM" hint="% de los eventos de los últimos 90 días" kpi={mision.outsideRmPct} goal={MISION_GOALS.outsideRmPct} />
          <KpiTile label="Expos enviadas por espacios" hint="vía /agrega-tu-expo, histórico" kpi={mision.submissions} goal={MISION_GOALS.submissions} />
          <KpiTile label="Clics de intención" hint="cómo llegar, calendario y salidas a la fuente o IG, desde Chile, 30 días" kpi={mision.intentClicks} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary">Tipo de espacio</h2>
          <p className="font-geist text-[14px] text-text-primary/70 max-w-[680px]">
            De qué espacios vienen los eventos: institucionales (museos, universidades, galerías consolidadas), municipales (casas de la
            cultura, centros comunales) o independientes (autogestionados, comunitarios, emergentes).
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
          <div className="flex flex-col gap-6 bg-white rounded-sm p-5">
            <KindBar title="Últimos 90 días" rows={venueKinds.recent} />
            <KindBar title="Histórico" rows={venueKinds.allTime} />
            {venueKinds.unclassifiedVenues > 0 ? (
              <p className="font-geist text-[13px] text-text-primary/70">
                {venueKinds.unclassifiedVenues} {venueKinds.unclassifiedVenues === 1 ? "espacio nuevo sin clasificar" : "espacios nuevos sin clasificar"}.
              </p>
            ) : null}
          </div>
          <KpiTile label="Independientes" hint="% de los eventos de los últimos 90 días" kpi={venueKinds.independientePct} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary">Cobertura por región</h2>
        <RegionTable rows={regions} />
      </section>
    </div>
  );
}
