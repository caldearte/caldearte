"use client";

import type { AudienceSignal, AudienceSignals as AudienceSignalsData, SignalSeriesPoint } from "@/lib/audienceSignals";
import { SIGNAL_WINDOW_DAYS } from "@/lib/audienceSignals";

// Señales de uso — the top of /admin, deliberately set apart from every
// other section (Daniel, 2026-09-14): everything below it measures the
// machine (costs, events, sources, the shadow model); this block
// measures whether anyone uses Caldearte, and it's what will one day say
// "ready for the next phase" — leaving the free tiers, the community
// layer, a second country, and whether this could ever be an income for
// Camila and Daniel. Framed as momentum, not vanity: value now, net
// change over a fixed 30-day window (independent of the period toggle
// below, so the number means the same thing every visit), and a
// cumulative 90-day sparkline so a flat line is visibly flat. Inline SVG
// rather than recharts — three tiny lines don't need the ssr:false
// dynamic-import dance the real charts need, and they render on the
// server.
function Sparkline({ series }: { series: SignalSeriesPoint[] }) {
  const width = 160;
  const height = 36;
  if (series.length < 2) {
    return <div className="h-[36px] w-[160px] border-b border-dashed border-text-primary/20" aria-hidden />;
  }
  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (series.length - 1);
  const points = series.map((p, i) => `${(i * step).toFixed(1)},${(height - 2 - ((p.value - min) / span) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <polyline points={points} fill="none" stroke="#ff00fb" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function formatShortDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "UTC" });
}

function DeltaLabel({ signal }: { signal: AudienceSignal }) {
  // Prefer the fixed 30-day window; a series too young for it shows its
  // growth since the first data point instead, dated so it's not
  // mistaken for a 30-day figure.
  const delta = signal.delta30d ?? signal.sinceStart?.delta ?? null;
  const suffix = signal.delta30d !== null ? `en ${SIGNAL_WINDOW_DAYS} días` : signal.sinceStart ? `desde el ${formatShortDate(signal.sinceStart.date)}` : null;
  if (delta === null || suffix === null) return <span className="font-geist text-[12px] text-text-primary/40">sin datos todavía</span>;
  if (delta === 0) return <span className="font-geist text-[12px] text-text-primary/50">sin cambio {suffix}</span>;
  const positive = delta > 0;
  return (
    <span className={`font-geist text-[12px] ${positive ? "text-brand-magenta" : "text-text-primary/60"}`}>
      {positive ? "+" : ""}
      {delta.toLocaleString("es-CL")} {suffix}
    </span>
  );
}

function SignalTile({ label, hint, signal }: { label: string; hint: string; signal: AudienceSignal }) {
  return (
    <div className="flex flex-col gap-2 min-w-[200px]">
      <span className="font-fragment-mono uppercase text-[12px] tracking-wide text-text-primary/70">{label}</span>
      <span className="font-fragment-mono text-[48px] leading-none text-text-primary">{signal.value !== null ? signal.value.toLocaleString("es-CL") : "—"}</span>
      <DeltaLabel signal={signal} />
      <Sparkline series={signal.series} />
      <span className="font-geist text-[12px] text-text-primary/50">{hint}</span>
    </div>
  );
}

export default function AudienceSignals({ signals }: { signals: AudienceSignalsData }) {
  return (
    <section className="border-2 border-brand-magenta rounded-sm p-6 md:p-8 bg-white">
      <div className="flex flex-col gap-1 mb-6">
        <h2 className="font-fragment-mono uppercase text-[18px] text-brand-magenta">Señales de uso</h2>
        <p className="font-geist text-[14px] text-text-primary/70 max-w-[640px]">
          Todo lo demás en este panel mide la máquina. Estas tres miden si alguien usa Caldearte — y son las que van a decir
          cuándo estamos listos para la siguiente fase.
        </p>
      </div>
      <div className="flex flex-wrap gap-10 md:gap-16">
        <SignalTile label="Seguidores en Instagram" hint="@caldearte.oficial, último snapshot semanal" signal={signals.followers} />
        <SignalTile label="Suscriptores al newsletter" hint="confirmados y activos (doble opt-in)" signal={signals.subscribers} />
        <SignalTile label="Expos enviadas por espacios" hint="vía /agrega-tu-expo, incluye las quitadas después" signal={signals.submissions} />
      </div>
    </section>
  );
}
