"use client";

import { useMemo } from "react";
import type { AdminAnalyticsPayload } from "@/lib/adminAnalytics";
import CadenciaSummaryBar, { type CadenciaTier } from "./CadenciaSummaryBar";
import CadenciaSourceList, { type CadenciaSourceRow } from "./CadenciaSourceList";

// Cadencia de TODAS las fuentes brillantes — Daniel 2026-08-23, 2do
// ajuste: "no quiero ver todo eso, solo el número de cadencia, y en la
// lista de cada cadencia ponle si es IG, web, etc". El origen se muestra
// como etiqueta en cada fila (CadenciaSourceList), no como sección
// propia.
//
// Colapsado a 2 tramos, 2026-08-24: la escalera Instagram (7/14/21/28/
// semestral) se reemplazó por una cadencia plana semanal para todas las
// cuentas (ver instagram-fetch-state.ts) — real, no ahorraba lo que se
// pensaba, ya que Apify cobra por resultado devuelto, no por cuenta
// consultada, así que una cuenta silenciosa cuesta ~$0 sin importar la
// frecuencia de chequeo. Con eso, los tramos intermedios quedan siempre
// vacíos — solo "semanal" e "inactivas" tienen sentido ahora.
const TIERS: Array<{ key: string; label: string }> = [
  { key: "7", label: "Semanal (7d)" },
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
      // categorías, y desde 2026-08-24 ninguna fuente (ni siquiera
      // Instagram) tiene cadencia real — todas corren cada semana, así
      // que siempre caen en el piso.
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
            <strong>Cuentas cerca del año sin nada nuevo</strong> (`consecutiveZeroYieldAtCap` alto, sin llegar aún a inactiva) —
            candidatas a revisar manualmente antes de que se marquen inactivas solas.
          </li>
          <li>
            <strong>Volumen nacional de inauguraciones por semana</strong>, antes vs. después de pasar a cadencia plana semanal
            (2026-08-24) — la métrica que originó este ajuste.
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
