"use client";

import { useMemo } from "react";
import type { AdminAnalyticsPayload } from "@/lib/adminAnalytics";
import CadenciaSummaryBar, { type CadenciaTier } from "./CadenciaSummaryBar";
import CadenciaSourceList, { type CadenciaSourceRow } from "./CadenciaSourceList";

// Cadencia de TODAS las fuentes brillantes, en UNA sola escalera —
// Daniel 2026-08-23, 2do ajuste: la primera versión separaba Instagram
// (cadencia adaptativa real) de las otras 3 categorías (cadencia fija de
// 7 días) en dos secciones distintas — "no quiero ver todo eso, solo el
// número de cadencia, y en la lista de cada cadencia ponle si es IG,
// web, etc". Ahora el tramo (7/14/21/28/182/inactiva) es el único eje de
// agrupación, sin importar el origen; el origen se muestra como etiqueta
// en cada fila (CadenciaSourceList). Las 3 categorías no-Instagram no
// escalan nunca (cadencia fija, interval_days queda NULL en la tabla),
// así que siempre caen en el tramo de 7 días junto con las cuentas de
// Instagram que también estén ahí.
const TIERS: Array<{ key: string; label: string }> = [
  { key: "7", label: "Semanal (7d)" },
  { key: "14", label: "Cada 2 semanas (14d)" },
  { key: "21", label: "Cada 3 semanas (21d)" },
  { key: "28", label: "Mensual — tope (28d)" },
  { key: "182", label: "Semestral (182d)" },
  { key: "inactive", label: "Inactivas" },
];

const CATEGORY_LABEL: Record<AdminAnalyticsPayload["brightSources"][number]["category"], CadenciaSourceRow["category"]> = {
  bright_source: "Web",
  headless: "Headless",
  google_alerts: "Google Alerts",
};

export default function CadenciaPage({
  instagramSources,
  brightSources,
}: {
  instagramSources: AdminAnalyticsPayload["instagramSources"];
  brightSources: AdminAnalyticsPayload["brightSources"];
}) {
  const bucketed = useMemo(() => {
    const buckets = new Map<string, CadenciaSourceRow[]>(TIERS.map((t) => [t.key, []]));
    for (const source of instagramSources) {
      const key = source.isInactive ? "inactive" : String(source.intervalDays ?? 7);
      const bucket = buckets.get(key) ?? buckets.get("7")!; // un intervalo fuera de la escalera conocida cae en el piso, no se pierde
      bucket.push({
        label: `@${source.username}`,
        category: "Instagram",
        lastFetchedAt: source.lastFetchedAt,
        accepted: source.accepted,
        rejected: source.rejected,
        isInactive: source.isInactive,
        consecutiveZeroYieldAtCap: source.consecutiveZeroYieldAtCap,
      });
    }
    for (const source of brightSources) {
      // Nunca escalan — interval_days queda NULL en la tabla para estas 3
      // categorías (isSourceDue usa un intervalo fijo de 7 días, ver
      // event-discovery/run.ts), así que siempre caen en el piso.
      const bucket = buckets.get("7")!;
      bucket.push({
        label: source.url,
        category: CATEGORY_LABEL[source.category],
        lastFetchedAt: source.lastFetchedAt,
        accepted: source.accepted,
        rejected: source.rejected,
        isInactive: false,
        consecutiveZeroYieldAtCap: 0,
      });
    }
    return buckets;
  }, [instagramSources, brightSources]);

  const total = instagramSources.length + brightSources.length;
  const tiers: CadenciaTier[] = [
    { key: "total", label: "Total fuentes", count: total },
    ...TIERS.map((t) => ({ key: t.key, label: t.label, count: bucketed.get(t.key)?.length ?? 0 })),
  ];

  return (
    <div className="flex flex-col gap-12">
      <section>
        <CadenciaSummaryBar tiers={tiers} />
      </section>

      <section className="flex flex-col gap-4">
        {TIERS.map((tier) => (
          <details key={tier.key} className="border-b border-text-primary/10 pb-4">
            <summary className="cursor-pointer font-fragment-mono uppercase text-[16px] text-text-primary py-2">
              {tier.label} <span className="text-text-primary/50">({bucketed.get(tier.key)?.length ?? 0})</span>
            </summary>
            <div className="mt-2">
              <CadenciaSourceList sources={bucketed.get(tier.key) ?? []} />
            </div>
          </details>
        ))}
      </section>

      <section className="border-t border-text-primary/10 pt-8">
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Qué medir a futuro</h2>
        <ul className="font-geist text-[14px] text-text-primary/80 flex flex-col gap-2 list-disc pl-5">
          <li>
            <strong>Costo real por evento aportado</strong>, cruzando esta tabla con Apify (`/admin/costos`) — detecta fuentes caras
            que casi no producen eventos reales.
          </li>
          <li>
            <strong>Reseteos por ruido</strong> (solo Instagram, la única categoría que escala): cuántas veces una cuenta vuelve al
            piso (7d) por un post nuevo que Haiku termina rechazando, no aprobando — si es frecuente, el criterio de &quot;actividad
            nueva&quot; debería basarse en aprobados, no en posts vistos.
          </li>
          <li>
            <strong>Dónde se estabiliza cada cuenta de Instagram con el tiempo</strong> — si la mayoría termina en 28d+ rápido, el
            piso de 7 fue caro sin mucho beneficio real; si muchas se quedan en 7, confirma que valió la pena.
          </li>
          <li>
            <strong>Volumen nacional de inauguraciones por semana</strong>, antes vs. después del cambio de piso (14→7d,
            2026-08-23) — la métrica que originó este ajuste.
          </li>
          <li>
            <strong>Google Alerts sin yield atribuible por dominio</strong> — su calidad se mide a nivel de pipeline completo (una
            sola fuente, muchos dominios distintos), no por fuente individual como el resto.
          </li>
        </ul>
      </section>
    </div>
  );
}
