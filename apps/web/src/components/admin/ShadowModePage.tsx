"use client";

import { useMemo } from "react";

export interface ShadowComparisonRow {
  createdAt: string;
  pipeline: "bright_source" | "instagram";
  label: string;
  model: string;
  realStatus: "approved" | "rejected" | "empty";
  shadowStatus: "approved" | "rejected" | "empty" | "error";
  agree: boolean;
  realTags: string[];
  shadowTags: string[];
  error: string | null;
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

// Piloto de comparación de modelos (Daniel, 2026-09-04): resume cuántas
// veces el modelo sombra (gratis, vía OpenRouter) coincidió con la
// decisión real de Haiku sobre el MISMO input, en las corridas reales de
// producción — no una muestra reconstruida como el script offline
// (scripts/compare-haiku-qwen.ts). Últimos 90 días, sin bucketing por
// período (volumen real es bajo, un puñado por corrida) — se muestran
// las filas directamente, más recientes primero.
export default function ShadowModePage({ comparisons }: { comparisons: ShadowComparisonRow[] }) {
  const summary = useMemo(() => {
    const byPipeline = new Map<string, { total: number; agree: number; errors: number }>();
    let totalAgree = 0;
    let totalErrors = 0;
    for (const row of comparisons) {
      const bucket = byPipeline.get(row.pipeline) ?? { total: 0, agree: 0, errors: 0 };
      bucket.total += 1;
      if (row.shadowStatus === "error") bucket.errors += 1;
      else if (row.agree) bucket.agree += 1;
      byPipeline.set(row.pipeline, bucket);
      if (row.shadowStatus === "error") totalErrors += 1;
      else if (row.agree) totalAgree += 1;
    }
    const nonErrorTotal = comparisons.length - totalErrors;
    return {
      total: comparisons.length,
      agreementRate: nonErrorTotal > 0 ? totalAgree / nonErrorTotal : null,
      errorRate: comparisons.length > 0 ? totalErrors / comparisons.length : null,
      byPipeline: [...byPipeline.entries()].map(([pipeline, s]) => ({
        pipeline,
        total: s.total,
        agreementRate: s.total - s.errors > 0 ? s.agree / (s.total - s.errors) : null,
        errorRate: s.total > 0 ? s.errors / s.total : null,
      })),
    };
  }, [comparisons]);

  const disagreements = comparisons.filter((row) => !row.agree && row.shadowStatus !== "error");
  const model = comparisons[0]?.model ?? null;

  if (comparisons.length === 0) {
    return (
      <p className="font-geist text-[14px] text-text-primary/70">
        Sin comparaciones todavía — el modo sombra corre en la próxima corrida real (fuentes brillantes / Instagram) una vez cargado el secret{" "}
        <code className="font-fragment-mono">OPENROUTER_API_KEY</code> en GitHub Actions.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-2">
        <p className="font-geist text-[14px] text-text-primary/70">
          Modelo sombra actual: <span className="font-fragment-mono">{model}</span> — últimos 90 días, {summary.total} comparaciones.
        </p>
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="font-lato font-black text-[32px] leading-none text-brand-magenta">{formatPercent(summary.agreementRate)}</p>
            <p className="font-geist text-[13px] text-text-primary/60">Acuerdo con Haiku (excluye errores)</p>
          </div>
          <div>
            <p className="font-lato font-black text-[32px] leading-none text-brand-magenta">{formatPercent(summary.errorRate)}</p>
            <p className="font-geist text-[13px] text-text-primary/60">Tasa de error del modelo sombra (rate limit, JSON roto, etc.)</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-lato font-black text-[18px] text-text-primary">Por pipeline</h2>
        <table className="w-full font-geist text-[14px] text-text-primary border-collapse">
          <thead>
            <tr className="text-left border-b border-text-primary/20">
              <th className="py-2 pr-4">Pipeline</th>
              <th className="py-2 pr-4 text-right">Comparaciones</th>
              <th className="py-2 pr-4 text-right">Acuerdo</th>
              <th className="py-2 pr-4 text-right">Errores</th>
            </tr>
          </thead>
          <tbody>
            {summary.byPipeline.map((row) => (
              <tr key={row.pipeline} className="border-b border-text-primary/10">
                <td className="py-2 pr-4">{row.pipeline}</td>
                <td className="py-2 pr-4 text-right">{row.total}</td>
                <td className="py-2 pr-4 text-right">{formatPercent(row.agreementRate)}</td>
                <td className="py-2 pr-4 text-right">{formatPercent(row.errorRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-lato font-black text-[18px] text-text-primary">
          Desacuerdos ({disagreements.length}) — para revisión manual
        </h2>
        {disagreements.length === 0 ? (
          <p className="font-geist text-[14px] text-text-primary/70">Ninguno todavía.</p>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full font-geist text-[13px] text-text-primary border-collapse">
              <thead className="sticky top-0 bg-surface-sage">
                <tr className="text-left border-b border-text-primary/20">
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Pipeline</th>
                  <th className="py-2 pr-4">Fuente</th>
                  <th className="py-2 pr-4">Haiku</th>
                  <th className="py-2 pr-4">Sombra</th>
                  <th className="py-2 pr-4">Tags Haiku</th>
                  <th className="py-2 pr-4">Tags sombra</th>
                </tr>
              </thead>
              <tbody>
                {disagreements.map((row, i) => (
                  <tr key={i} className="border-b border-text-primary/10">
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                    <td className="py-2 pr-4">{row.pipeline}</td>
                    <td className="py-2 pr-4 max-w-[280px] truncate" title={row.label}>
                      {row.label}
                    </td>
                    <td className="py-2 pr-4">{row.realStatus}</td>
                    <td className="py-2 pr-4">{row.shadowStatus}</td>
                    <td className="py-2 pr-4">{row.realTags.join(", ") || "—"}</td>
                    <td className="py-2 pr-4">{row.shadowTags.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
