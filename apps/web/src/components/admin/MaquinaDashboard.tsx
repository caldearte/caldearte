import type { AdminAnalyticsPayload } from "@/lib/adminAnalytics";
import { costSummary, outOfScope30d, recentRuns, safetyNetSummary, sourcesNeedingAttention, type CostSummary } from "@/lib/maquina";
import SourceComparisonTable from "./SourceComparisonTable";

// /admin/maquina (Daniel, 2026-10-25): fuentes + costos + modelo sombra
// in one page, reduced to what you can act on. Plain server-rendered
// markup with no period toggle; the logic lives in lib/maquina.ts
// (tested). The daily digest email already reports each day's runs, so
// this is the look-back, not the alarm.

const ENTRYPOINT_LABELS: Record<string, string> = {
  event_discovery: "Web",
  headless: "Headless",
  instagram: "Instagram",
  google_alerts: "Google Alerts",
};

function usd(n: number): string {
  return `US$${n.toFixed(2)}`;
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "America/Santiago" });
}

function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
}

function Meter({ used, cap }: { used: number; cap: number }) {
  const ratio = cap > 0 ? used / cap : 0;
  return (
    <div className="h-[6px] w-full bg-text-primary/10 rounded-full overflow-hidden">
      <div className={`h-full ${ratio >= 1 ? "bg-red-700" : ratio >= 0.8 ? "bg-[#d9a441]" : "bg-brand-magenta"}`} style={{ width: `${Math.min(100, ratio * 100).toFixed(1)}%` }} />
    </div>
  );
}

function CostTiles({ cost }: { cost: CostSummary }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="flex flex-col gap-2 bg-white rounded-sm p-5">
        <span className="font-fragment-mono uppercase text-[12px] tracking-wide text-text-primary/70">Anthropic · este mes</span>
        <span className="font-fragment-mono text-[36px] leading-none text-text-primary">{usd(cost.anthropicMonthUsd)}</span>
        {cost.anthropicBudgetUsd !== null ? (
          <>
            <Meter used={cost.anthropicMonthUsd} cap={cost.anthropicBudgetUsd} />
            <span className="font-geist text-[12px] text-text-primary/60">de {usd(cost.anthropicBudgetUsd)} de techo (el curador se detiene al llegar)</span>
          </>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 bg-white rounded-sm p-5">
        <span className="font-fragment-mono uppercase text-[12px] tracking-wide text-text-primary/70">Apify · ciclo desde el {shortDate(`${cost.apifyCycleStart}T12:00:00Z`)}</span>
        <span className="font-fragment-mono text-[36px] leading-none text-text-primary">{usd(cost.apifyCycleUsd)}</span>
        <Meter used={cost.apifyCycleUsd} cap={cost.apifyCreditUsd} />
        <span className="font-geist text-[12px] text-text-primary/60">
          de {usd(cost.apifyCreditUsd)} de crédito del plan{cost.apifyExcessUsd > 0 ? ` · ${usd(cost.apifyExcessUsd)} de exceso facturado` : ""}
        </span>
      </div>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-sm overflow-x-auto">
      <table className="w-full font-geist text-[14px] text-text-primary">
        <thead>
          <tr className="text-left font-fragment-mono uppercase text-[12px] text-text-primary/60">
            {head.map((h) => (
              <th key={h} className="py-3 px-4 font-normal whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary">{title}</h2>
        {hint ? <p className="font-geist text-[14px] text-text-primary/70 max-w-[680px]">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function MaquinaDashboard({ data, now }: { data: AdminAnalyticsPayload; now: Date }) {
  const cost = costSummary(data, now);
  const attention = sourcesNeedingAttention(data);
  const runs = recentRuns(data.discoveryRunSummaries, now);
  const runProblems = runs.filter((r) => r.problem).length;
  const net = safetyNetSummary(data.shadowCurationComparisons, now);
  const outOfScope = outOfScope30d(data.outOfScopeSignals, now);

  return (
    <div className="flex flex-col gap-12">
      <Section title="Gasto">
        <CostTiles cost={cost} />
        <details className="bg-white rounded-sm p-5">
          <summary className="font-fragment-mono uppercase text-[12px] text-text-primary/70 cursor-pointer">Últimos 6 meses</summary>
          <table className="w-full font-geist text-[14px] text-text-primary mt-4">
            <thead>
              <tr className="text-left font-fragment-mono uppercase text-[12px] text-text-primary/60">
                <th className="py-2 pr-4 font-normal">Mes</th>
                <th className="py-2 pr-4 font-normal text-right">Anthropic</th>
                <th className="py-2 font-normal text-right">Apify (uso bruto)</th>
              </tr>
            </thead>
            <tbody>
              {cost.byMonth.map((m) => (
                <tr key={m.month} className="border-t border-text-primary/10">
                  <td className="py-2 pr-4">{m.month}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{usd(m.anthropicUsd)}</td>
                  <td className="py-2 text-right tabular-nums">{usd(m.apifyUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Section>

      <Section
        title={`Fuentes que requieren atención (${attention.length})`}
        hint="Fuentes que se leen pero nunca han dejado un solo candidato (ni aprobado ni rechazado): candidatas a revisar o quitar. Las cuentas desactivadas a propósito no aparecen."
      >
        {attention.length === 0 ? (
          <p className="font-geist text-[14px] text-text-primary/60">Ninguna por ahora.</p>
        ) : (
          <Table head={["Fuente", "Tipo", "Última lectura"]}>
            {attention.map((s) => (
              <tr key={s.label} className="border-t border-text-primary/10">
                <td className="py-2 px-4 max-w-[360px] truncate" title={s.label}>
                  {s.label}
                </td>
                <td className="py-2 px-4">{s.category}</td>
                <td className="py-2 px-4 whitespace-nowrap text-text-primary/70">{shortDate(s.lastFetchedAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section
        title={`Corridas de los últimos 7 días${runProblems > 0 ? ` · ${runProblems} con problemas` : ""}`}
        hint="Una fila por corrida. Se marcan las que tuvieron inserciones fallidas o no encontraron nada."
      >
        <Table head={["Corrida", "Fuente", "Candidatos", "Publicados", "Costo", "Problema"]}>
          {runs.map((r) => (
            <tr key={`${r.entrypoint}-${r.startedAt}`} className={`border-t border-text-primary/10 ${r.problem ? "bg-brand-magenta/5" : ""}`}>
              <td className="py-2 px-4 whitespace-nowrap">{shortDateTime(r.startedAt)}</td>
              <td className="py-2 px-4">{ENTRYPOINT_LABELS[r.entrypoint] ?? r.entrypoint}</td>
              <td className="py-2 px-4 text-right tabular-nums">{r.candidates}</td>
              <td className="py-2 px-4 text-right tabular-nums">{r.inserted}</td>
              <td className="py-2 px-4 text-right tabular-nums">{usd(r.costUsd)}</td>
              <td className="py-2 px-4 text-red-700">{r.problem ?? ""}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section
        title="Red de seguridad"
        hint="Un segundo modelo relee las aprobaciones de Haiku (Instagram y web); si las rechaza por alcance, no se publican. Cuenta comparaciones (una por fuente o tanda), últimos 30 días."
      >
        <div className="bg-white rounded-sm p-5 flex flex-col gap-3">
          <p className="font-geist text-[15px] text-text-primary">
            {net.reviewed} comparaciones · <b>{net.vetoes} con veto</b>
            {net.errors > 0 ? ` · ${net.errors} sin respuesta del segundo modelo (quedó la decisión de Haiku)` : ""}
          </p>
          <p className="font-geist text-[13px] text-text-primary/70">
            {net.byPipeline.map((p) => `${p.pipeline === "instagram" ? "Instagram" : "Web"}: ${p.reviewed} comparaciones, ${p.vetoes} con veto`).join(" · ")}
          </p>
          {net.latestVetoes.length > 0 ? (
            <ul className="flex flex-col gap-2 font-geist text-[13px] text-text-primary/80">
              {net.latestVetoes.map((v) => (
                <li key={`${v.createdAt}-${v.label}`}>
                  <span className="text-text-primary/50">
                    {shortDate(v.createdAt)} · {v.pipeline === "instagram" ? "Instagram" : "Web"}
                  </span>{" "}
                  · {v.label}
                  {v.reasoning ? <span className="text-text-primary/60"> — {v.reasoning.slice(0, 160)}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Section>

      <Section title="Aprobación y costo por fuente" hint="Histórico completo: cuánto de lo que lee cada fuente pasa la curaduría, y cuánto cuesta cada evento publicado.">
        <div className="bg-white rounded-sm p-5">
          <SourceComparisonTable comparison={data.pipelineComparison} />
        </div>
      </Section>

      <Section title="Señales fuera de alcance">
        <p className="font-geist text-[14px] text-text-primary/80">
          Últimos 30 días: {outOfScope.length > 0 ? outOfScope.map((o) => `${o.label} ${o.count}`).join(" · ") : "ninguna"}. Se siguen guardando para una
          futura decisión sobre ampliar el alcance.
        </p>
      </Section>
    </div>
  );
}
